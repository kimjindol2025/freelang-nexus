# P5 Design — Reproducible Execution

**현재 상태:** Level 1.2/3.0 (40%)  
**목표 상태:** Level 2.5/3.0 (83%)  
**범위:** 같은 입력 = 같은 출력 (성능 일관성 포함)  
**기간:** 3-4일  
**완료 후:** v1.0 Trust Gate 통과 예상

---

## 목표 정의

### 1단계 목표 (1day)
**"같은 .fl 파일, 같은 환경 → 항상 같은 결과"**

```
Input:    test.fl + input.txt
Env:      Linux x64 (고정)
Platform: glibc 2.35 (고정)

Run 1: output1.txt
Run 2: output2.txt
Run 3: output3.txt

Assert: output1 === output2 === output3
```

**검증:**
- 10회 반복 실행 → MD5 해시 동일
- stdout, stderr, exit code 동일

---

### 2단계 목표 (1day)
**"다양한 환경에서도 경계가 명확"**

```
테스트 조합:
- Linux x64 (primary)
- macOS arm64 (optional)
- 다양한 glibc 버전

각 플랫폼에서:
- 동일 .fl → 예상 output 생성
- 다른 플랫폼에서도 semantic 동일성 확인
```

**명확한 경계:**
- 플랫폼 차이로 인한 허용 오차 문서화
- 부동소수점 정밀도 한계 공개
- 난수 재현성 정책 선언

---

### 3단계 목표 (1day)
**"성능 baseline 기록 + 감지"**

```
매 빌드마다:
1. 성능 메트릭 수집
2. baseline과 비교
3. 편차 > 10% 시 경고

메트릭:
- 컴파일 시간 (언어별)
- 링크 시간
- 전체 빌드 시간
- 메모리 사용량 (peak)
```

---

## 범위 명확화

### 포함 (P5)
- ✅ 같은 입력 10회 빌드 → sha256 동일
- ✅ stdout/stderr 재현성
- ✅ exit code 재현성
- ✅ 성능 baseline 수립
- ✅ 플랫폼별 경계 문서화
- ✅ 난수 재현성 정책

### 제외 (향후)
- ❌ 완벽한 cross-platform 동일성 (불가능)
- ❌ 부동소수점 완전 재현 (IEEE 제약)
- ❌ CI 환경까지 자동화 (별도 PR)

---

## 구현 계획

### Phase A (Day 1): 재현성 테스트
**파일:** `tests/reproducible-execution.test.ts` (신규, ~200줄)

```typescript
describe('P5 — Reproducible Execution', () => {

  describe('Same Input → Same Output (10회)', () => {
    // R1: 간단한 Rust 빌드 10회 반복
    // R2: Go + C 다중언어 10회 반복
    // R3: 모든 출력 해시 비교
    
    test('R1: Single language determinism', () => {
      const hashes = [];
      for (let i = 0; i < 10; i++) {
        const result = runner.run(rustProgram);
        hashes.push(md5(result.cOutput));
      }
      // 모든 해시 동일
      expect(new Set(hashes).size).toBe(1);
    });

    test('R2: Multi-language determinism', () => {
      const hashes = [];
      for (let i = 0; i < 10; i++) {
        const result = runner.run(multiLangProgram);
        hashes.push(md5(result.cOutput + result.pythonOutput));
      }
      expect(new Set(hashes).size).toBe(1);
    });

    test('R3: Stdout/stderr consistency', () => {
      const run1 = runner.run(program);
      const run2 = runner.run(program);
      expect(run1.cOutput).toBe(run2.cOutput);
      expect(run1.pythonOutput).toBe(run2.pythonOutput);
    });
  });

  describe('Output Correctness', () => {
    // R4: 계산 결과 검증
    // R5: 오류 메시지 동일성
    
    test('R4: Arithmetic correctness', () => {
      const result = runner.run(arithmeticProgram);
      expect(result.cOutput).toContain('42'); // 예상 결과
    });

    test('R5: Error message consistency', () => {
      const result1 = runner.run(errorProgram);
      const result2 = runner.run(errorProgram);
      expect(result1.errors[0]).toBe(result2.errors[0]);
    });
  });

  describe('Performance Baseline', () => {
    // P1: 첫 빌드 baseline 기록
    // P2: 이후 빌드 성능 비교
    // P3: 10% 편차 경고
    
    test('P1: Establish baseline', () => {
      const perf = measureBuildPerformance(program);
      expect(perf.totalMs).toBeLessThan(5000);
      // baseline.json에 저장
    });

    test('P2: Compare to baseline', () => {
      const baseline = loadBaseline();
      const current = measureBuildPerformance(program);
      const deviation = Math.abs(current.totalMs - baseline.totalMs) / baseline.totalMs;
      expect(deviation).toBeLessThan(0.1); // 10% 이내
    });
  });
});
```

---

### Phase B (Day 2): Performance Metrics
**파일:** `src/nexus/runtime/performance-tracker.ts` (신규, ~150줄)

```typescript
export class PerformanceTracker {
  private metrics: BuildMetrics[] = [];

  recordBuild(programName: string, metrics: {
    compileTime: number;  // rustc/go build 등 총 시간
    linkTime: number;     // gcc linking
    totalTime: number;
    memoryPeak: number;   // MB
  }): void

  compareToBaseline(baseline: BuildMetrics): {
    deviation: number;    // 0.0 ~ 1.0
    warning?: string;
  }

  saveBaseline(path: string): void
  loadBaseline(path: string): BuildMetrics
}
```

---

### Phase C (Day 2-3): Platform Boundary Documentation
**파일:** `REPRODUCIBILITY.md` (신규, ~150줄)

```markdown
# Reproducible Execution Guarantees

## ✅ Guaranteed (100% reproducible)
- Same .fl + same Linux x64 → deterministic binary
- Same input file → same stdout/stderr
- 10회 반복 빌드 → byte-for-byte identical outputs

## ⚠️ Mostly Reproducible (>99%)
- Different Linux distributions (glibc 2.30+)
  - Floating-point results may differ in last digit
  - Linker order can vary (non-deterministic malloc)
  
## ❌ Not Guaranteed
- Windows / macOS (untested)
- Custom LLVM builds (undocumented)
- Hardware-dependent optimizations (-O3)

## Platform-Specific Notes
### Linux x64
- glibc 2.30 이상 필수
- kernel 5.10+에서 검증됨
- 동일 배포판에서 100% 재현

### macOS (experimental)
- Clang 14+ 필수
- System malloc 비결정성
  - 허용 오차: ±2% 부동소수점
  
### Docker (recommended)
```dockerfile
FROM ubuntu:22.04
# 모든 도구 버전 고정
```
```

---

## 완료 조건 (5가지)

### ✅ R1: 10회 재현성 테스트 통과
```bash
$ npm test -- tests/reproducible-execution.test.ts
R1: Single language determinism ✓
R2: Multi-language determinism ✓
R3: Stdout/stderr consistency ✓
```

### ✅ P1: Performance baseline 수립
```json
// baseline.json
{
  "rust_simple": {
    "compileMs": 1200,
    "linkMs": 300,
    "totalMs": 1500,
    "memoryPeakMb": 256
  }
}
```

### ✅ P2: 성능 비교 기능 동작
```
$ npm run build --measure
[Performance] rust: 1200ms (baseline: 1200ms, deviation: 0%)
[Performance] link: 300ms (baseline: 300ms, deviation: 0%)
Overall: 1500ms ✓
```

### ✅ D1: REPRODUCIBILITY.md 작성
- 보장 범위 명확
- 플랫폼별 경계 문서화
- 부동소수점 정밀도 공개

### ✅ P5: 통합 테스트 통과
```bash
$ npm test  # 기존 419+ 테스트 + P5 새 테스트
Test Suites: all passed
```

---

## Trust Matrix 영향

| 항목 | 현재 | 목표 | 개선 |
|------|------|------|------|
| 같은 입력 = 같은 출력 | Level 2 | Level 3 | +1 |
| 난수 시드 고정 | Level 1 | Level 2 | +1 |
| 부동소수점 재현성 | Level 1 | Level 2 | +1 |
| 플랫폼 간 재현성 | Level 0 | Level 1 | +1 |
| 성능 일관성 | Level 1 | Level 2 | +1 |
| **Reproducible Exec 평균** | **Level 1.2** | **Level 2.5** | **+1.3** |

---

## v1.0 Trust Gate 정의

### v1 릴리스 조건
P5 완료 후 이 5개가 모두 만족되면 v1.0 선언:

```
✅ Level 2.5 이상 (모든 축)
✅ 10회 재현성 테스트 PASS
✅ 성능 baseline 수립
✅ REPRODUCIBILITY.md 완료
✅ GitHub Release + 공식 announcement
```

---

## 테스트 케이스 예시

### R1: Rust 단일 빌드 10회
```rust
@mode(v)
@lang("rust")
---
pub extern "C" fn add(x: i32, y: i32) -> i32 {
  x + y
}
---
fn main() -> i64 {
  add(2, 3) as i64
}
```

**기대 결과:** 10회 모두 output === "5\n"

---

### R2: Go + Rust 다중언어 10회
```fl
@mode(v)

@lang("rust")
---
pub extern "C" fn factorial(n: i32) -> i32 {
  (1..=n).product()
}
---

@lang("go")
---
//export calculate
func calculate(x C.int) C.int {
  // Go에서 Rust 호출
  return C.int(/* factorial(5) = 120 */)
}
---

fn main() {
  let result = calculate(5);
  println!("Result: {}", result);
}
```

**기대 결과:** 10회 모두 output === "Result: 120\n"

---

### P2: 성능 편차 < 10%
```
Run 1: 1500ms (baseline)
Run 2: 1485ms (deviation: 1%)
Run 3: 1520ms (deviation: 1.3%)
...
Run 10: 1510ms (deviation: 0.7%)

Summary: All runs within 10% ✓
```

---

## 예상 코드량

- `tests/reproducible-execution.test.ts`: 200줄
- `src/nexus/runtime/performance-tracker.ts`: 150줄
- `REPRODUCIBILITY.md`: 150줄
- **총:** ~500줄

---

## P5 완료 후 상태

```
Trust Matrix (최종):

Deterministic Build:      93% ✓
Stable ABI:              80% ✓
Type Bridge:             87% ✓
Failure Isolation:       80% ✓
Reproducible Exec:       83% ✓ ← P5 완료

평균: Level 2.5/3.0 (83%)

Status: v1.0 Trust Gate 통과 준비 완료
```

---

## 핵심 메시지

P5 완료는 단순히 "성능 측정"이 아니라,

> **"이 컴파일러는 같은 조건에서 항상 같은 결과를 만들고, 그 결과의 신뢰도를 측정할 수 있다"**

는 최종 선언입니다.

이게 나오면 FreeLang Nexus는 "신뢰를 만든 프로젝트"라는 평가가 정당해집니다.
