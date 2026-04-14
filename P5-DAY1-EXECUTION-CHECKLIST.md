# P5 Day 1 Execution Checklist

**목표:** 재현성 검증 (10회 동일 결과)  
**시간:** 1일 (8시간)  
**결과:** SHA-256 비교 + 재현성 리포트

---

## 1단계: 테스트 케이스 2개 준비 (30min)

### ✓ C1: 간단한 Rust 단일 언어
**파일:** `fixtures/reproducible-test-1.fl`

```fl
@mode(v)

@lang("rust")
---
pub extern "C" fn add(x: i32, y: i32) -> i32 {
  x + y
}
---

fn main() {
  let result = add(2, 3);
  println!("Result: {}", result);
}
```

**확인:**
- [ ] 파일 생성됨
- [ ] 문법 검증 (`npm run build` 통과)

### ✓ C2: Go + Rust 다중언어
**파일:** `fixtures/reproducible-test-2.fl`

```fl
@mode(v)

@lang("rust")
---
pub extern "C" fn multiply(x: i32, y: i32) -> i32 {
  x * y
}
---

@lang("go")
---
//export process
func process(x C.int) C.int {
  return C.int(x * 2)
}
---

fn main() {
  let a = multiply(3, 4);
  let b = process(a as i32);
  println!("Result: {}", b);
}
```

**확인:**
- [ ] 파일 생성됨
- [ ] 문법 검증

---

## 2단계: 재현성 테스트 스켈레톤 (1hour)

### ✓ T1: 테스트 파일 생성
**파일:** `tests/p5-reproducible-day1.test.ts`

```typescript
import * as crypto from 'crypto';
import { NexusRunner, RunResult } from '../src/nexus/runtime/nexus-runner';

describe('P5 Day 1 — Reproducible Execution', () => {

  describe('Reproducibility Validation', () => {
    
    test('R1: Single language 10회 동일 해시', () => {
      // 구현: tests/p5-reproducible-day1.test.ts 참고
    });

    test('R2: Multi-language 10회 동일 해시', () => {
      // 구현
    });

    test('R3: Stdout/stderr 완전 동일', () => {
      // 구현
    });
  });

  describe('Performance Baseline', () => {

    test('P1: Single language 성능 측정', () => {
      // 구현
    });

    test('P2: Multi-language 성능 측정', () => {
      // 구현
    });
  });
});

// 유틸 함수
function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function runAndMeasure(program: string): {
  result: RunResult;
  timeMs: number;
  hash: string;
} {
  const start = Date.now();
  // runner.run(program)
  const end = Date.now();
  // return { result, timeMs, hash }
}
```

**확인:**
- [ ] 파일 생성됨
- [ ] 기본 구조 완성

---

## 3단계: 재현성 로직 구현 (2hours)

### ✓ R1: Single language 재현성
```typescript
test('R1: Single language 10회 동일 해시', () => {
  const program = fs.readFileSync('fixtures/reproducible-test-1.fl', 'utf-8');
  const hashes: string[] = [];
  const times: number[] = [];

  for (let i = 0; i < 10; i++) {
    const { result, timeMs, hash } = runAndMeasure(program);
    hashes.push(hash);
    times.push(timeMs);
    
    // 각 실행의 출력 검증
    expect(result.cOutput).toContain('Result: 5');
  }

  // 모든 해시 동일 확인
  const uniqueHashes = new Set(hashes);
  expect(uniqueHashes.size).toBe(1);
  console.log(`✓ R1 PASS: 10/10 identical (hash: ${hashes[0]})`);
});
```

**확인:**
- [ ] 코드 작성됨
- [ ] `npm test -- p5-reproducible` 실행 가능
- [ ] 첫 실행에서 FAIL 예상 (아직 runner 지원 X)

### ✓ R2: Multi-language 재현성
```typescript
test('R2: Multi-language 10회 동일 해시', () => {
  const program = fs.readFileSync('fixtures/reproducible-test-2.fl', 'utf-8');
  const hashes: string[] = [];

  for (let i = 0; i < 10; i++) {
    const { result, timeMs, hash } = runAndMeasure(program);
    hashes.push(hash);
    expect(result.cOutput).toContain('Result: 24'); // 3*4*2=24
  }

  const uniqueHashes = new Set(hashes);
  expect(uniqueHashes.size).toBe(1);
  console.log(`✓ R2 PASS: 10/10 identical (hash: ${hashes[0]})`);
});
```

**확인:**
- [ ] 코드 작성됨

### ✓ R3: Stdout/stderr 완전 동일
```typescript
test('R3: Stdout/stderr 완전 동일 (5회)', () => {
  const program = fs.readFileSync('fixtures/reproducible-test-1.fl', 'utf-8');
  const outputs: string[] = [];

  for (let i = 0; i < 5; i++) {
    const { result } = runAndMeasure(program);
    outputs.push(result.cOutput);
  }

  // 모든 출력 동일
  for (let i = 1; i < outputs.length; i++) {
    expect(outputs[i]).toBe(outputs[0]);
  }
  console.log(`✓ R3 PASS: 5/5 identical outputs`);
});
```

**확인:**
- [ ] 코드 작성됨

---

## 4단계: 성능 기준선 (1hour)

### ✓ P1: 성능 측정 함수
```typescript
interface PerformanceMetric {
  runIndex: number;
  timeMs: number;
  memoryMb?: number;
}

function recordMetrics(testName: string, runs: PerformanceMetric[]): void {
  const times = runs.map(r => r.timeMs);
  const avg = times.reduce((a, b) => a + b) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const deviation = ((max - min) / avg * 100).toFixed(1);

  console.log(`
[${testName}]
  Average: ${avg.toFixed(0)}ms
  Min: ${min}ms
  Max: ${max}ms
  Deviation: ${deviation}%
  `);

  // baseline-p5.json에 저장
  const baseline = {
    testName,
    avgMs: Math.round(avg),
    minMs: min,
    maxMs: max,
    deviationPercent: parseFloat(deviation),
    timestamp: new Date().toISOString(),
  };

  fs.appendFileSync('baseline-p5.json', JSON.stringify(baseline) + '\n');
}

test('P1: Single language 성능 baseline', () => {
  const program = fs.readFileSync('fixtures/reproducible-test-1.fl', 'utf-8');
  const runs: PerformanceMetric[] = [];

  for (let i = 0; i < 5; i++) {
    const { timeMs } = runAndMeasure(program);
    runs.push({ runIndex: i, timeMs });
  }

  recordMetrics('Rust single', runs);
  // 예상: 1000-2000ms
});

test('P2: Multi-language 성능 baseline', () => {
  const program = fs.readFileSync('fixtures/reproducible-test-2.fl', 'utf-8');
  const runs: PerformanceMetric[] = [];

  for (let i = 0; i < 5; i++) {
    const { timeMs } = runAndMeasure(program);
    runs.push({ runIndex: i, timeMs });
  }

  recordMetrics('Go + Rust multi', runs);
  // 예상: 1500-2500ms
});
```

**확인:**
- [ ] 코드 작성됨
- [ ] `baseline-p5.json` 생성 확인

---

## 5단계: 테스트 실행 및 검증 (2hours)

### ✓ RUN1: 단일 언어 테스트
```bash
$ npm test -- p5-reproducible-day1 --testNamePattern="R1"

Expected Output:
✓ R1: Single language 10회 동일 해시
  ✓ R1 PASS: 10/10 identical (hash: abc123...)

Actual: ?
```

**확인:**
- [ ] 테스트 실행
- [ ] 10회 모두 동일한지 확인
- [ ] 해시값 기록

### ✓ RUN2: 다중언어 테스트
```bash
$ npm test -- p5-reproducible-day1 --testNamePattern="R2"

Expected Output:
✓ R2: Multi-language 10회 동일 해시
  ✓ R2 PASS: 10/10 identical (hash: def456...)
```

**확인:**
- [ ] 테스트 실행
- [ ] 10회 모두 동일한지 확인

### ✓ RUN3: 출력 동일성
```bash
$ npm test -- p5-reproducible-day1 --testNamePattern="R3"

Expected Output:
✓ R3: Stdout/stderr 완전 동일 (5회)
```

**확인:**
- [ ] 테스트 실행

### ✓ PF1: 성능 측정
```bash
$ npm test -- p5-reproducible-day1 --testNamePattern="P1|P2"

Expected Output:
[Rust single]
  Average: 1200ms
  Min: 1150ms
  Max: 1250ms
  Deviation: 8.3%

[Go + Rust multi]
  Average: 1800ms
  Min: 1750ms
  Max: 1850ms
  Deviation: 5.6%
```

**확인:**
- [ ] 성능 측정 실행
- [ ] baseline-p5.json 생성 확인

---

## 6단계: 결과 리포트 생성 (30min)

### ✓ REP1: 재현성 리포트
**파일:** `reports/p5-day1-reproducibility.md`

```markdown
# P5 Day 1 — Reproducibility Verification Report

## Summary
- Single language: 10/10 PASS ✓
- Multi-language: 10/10 PASS ✓
- Stdout/stderr: 5/5 PASS ✓

## Reproducibility Metrics

### Test 1: Rust (reproducible-test-1.fl)
| Run | Output Hash | Time | Match |
|-----|-------------|------|-------|
| 1   | abc123...   | 1200ms | ✓ |
| 2   | abc123...   | 1210ms | ✓ |
| ... | abc123...   | ... | ✓ |
| 10  | abc123...   | 1195ms | ✓ |

**Result: 10/10 IDENTICAL ✓**

### Test 2: Go + Rust (reproducible-test-2.fl)
| Run | Output Hash | Time | Match |
|-----|-------------|------|-------|
| 1   | def456...   | 1800ms | ✓ |
| 2   | def456...   | 1810ms | ✓ |
| ... | def456...   | ... | ✓ |
| 10  | def456...   | 1790ms | ✓ |

**Result: 10/10 IDENTICAL ✓**

## Performance Baseline

### Rust Single
- Average: 1200ms
- Min: 1150ms
- Max: 1250ms
- Deviation: 8.3%

### Go + Rust Multi
- Average: 1800ms
- Min: 1750ms
- Max: 1850ms
- Deviation: 5.6%

## Conclusion
Same input = Same output ✓  
Same environment = 10 consistent runs ✓  
Platform: Linux x64 (Ubuntu 22.04)  
Kernel: 5.15.0+

**Status: Ready for Day 2 (Platform Boundary)**
```

**확인:**
- [ ] 리포트 파일 생성됨
- [ ] 해시값, 시간, 편차 기록됨

---

## 7단계: 최종 검증 (30min)

### ✓ V1: 테스트 모두 실행
```bash
$ npm test -- p5-reproducible-day1 --no-coverage

Output:
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
  ✓ R1: Single language 10회 동일 해시
  ✓ R2: Multi-language 10회 동일 해시
  ✓ R3: Stdout/stderr 완전 동일 (5회)
  ✓ P1: Single language 성능 baseline
  ✓ P2: Multi-language 성능 baseline
  + 2 more passed
```

**확인:**
- [ ] 모든 테스트 PASS
- [ ] baseline-p5.json 파일 생성됨
- [ ] reports/p5-day1-reproducibility.md 생성됨

### ✓ V2: 기존 테스트 회귀
```bash
$ npm test --no-coverage | head -20

Output:
Test Suites: all passed
Tests: 419+ all passed
```

**확인:**
- [ ] 기존 테스트 모두 여전히 PASS

---

## Day 1 완료 조건 (필수 5개)

- [ ] **C1**: Rust 단일 언어 fixture 생성
- [ ] **C2**: Go + Rust 다중언어 fixture 생성
- [ ] **T1**: P5 Day 1 테스트 파일 생성 (구조)
- [ ] **R1-R3**: 재현성 테스트 3개 모두 작성 및 PASS
- [ ] **P1-P2**: 성능 baseline 측정 및 baseline-p5.json 생성
- [ ] **REP1**: 재현성 리포트 생성
- [ ] **V1**: 모든 P5 테스트 PASS
- [ ] **V2**: 기존 테스트 회귀 확인

---

## 예상 코드량 및 시간

| 항목 | 코드 | 시간 |
|------|------|------|
| C1-C2: Fixture | 30줄 | 30min |
| T1: 테스트 스켈레톤 | 50줄 | 1hour |
| R1-R3: 재현성 로직 | 100줄 | 2hours |
| P1-P2: 성능 측정 | 50줄 | 1hour |
| REP1: 리포트 생성 | 40줄 | 30min |
| **총** | **270줄** | **5hour** |

---

## Day 1 완료 후 상태

```
✅ 재현성 검증 완료 (10회 동일)
✅ 성능 baseline 기록됨
✅ 리포트 생성됨
⏳ 플랫폼 경계 (Day 2)
⏳ v1.0 Gate 정의 (Day 3)

Trust Level: Level 2.0 (66%)
Next: Platform Boundary Documentation
```

---

## 주의사항

### ❌ 하지 말 것
- 성능 최적화 (baseline만 기록)
- macOS/Windows 지원 (Linux만)
- 모든 언어 조합 테스트 (2개만)

### ✓ 하길 권하는 것
- 결과를 매번 확인 (다양한 머신에서 테스트해보기)
- 해시값을 정확히 기록
- 시간 편차가 큰 이유 찾기 (캐시? GC?)
- 리포트 상세히 작성

---

## 질문 시 체크리스트

테스트 실행 중 막히면 확인할 것:

1. ✓ fixture 파일이 유효한 .fl 문법인가?
2. ✓ runner.run()이 동작하는가?
3. ✓ 첫 실행이 성공하는가?
4. ✓ 해시 함수가 정확한가?
5. ✓ 시간 측정이 밀리초 단위인가?

---

**P5 Day 1 시작 준비 완료.**

바로 C1부터 시작하면 됩니다.
