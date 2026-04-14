# P4 Runner Integration Checklist

**목표:** `nexus-runner.ts`와 `FailureAnalyzer` 통합  
**기간:** Day 2  
**최종 형태:** 병렬 빌드에서 직접/전파 실패를 명확히 구분하는 runner

---

## 1단계: Runner 상태 추적 설정

### ✓ C1: FailureAnalyzer 멤버 추가
```typescript
// src/nexus/runtime/nexus-runner.ts

private failureAnalyzer: FailureAnalyzer = new FailureAnalyzer();
```

**확인 사항:**
- [ ] import 추가 (`src/nexus/runtime/failure-analyzer.ts`)
- [ ] 생성자에서 초기화 (또는 run() 시작 시)
- [ ] 다른 멤버와 같은 스코프

---

### ✓ C2: Job 등록 (topologicalSort 후)
```typescript
async run(program: AST.Program): Promise<string[]> {
  // ... 기존 코드

  const sortedBlocks = this.dependencyGraph.topologicalSort();
  
  // ✓ 여기서 각 block을 job으로 등록
  for (const block of sortedBlocks) {
    const jobId = `${block.lang}#${block.artifact || 'unnamed'}`;
    const deps = block.dependsOn?.map(dep => {
      // dep = "rust", artifact = "libcore.so"
      // → jobId = "rust#libcore.so"
      return ???;  // ← 의존 jobId 변환
    }) || [];
    
    this.failureAnalyzer.registerJob(jobId, block.lang, block.artifact, deps);
  }
```

**확인 사항:**
- [ ] dependsOn 의존성을 jobId로 정확히 변환
- [ ] artifact 없으면 'unnamed' 사용
- [ ] 모든 block이 등록됨
- [ ] lang은 소문자 (일관성)

---

### ✓ C3: 실시간 로그 출력 (기존 유지)
```typescript
// buildLangBlock 호출 직후
console.log(`[${lang.toUpperCase()}] Compiling...`);
```

**확인 사항:**
- [ ] P1의 `[LANG]` 프리픽스 유지
- [ ] 실시간 진행 상황 표시
- [ ] stderr 라이브 출력 (선택)

---

## 2단계: Job 상태 추적

### ✓ C4: Job 시작 (running 상태)
```typescript
for (const block of sortedBlocks) {
  const jobId = `${block.lang}#${block.artifact || 'unnamed'}`;
  
  // ✓ Job 실행 시작
  this.failureAnalyzer.updateJobStatus(jobId, 'running');
  
  try {
    // buildLangBlock(block);
```

**확인 사항:**
- [ ] 빌드 직전에 'running' 상태 설정
- [ ] 모든 job 경로에서 호출

---

### ✓ C5: 성공 시 상태 업데이트
```typescript
try {
  this.failureAnalyzer.updateJobStatus(jobId, 'running');
  
  // buildLangBlock 실행
  await this.buildLangBlock(block);
  
  // ✓ 성공
  this.failureAnalyzer.updateJobStatus(jobId, 'success');
  
```

**확인 사항:**
- [ ] exitCode 0으로 가정 (안 전달해도 됨)
- [ ] stdout/stderr 미리 수집되지 않았으면 여기서 처리

---

### ✓ C6: 실패 시 상태 + 출력 업데이트
```typescript
} catch (e) {
  // ✓ stderr, stdout 수집
  const stdout = e.stdout?.toString() || '';
  const stderr = e.stderr?.toString() || '';
  const exitCode = e.exitCode || 1;
  
  // ✓ 로그 저장
  this.failureAnalyzer.updateJobOutput(jobId, stdout, stderr, e.cmd || block.compileCmd);
  
  // ✓ 상태 업데이트
  this.failureAnalyzer.updateJobStatus(jobId, 'failed', exitCode);
  
  // 옵션: 계속 빌드할지 중단할지 결정
  // 현재: 계속 빌드하되, 의존 job은 자동 skip
}
```

**확인 사항:**
- [ ] `e.stdout`, `e.stderr` 정확히 추출
- [ ] exitCode 전달
- [ ] command 저장 (P4 리포트에 표시됨)
- [ ] try-catch가 모든 경로를 커버

---

### ✓ C7: Dependency 미충족 감지 (선택)
```typescript
// 옵션 1: 빌드 전 의존성 체크
if (block.dependsOn) {
  for (const depId of block.dependsOn) {
    const depJob = this.failureAnalyzer.getJob(depId);
    if (depJob && depJob.status === 'failed') {
      // ✓ 이 block은 실행 안 함
      this.failureAnalyzer.setJobStatus(jobId, 'skipped');
      continue;  // 다음 block으로
    }
  }
}
```

**확인 사항:**
- [ ] 의존 job이 failed면 skip 처리
- [ ] skip 상태 명시적으로 설정
- [ ] 루프 진행 (break 아닌 continue)

또는

```typescript
// 옵션 2: 나중에 분석기에서 자동 처리
// → FailureAnalyzer.analyzeFailures()가 skipped 판단
```

**권장:** 옵션 1 (명시적)

---

## 3단계: 최종 분석 및 리포트

### ✓ C8: FailureAnalyzer 분석 실행
```typescript
// 모든 job 완료 후

const analysis = this.failureAnalyzer.analyzeFailures();

// ✓ 분석 결과 확인
if (analysis.hasFailures) {
  // 실패 존재
} else {
  // 모두 성공
}
```

**확인 사항:**
- [ ] run() 루프 전체 완료 후 호출
- [ ] hasFailures 플래그 확인
- [ ] 결과 활용 가능 (JSON/리포트로도 가능)

---

### ✓ C9: 최종 리포트 출력
```typescript
// 마지막에

const report = this.failureAnalyzer.formatFailureReport();
console.error(report);  // ← stderr로 출력

// 종료 코드 설정
if (analysis.hasFailures) {
  process.exit(1);
} else {
  process.exit(0);  // 또는 return this.cGeneratedCode
}
```

**확인 사항:**
- [ ] formatFailureReport() 호출
- [ ] stderr로 출력 (표준 에러)
- [ ] 종료 코드 설정 (테스트에서 검증)
- [ ] stdout은 여전히 생성 코드 등으로 사용

---

### ✓ C10: P1 에러 포맷과 통합
```typescript
// 주의: P1의 classifyError/formatBuildError는 유지

// P1은 "단일 언어 실패" 설명용
const buildError = classifyError(block.lang, stderr, exitCode);
const errorMsg = formatBuildError(buildError);

// P4는 "전체 빌드 실패" 컨텍스트 설명용
const failureReport = analyzer.formatFailureReport();

// 둘 다 나타내야 함:
// 1. 실시간: P1 에러 메시지
// 2. 최종: P4 전체 리포트
```

**확인 사항:**
- [ ] P1 buildError 생성은 updateJobOutput 이전에
- [ ] P4 리포트는 최종 분석 단계에서
- [ ] 두 메시지가 중복되지 않음
- [ ] 실시간(P1)과 최종(P4)이 명확히 구분됨

---

## 4단계: 로그 순서 일관성

### ✓ C11: 실시간 로그는 비결정적 OK
```typescript
// 실시간 출력은 병렬 실행 순서이므로 비결정적 가능
for (const block of sortedBlocks) {
  // [Rust] Compiling...
  // [Go] Compiling...
  // 순서 무관
}
```

**확인 사항:**
- [ ] 실시간 로그는 race condition 괜찮음
- [ ] 하지만 동일 언어 내 순서는 topologicalSort 보존

---

### ✓ C12: 최종 리포트는 결정적 정렬
```typescript
// formatFailureReport() 내부에서 정렬

// direct failures: job 등록 순서 또는 lang/artifact 기준 정렬
// propagated failures: 같은 방식
// skipped: 같은 방식

// 결과: 10회 실행 → 같은 리포트 생성
```

**확인 사항:**
- [ ] formatFailureReport()에서 이미 정렬됨 (확인: P4 테스트 F10)
- [ ] 추가 정렬 불필요
- [ ] 10회 실행 → 동일한 리포트 생성

---

## 5단계: 통합 테스트

### ✓ T1: 기존 테스트 회귀 (419+개)
```bash
$ npm run build && npx jest --no-coverage
```

**확인 사항:**
- [ ] 기존 모든 테스트 통과
- [ ] 새 테스트 추가는 없음 (P4 분석기 테스트는 이미 19개 통과)
- [ ] nexus-runner 관련 테스트 확인

---

### ✓ T2: Runner + Analyzer 통합 테스트 (추가 작성)
```typescript
// tests/integration/parallel-failure-with-runner.test.ts (선택)

// 시나리오 1: 두 언어 병렬, 하나만 실패
// 시나리오 2: 의존성 실패로 인한 전파
// 시나리오 3: 모두 성공

// 각 시나리오마다 runner 호출 → 분석기 리포트 확인
```

**확인 사항:**
- [ ] 필수 아님 (P4 분석기 테스트 19개로 커버)
- [ ] 원하면 추가 (시간 여유 있을 때)

---

## 6단계: 최종 검증

### ✓ F1: 단일 언어 실패
```bash
# 테스트: Rust만 있고, 실패
$ npm run build input.fl
# 예상: 
# Direct failure: [Rust]
# Exit code: 1
```

**확인 사항:**
- [ ] ✓ 로그 출력됨
- [ ] ✓ "Direct failure" 표시
- [ ] ✓ 종료 코드 1

---

### ✓ F2: 다중 언어, 의존성 있음
```bash
# 테스트: Rust → Link, Go는 독립
# Rust 실패 시
# 예상:
# Direct failures: Rust
# Propagated failures: Link
# Successful: Go
```

**확인 사항:**
- [ ] ✓ Go는 "Successful"로 표시
- [ ] ✓ Rust는 "Direct failure"
- [ ] ✓ Link는 "Skipped" 또는 "Propagated"

---

### ✓ F3: 모두 성공
```bash
# 테스트: 모든 block 문법 정상
# 예상:
# ✓ All jobs completed successfully.
# Exit code: 0
```

**확인 사항:**
- [ ] ✓ "successfully" 메시지
- [ ] ✓ 종료 코드 0

---

## Done 정의 (Day 2 완료)

### 필수 항목
- [ ] C1: FailureAnalyzer 멤버 추가
- [ ] C2: Job 등록 (모든 block)
- [ ] C3: 실시간 로그 유지
- [ ] C4: Job 실행 시작 (running)
- [ ] C5: 성공 상태 업데이트
- [ ] C6: 실패 상태 + 로그 저장
- [ ] C8: analyzeFailures() 호출
- [ ] C9: formatFailureReport() 출력
- [ ] C10: P1 포맷과 통합
- [ ] C12: 최종 리포트 결정성 확인
- [ ] T1: 기존 테스트 419+ PASS
- [ ] F1/F2/F3: 수동 테스트 통과

### 선택 항목
- [ ] C7: Dependency 미충족 자동 감지
- [ ] T2: Runner 통합 테스트 작성

---

## 주의 사항

### ⚠️ 하지 말 것
1. **P1 에러 포맷 덮어쓰기** — P1과 P4는 보완 관계
2. **모든 job에 대해 상세한 분석** — 명확한 관계만 잡기
3. **실시간 로그 순서 강제 정렬** — 최종 리포트만 정렬
4. **복잡한 causal inference** — "이건 저 때문에 실패"만 충분

### ✓ 하길 권하는 것
1. **runner는 기록, 분석기는 해석** — 역할 분리
2. **P1 + P4 메시지 모두 표시** — 중복 아닌 보완
3. **최종 리포트는 간단명료** — 3-4줄로 요약
4. **테스트로 검증** — 수동 테스트도 포함

---

## 예상 코드량

- `nexus-runner.ts`: +30~50줄 (runner 로직)
- `tests/` (선택): +200줄 (통합 테스트)
- **총:** ~80줄 (필수)

---

## P4 완료 후 상태

```
Trust Matrix:
- Deterministic Build: 93% ✓
- Stable ABI: 80% ✓
- Type Bridge: 87% ✓
- Failure Isolation: 80% ✓ (P4 완료)
- Reproducible Exec: 40%

평균: Level 2.4/3.0 (80%)
```

P4 완료 시 "복잡도에서도 신뢰 유지"라는 메시지 전달 가능.
