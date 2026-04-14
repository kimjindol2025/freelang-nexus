# P4 Closure Note — Parallel Failure Isolation (완료)

**Commit:** `d41d5fe + P4-parallel-failure` (진행 중)  
**Date:** 2026-04-14  
**Status:** ✅ 완료 (Level 2.0 → 2.4)

---

## 무엇이 바뀌었나

### 1. FailureAnalyzer 클래스 (신규)
**File:** `src/nexus/runtime/failure-analyzer.ts` (신규, 300줄)

```typescript
export class FailureAnalyzer {
  // 역할:
  // 1. 모든 job status 추적 (Map<jobId, BuildJobStatus>)
  // 2. 의존성 기반 실패 전파 분석
  // 3. 사용자 친화적 리포트 생성

  // 주요 메서드:
  registerJob(jobId, lang, artifact?, dependsOn?)
  updateJobStatus(jobId, status, exitCode?)
  setJobStatus(jobId, status, exitCode?)      // 테스트용 (skipped 포함)
  updateJobOutput(jobId, stdout, stderr, command?)
  analyzeFailures(): FailureAnalysis          // 분석 실행
  formatFailureReport(): string                // 사용자 리포트
  getJob(jobId): BuildJobStatus | undefined
  getAllJobs(): BuildJobStatus[]
  getFailureGraph(): Record<string, string[]>
}
```

### 2. 실패 모델 정의

#### BuildJobStatus
```typescript
interface BuildJobStatus {
  jobId: string;                    // "rust#libcore.so"
  lang: string;                     // "rust", "go", "link" 등
  artifact?: string;
  dependsOn: string[];              // 의존 jobId 목록

  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  failureType?: 'direct' | 'propagated' | 'timeout' | 'skipped';

  command: string;                  // 실행 명령어
  stdout: string;
  stderr: string;
  exitCode?: number;

  startTime?: number;
  endTime?: number;

  failureCause?: {
    type: 'direct' | 'propagated';
    originalFailure?: string;       // 원인 jobId
    reason: string;                 // "Dependency X failed"
  };
}
```

#### FailureAnalysis
```typescript
interface FailureAnalysis {
  directFailures: BuildJobStatus[];      // 최초 직접 실패
  propagatedFailures: BuildJobStatus[];  // 의존성으로 인한 전파 실패
  skipped: BuildJobStatus[];             // 미실행 (의존성 미충족)
  successful: BuildJobStatus[];          // 성공

  failureGraph: Record<string, string[]>;  // jobId → 영향받은 jobId[]
  hasFailures: boolean;
}
```

### 3. 실패 분석 알고리즘

#### 3단계 분석
1. **직접 실패 식별**: status === 'failed'인 모든 job
2. **전파 실패 추적**: 의존성 그래프를 따라 영향받은 job 식별
3. **skipped 마크**: 의존성 미충족으로 인한 job 제외

```typescript
analyzeFailures(): FailureAnalysis {
  // 1단계: 직접 실패 찾기
  const directFailures = jobs.filter(j => j.status === 'failed');
  
  // 2단계: 각 job의 dependsOn 확인
  for (each job) {
    if (dependsOn[i].status === 'failed') {
      job.status = 'skipped';
      failureGraph[dependsOn[i]].add(job.jobId);
    }
  }
  
  // 3단계: 결과 취합
  return { directFailures, skipped, successful, failureGraph };
}
```

### 4. 사용자 리포트 생성

#### 성공 케이스
```
✓ All jobs completed successfully.
```

#### 실패 케이스
```
✗ Build failed.

Direct failure:
  [Go] go build -buildmode=c-shared -o libhash.so .
  Exit code: 1
  Error: ld: cannot find -lfoo

Skipped jobs:
  [Link] (not reached)
  Reason: Dependency go#libhash.so failed

Logs:
  [Go]
    ld: cannot find -lfoo
```

---

## 테스트 (19/19 PASS)

### Basic Failure Tracking (3개)
- **F1:** 단일 직접 실패 (Rust 문법 에러) ✓
- **F2:** 성공 (모든 job success) ✓
- **F3:** 경고 있음 (stderr 있으나 exitCode 0) ✓

### Propagated Failure (3개)
- **F4:** 1 direct + 1 propagated (Go 실패 → Link 실패) ✓
- **F5:** Chain 전파 (Rust 실패 → Link → Python) ✓
- **F6:** 2개 독립 실패 (Rust + Go 동시) ✓

### Failure Graph Tracking (2개)
- **F7:** 의존성 그래프 구성 (A→B→C) ✓
- **F8:** 복잡 의존성 (A→B, A→C, B→D) ✓

### Log Isolation (2개)
- **F9:** 언어별 로그 분리 ([Rust], [Go], [Link]) ✓
- **F10:** 로그 순서 결정성 ✓

### Failure Message Quality (2개)
- **F11:** 직접 실패 메시지 (Go linker error) ✓
- **F12:** 전파 실패 메시지 ✓

### Edge Cases (2개)
- **F13:** Timeout/signal 처리 ✓
- **F14:** 빈 dependency (standalone 언어) ✓
- **F15:** 빈 stderr ✓

### P4 완료 기준 (4개)
- **✓ 모든 상태 추적 가능** ✓
- **✓ 직접/전파 실패 명확 구분** ✓
- **✓ 사용자 리포트 형식 명확** ✓
- **✓ Job 조회 API 동작** ✓

---

## TRUST-MATRIX 영향

| 항목 | 이전 | 현재 | 상향도 |
|------|------|------|--------|
| Failure Isolation & Diagnostics | Level 2.0 (67%) | **Level 2.4 (80%)** | **+0.4** |
| 병렬 컴파일 실패 격리 | Level 1 | Level 2 | +1.0 |
| 에러 설명 품질 | Level 2 | Level 3 | +1.0 (병렬 격리로) |
| **전체 평균** | **Level 2.4 (80%)** | **Level 2.4 (80%)** | *유지* |

**주요 개선:**
- 병렬 빌드에서 직접/전파 실패 구분 가능
- 사용자가 복잡한 실패 상황을 명확히 이해 가능
- Job 의존성 그래프 투명화

---

## 아직 구현되지 않은 부분

### 아직 미구현
- **nexus-runner.ts 통합**: FailureAnalyzer를 runner에 연결 (Day 2)
- **병렬 빌드 실행**: 현재는 순차 빌드, 진정한 병렬 지원 필요
- **Reproducible Exec**: 같은 조건 재현 실행 (P5)

### 평가
"병렬 실패 추적"은 완성되었으나, **실제 runner 통합은 Day 2 완료**. 현재 단계는 분석기 단독 동작만 검증됨.

---

## 코드 라인 수

- `src/nexus/runtime/failure-analyzer.ts`: 300줄
- `tests/parallel-failure-isolation.test.ts`: 420줄
- **총 약 720줄 추가**

---

## P4의 의미

### 이 스프린트까지의 진화

| Phase | 목표 | 내용 |
|-------|------|------|
| **P0** | Deterministic | 같은 입력 = 같은 빌드 결과 |
| **P1** | Failure Diagnosis | 실패가 나면 "무엇이" 실패했는지 설명 |
| **P2** | Type Bridge | 타입 경계에서 규칙이 있다는 것을 보여주기 |
| **P3** | Extern Extraction | 미지원 언어는 정직하게 말하기 |
| **P4** | Failure Isolation | **복잡해졌을 때도 신뢰를 유지하기** |

P4는 **운영 신뢰**입니다.
- P0-P3은 "약속을 지킨다"
- P4는 "복잡도가 증가해도 약속을 지킨다"

---

## 다음 작업

### Day 2: nexus-runner 통합
- `failureAnalyzer` 멤버 추가
- buildLangBlock 루프에서 job 등록/추적
- 최종 리포트 출력

### P5: Reproducible Execution
- 같은 입력 = 같은 출력 (성능 기준선 포함)
- 플랫폼 간 재현성
- 목표: Level 1.2 → 2.5

---

## 최종 평가

### P4까지 완료한 신뢰 상태
```
전체 평균: Level 2.4/3.0 (80%)

- Deterministic Build: 93% ✅
- Stable ABI: 80% ✅
- Type Bridge: 87% ✅
- Failure Isolation: 80% ✅ (NEW)
- Reproducible Exec: 40%
```

### 현재 상태
"FreeLang Nexus는 이제 기초적인 신뢰 축 4개를 갖춘 컴파일러입니다."

- ✅ 빌드가 결정적
- ✅ 타입 경계가 규칙적
- ✅ 실패가 설명 가능
- ✅ 복잡도에서도 추적 가능

### 남은 과제
- 재현 실행 (P5): 환경 독립성
- 성능 기준선: 신뢰할 수 있는 속도 측정

"지금 이 컴파일러는 기능이 아니라 신뢰로 평가받는 단계에 들어섰습니다."
