# P4 Plan — Parallel Failure Isolation

**목표 문장:**  
병렬 빌드에서 직접 실패와 전파 실패를 구분하고, 언어별 로그를 격리해 실패 원인을 설명 가능하게 만든다.

**범위:** 병렬 빌드 실패 추적만 (재현 실행은 P5)  
**예상 기간:** 2일  
**테스트:** 12-15개

---

## 1. 실패 모델 정의

### BuildJobStatus
```typescript
interface BuildJobStatus {
  jobId: string;                    // "rust#libcore.so"
  lang: string;                     // "rust"
  artifact?: string;                // "libcore.so"
  dependsOn: string[];              // ["go#libhash.so"]
  
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  failureType?: 'direct' | 'propagated' | 'timeout';
  
  command: string;                  // "rustc --crate-type cdylib ..."
  startTime?: number;               // Date.now()
  endTime?: number;
  
  stdout: string;
  stderr: string;
  exitCode?: number;
  
  failureCause?: {
    type: 'direct' | 'propagated';
    originalFailure?: string;       // jobId of original failure
    reason: string;                 // "Go build failed"
  };
}
```

### FailureAnalysis
```typescript
interface FailureAnalysis {
  directFailures: BuildJobStatus[];      // 최초 직접 실패들
  propagatedFailures: BuildJobStatus[];  // 의존성으로 인한 전파 실패
  skipped: BuildJobStatus[];             // 미실행 (의존성 미충족)
  successful: BuildJobStatus[];          // 성공
  
  failureGraph: {
    [jobId: string]: string[]            // jobId → 이로 인해 실패한 jobId[]
  };
}
```

---

## 2. 구현 계획

### Phase A (Day 1): 실패 모델 + 추적
**파일:** `src/nexus/runtime/failure-analyzer.ts` (신규)

```typescript
export class FailureAnalyzer {
  // 모든 job status 추적
  private jobs: Map<string, BuildJobStatus> = new Map();
  
  // job을 시작할 때 호출
  registerJob(jobId: string, lang: string, artifact?: string, dependsOn?: string[]): void
  
  // job 실행 중/실행 후 상태 업데이트
  updateJobStatus(jobId: string, status: 'running' | 'success' | 'failed', exitCode?: number): void
  updateJobOutput(jobId: string, stdout: string, stderr: string): void
  
  // 의존성 기반 실패 전파 분석
  analyzeFailures(): FailureAnalysis
  
  // 사용자 출력 형식
  formatFailureReport(): string
}
```

**작업:**
1. FailureAnalyzer 클래스 구현 (약 150줄)
2. nexus-runner.ts에서 buildLangBlock 루프를 이용해 job 추적 시작
3. 각 lang 빌드마다 registerJob + updateJobStatus 호출

### Phase B (Day 2): nexus-runner 연결 + 리포트
**파일:** `src/nexus/runtime/nexus-runner.ts` (수정)

```typescript
// nexus-runner.ts 내부에 추가
private failureAnalyzer: FailureAnalyzer = new FailureAnalyzer();

async run(program: AST.Program): Promise<string[]> {
  // 1. topologicalSort로 빌드 순서 결정
  const sortedBlocks = this.dependencyGraph.topologicalSort();
  
  // 2. 각 block을 job으로 등록
  for (const block of sortedBlocks) {
    const jobId = `${block.lang}#${block.artifact || 'unnamed'}`;
    const deps = block.dependsOn?.map(dep => `${dep}#...`) || [];
    this.failureAnalyzer.registerJob(jobId, block.lang, block.artifact, deps);
  }
  
  // 3. 순차/병렬 빌드 (기존 로직)
  for (const block of sortedBlocks) {
    const jobId = `${block.lang}#${block.artifact || 'unnamed'}`;
    
    try {
      this.failureAnalyzer.updateJobStatus(jobId, 'running');
      
      // 빌드 실행
      const result = await this.buildLangBlock(block);
      
      this.failureAnalyzer.updateJobOutput(jobId, result.stdout, result.stderr);
      this.failureAnalyzer.updateJobStatus(jobId, 'success');
      
    } catch (e) {
      this.failureAnalyzer.updateJobOutput(jobId, e.stdout || '', e.stderr || '');
      this.failureAnalyzer.updateJobStatus(jobId, 'failed', e.exitCode);
      
      // 의존 job들을 skipped로 처리 (옵션: 계속 빌드할지 중단할지)
      // 현재는 모두 skipped로 마크
    }
  }
  
  // 4. 최종 분석 및 리포트
  const analysis = this.failureAnalyzer.analyzeFailures();
  const report = this.failureAnalyzer.formatFailureReport();
  
  if (analysis.directFailures.length > 0) {
    console.error(report);
    process.exit(1);
  }
  
  return this.cGeneratedCode;
}
```

**작업:**
1. FailureAnalyzer 호출 통합 (nexus-runner.ts에 ~30줄)
2. formatFailureReport() 구현 (사용자 친화적 출력)
3. 테스트 12-15개 작성

---

## 3. 테스트 케이스 (12-15개)

### Basic Failure Tracking (3개)
- **F1:** 단일 직접 실패 (Rust 문법 에러)
  - 예상: "Direct failure: Rust"
  
- **F2:** 성공 (모든 job success)
  - 예상: "All jobs passed"
  
- **F3:** 경고 있음 (stderr 있으나 exitCode 0)
  - 예상: "All jobs passed (with warnings)"

### Propagated Failure (3개)
- **F4:** 1 direct + 1 propagated (Go 실패 → Link 실패)
  - 예상: "Direct: [Go]", "Propagated: [Link]"
  
- **F5:** Chain 전파 (Rust 실패 → Link 실패 → Python 실패)
  - 예상: "Direct: [Rust]", "Propagated: [Link]", "Skipped: [Python]"
  
- **F6:** 2개 독립 실패 (Rust + Go 동시)
  - 예상: "Direct failures: 2"

### Failure Graph Tracking (2개)
- **F7:** 의존성 그래프 구성 (A→B→C)
  - A 실패 시 B/C 전파 확인
  
- **F8:** 복잡 의존성 (A→B, A→C, B→D)
  - A 실패 시 B/C/D 모두 전파

### Log Isolation (2개)
- **F9:** 언어별 로그 분리 ([Rust], [Go], [Link])
  - 예상: 각 로그가 섞이지 않음
  
- **F10:** 로그 순서 결정성
  - 같은 입력 10회 실행 → stdout 순서 동일

### Failure Message Quality (2개)
- **F11:** 직접 실패 메시지 (classifyError와 통합)
  - "Direct failure: Go build"
  - "Reason: ld: cannot find -lfoo (linker error)"
  - "Suggestion: check @artifact name"
  
- **F12:** 전파 실패 메시지
  - "Propagated failure: Link"
  - "Because: libhash.so missing (Go build failed)"

### Edge Cases (2개)
- **F13:** Timeout/signal 처리
  - 예상: "Direct failure: Rust (timeout)"
  
- **F14:** 빈 dependency (standalone 언어)
  - 예상: independent job으로 처리

---

## 4. Day 1 Deliverable

### 파일 생성
```
src/nexus/runtime/failure-analyzer.ts (150줄)
  - FailureAnalyzer 클래스
  - BuildJobStatus 인터페이스
  - FailureAnalysis 인터페이스
  - formatFailureReport() 함수
```

### 코드 구조
```typescript
export class FailureAnalyzer {
  private jobs: Map<string, BuildJobStatus>;
  private dependencyGraph: Map<string, string[]>;
  
  registerJob(...): void
  updateJobStatus(...): void
  updateJobOutput(...): void
  analyzeFailures(): FailureAnalysis
  formatFailureReport(): string
  
  private markPropagatedFailures(...): void
  private buildFailureGraph(...): void
}
```

---

## 5. Day 2 Deliverable

### 파일 수정
```
src/nexus/runtime/nexus-runner.ts (~30줄)
  - failureAnalyzer 멤버 추가
  - registerJob 호출
  - updateJobStatus 호출
  - analyzeFailures + 리포트 출력
```

### 테스트 파일 생성
```
tests/parallel-failure-isolation.test.ts (300줄+, 12-15개 테스트)
  - F1-F14 테스트 케이스
  - Mock buildLangBlock 제공
  - 각 케이스별 검증
```

---

## 6. 최종 출력 형식

### 성공 케이스
```
✓ All jobs completed successfully.
```

### 실패 케이스 (직접 + 전파)
```
✗ Build failed.

Direct failure:
  [Go] go build -buildmode=c-shared -o libhash.so .
  Language: go
  Exit code: 1
  Reason: undefined: someFunc (symbol error)
  Suggestion: check function export with //export comment

Propagated failures:
  [Link] gcc -shared -o binary ...
  Because: libhash.so missing (Go build failed)

Skipped jobs:
  [Python] analyze step (not reached due to link failure)

Logs:
  [Go] error: undefined: someFunc at main.go:42
  [Link] ld: cannot find -lhash
```

---

## 7. Done 정의

- [ ] FailureAnalyzer 클래스 구현 (registerJob, updateJobStatus, analyzeFailures, formatFailureReport)
- [ ] 실패 타입 분류: direct, propagated, skipped, success
- [ ] 의존성 기반 전파 분석 (failureGraph 생성)
- [ ] nexus-runner.ts 통합 (job 추적 시작)
- [ ] 12-15개 테스트 모두 PASS
- [ ] 출력 형식 명확 (사용자가 읽기 쉬움)
- [ ] P4-CLOSURE-NOTE.md 작성
- [ ] Gogs commit + push

---

## 8. 관련 파일

**참고:**
- `src/nexus/runtime/nexus-runner.ts:100-143` — buildLangBlock 루프
- `src/nexus/runtime/dependency-graph.ts` — topologicalSort
- `src/nexus/runtime/build-error.ts` — classifyError (통합)
- `tests/deterministic-build.test.ts` — 테스트 구조 참고
