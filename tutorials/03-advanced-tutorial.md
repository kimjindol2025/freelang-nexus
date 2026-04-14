# FreeLang Nexus 고급 튜토리얼

> 🔴 **난이도**: 고급 (2시간+)  
> 📚 **목표**: 6개 언어 완전 통합, 복잡한 의존성, 최적화  
> 📖 **학습 파일**: `examples/polyglot-demo.fl`

---

## 1️⃣ 개요: 진정한 폴리글롯 시스템

**Polyglot** = 여러 언어를 아는 사람

이번 예제는 **6개 언어의 강점을 모두 활용**하는 시스템입니다.

```
🦀 Rust (무작위 수)  → 🐹 Go (해싱)
                        ↓
⚙️ C (수학)  → ⚡ Zig (비트)
                ↓
            📊 Julia (재귀)
                ↓
        🐍 Python (통계)
                ↓
        🔷 V (결과 출력)
```

**이번 예제에서 배울 것**:
- ✅ 6개 언어 각각의 특성 이해
- ✅ 복잡한 의존성 관리
- ✅ 교차 언어 최적화
- ✅ 프로덕션급 시스템 설계

---

## 2️⃣ 언어별 역할과 선택 이유

### 🦀 **Rust**: PCG 난수 생성기

```rust
@lang("rust")
@artifact("libpcg.so")
@compile("rustc --crate-type cdylib -O -o libpcg.so pcg.rs")
---
#[no_mangle]
pub extern "C" fn pcg_random(seed: u64) -> u64 {
    let mut state = seed;
    state = state.wrapping_mul(6364136223846793005)
           .wrapping_add(1442695040888963407);
    let word = ((state >> 18) ^ state) >> 27;
    word as u64
}
---
```

**왜 Rust?**
- ✅ 메모리 안전 (버퍼 오버플로우 없음)
- ✅ 고성능 (최적화)
- ✅ 암호학적 안전성

**PCG**: "Permuted Congruential Generator" — MT19937보다 빠르고 통계적으로 우수

---

### ⚙️ **C**: 수학 함수 (sin, cos, sqrt)

```c
@lang("c")
@artifact("libmath.so")
@compile("gcc -shared -fPIC -O2 -o libmath.so math.c -lm")
---
#include <math.h>

double sin_degrees(double deg) {
    return sin(deg * 3.14159265359 / 180.0);
}

double cos_degrees(double deg) {
    return cos(deg * 3.14159265359 / 180.0);
}

double pythagoras(double a, double b) {
    return sqrt(a*a + b*b);
}
---
```

**왜 C?**
- ✅ POSIX 표준 라이브러리 (libm) 직접 사용
- ✅ 저수준 제어 (속도 중요)
- ✅ 호환성 (모든 시스템)

**링크 플래그**: `-lm` (libm.so 필수)

---

### 🐹 **Go**: 문자열 해싱

```go
@lang("go")
@artifact("libhash.so")
@compile("go build -buildmode=c-shared -o libhash.so .")
---
package main

import (
    "C"
    "crypto/sha256"
    "encoding/hex"
)

//export hash_string
func hash_string(cStr *C.char) *C.char {
    goStr := C.GoString(cStr)
    hash := sha256.Sum256([]byte(goStr))
    result := C.CString(hex.EncodeToString(hash[:]))
    return result
}

func main() {}
---
```

**왜 Go?**
- ✅ 네이티브 크로스플랫폼 (Windows/Mac/Linux)
- ✅ 강력한 표준 라이브러리 (crypto/sha256)
- ✅ CGO로 쉬운 C 상호작용

**포인터 변환**:
- C에서 Go: `C.GoString(cStr)` (C char* → Go string)
- Go에서 C: `C.CString(result)` (Go string → C char*)

---

### ⚡ **Zig**: 비트 연산 (XOR, Bit Reversal)

```zig
@lang("zig")
@artifact("libbitops.so")
@compile("zig build-lib -dynamic -O ReleaseSafe -fPIC bitops.zig")
---
const std = @import("std");

export fn xor_bits(a: u32, b: u32) u32 {
    return a ^ b;
}

export fn reverse_bits(num: u32) u32 {
    var result: u32 = 0;
    var n = num;
    var i: u32 = 0;
    while (i < 32) : (i += 1) {
        result = (result << 1) | (n & 1);
        n >>= 1;
    }
    return result;
}
---
```

**왜 Zig?**
- ✅ 저수준 비트 연산 (명확한 문법)
- ✅ C 호환 (export fn)
- ✅ 컴파일 타임 계산 가능

---

### 📊 **Julia**: 피보나치 (재귀, 행렬곱)

```julia
@lang("julia")
@artifact("libjulia.so")
@compile("julia --startup-file=no -e 'using PackageCompiler; ...'")
---
function fibonacci(n::Int32)::Int64
    if n <= 1
        return n
    end
    return fibonacci(n - 1) + fibonacci(n - 2)
end

function matrix_mult(a, b)
    return a * b  # Julia는 행렬 곱 최적화
end
---
```

**왜 Julia?**
- ✅ 과학 계산에 최적화
- ✅ LLVM 컴파일 (고속)
- ✅ 행렬 연산 자동 병렬화

---

### 🐍 **Python**: 통계 분석

```python
@mode(python)

def stats_summary(name, values):
    import statistics
    print(f"{name}: {statistics.mean(values):.2f}")
```

**왜 Python?**
- ✅ 데이터 분석 도구 풍부 (numpy, pandas)
- ✅ 프로토타이핑 빠름
- ✅ 스크립팅 유연함

---

### 🔷 **V**: 오케스트레이션 + 최종 출력

```v
@mode(v)

fn main() -> i64 {
  println("╔═══════════════════════════════════╗")
  println("║  6-Language Polyglot System       ║")
  println("╚═══════════════════════════════════╝")
  
  // 각 언어 함수 호출
  let rng = pcg_random(42)
  let sin_val = sin_degrees(45.0)
  let hash = hash_string("hello")
  let xor_result = xor_bits(15, 7)
  let fib = fibonacci(10)
  stats_summary("results", [1.0, 2.0, 3.0])
  
  return 0
}
```

---

## 3️⃣ 복잡한 의존성 분석

### 🔄 빌드 순서 (자동 토폴로지 정렬)

```
┌─────────────────────────────────────┐
│  main.c (V generated)               │
└─────────────────────────────────────┘
  ↑ 의존:
  ├─ libpcg.so (Rust)
  ├─ libmath.so (C) → 표준 라이브러리 (libm)
  ├─ libhash.so (Go) → cgo (자동)
  ├─ libbitops.so (Zig)
  └─ libjulia.so (Julia) → LLVM
```

### 📊 의존성 그래프

```
Rust ─┐
      ├─→ C ────┐
      │         ├─→ gcc link ─→ main
      ├─→ Go ───┤
      │         ├─→ Zig ──┘
      └─→ Julia ┘
```

**빌드 순서**:
1. `rustc --crate-type cdylib -O libpcg.so pcg.rs`
2. `gcc -shared -lm libmath.so math.c`
3. `go build -buildmode=c-shared libhash.so`
4. `zig build-lib -dynamic libbitops.so bitops.zig`
5. `julia ... libjulia.so`
6. `gcc -o main main.c -lpcg -lmath -lhash -lbitops -ljulia -lm`

**병렬화 가능**:
- Rust, Go, Zig, Julia는 독립적 → **동시 빌드 가능**
- C는 libm 의존 → **나머지 후**
- main은 모든 라이브러리 필요 → **마지막**

---

## 4️⃣ 핵심 기술: 교차 언어 최적화

### 🚀 최적화 전략

#### 1️⃣ **링크 타임 최적화 (LTO)**

```bash
gcc -O2 -flto main.c \
  -lpcg -lmath -lhash -lbitops -ljulia \
  -Wl,-flto
```

**효과**: Rust/Go/C 코드 전체가 글로벌 최적화 대상 → 3~15% 속도 향상

#### 2️⃣ **컴파일 플래그**

| 언어 | 플래그 |
|------|--------|
| Rust | `-O` (release mode) |
| C | `-O2` (aggressive), `-march=native` (CPU 최적) |
| Go | (기본값으로 충분) |
| Zig | `-O ReleaseSafe` (최적화 + 안전) |
| Julia | JIT 컴파일 (자동) |

#### 3️⃣ **메모리 관리**

```
[Rust] → libpcg.so (자동 메모리 관리)
[C] → malloc/free 주의 필요
[Go] → GC (가비지 컬렉션) 자동
[Zig] → 명시적 할당
[Julia] → 자동 GC
```

---

## 5️⃣ 실무 시나리오: 고주파 거래 시스템

이 6언어 구조가 실제로 어떻게 쓰이는지 봅시다.

### 📊 거래 시스템

```
입력: 시세 데이터 [1000개 주문]
  ↓ (Rust: 초고속 읽기)
난수 생성 (주문 ID)
  ↓ (C: 기술 지표 계산)
이동평균, 표준편차
  ↓ (Go: 주문해시, 중복 확인)
해시 테이블 확인
  ↓ (Zig: 비트 플래그 연산)
매매 신호 변환 (0/1 플래그)
  ↓ (Julia: 행렬 계산)
포트폴리오 최적화
  ↓ (Python: 통계, 리포트)
거래 결과 분석
```

**각 언어의 역할**:
- **Rust**: 1,000개 주문 읽기 (< 1ms)
- **C**: 기술 지표 계산 (< 5ms)
- **Go**: 중복 확인 (< 2ms)
- **Zig**: 신호 변환 (< 1ms)
- **Julia**: 최적화 (< 10ms)
- **Python**: 분석 (< 100ms)

**전체**: < 120ms (고주파 거래에 적합)

---

## 6️⃣ 고급 패턴

### 📍 패턴 1: 캐싱 (Rust → Go)

```rust
#[no_mangle]
pub extern "C" fn cache_set(key: *const c_char, value: u64) {
    // Rust의 HashMap에 저장
}

#[no_mangle]
pub extern "C" fn cache_get(key: *const c_char) -> u64 {
    // Rust HashMap에서 읽기
}
```

```go
//export invalidate_cache
func invalidate_cache() {
    // Go에서 캐시 무효화
}
```

---

### 📍 패턴 2: 콜백 (Python → C)

```c
typedef void (*callback_fn)(const char* result);

void process_with_callback(const char* input, callback_fn cb) {
    char* result = process(input);
    cb(result);
}
```

```python
def my_callback(result):
    print(f"Done: {result}")
```

```v
// V에서 Python 콜백으로 결과 전달
```

---

### 📍 패턴 3: 병렬 처리

```rust
// Rust에서 병렬 반복
#[no_mangle]
pub extern "C" fn process_parallel(items: *const i32, count: i32) -> i64 {
    (0..count)
        .into_par_iter()
        .map(|i| unsafe { *items.add(i as usize) as i64 })
        .sum()
}
```

---

## 7️⃣ 실제 테스트

### Step 1: 환경 확인

```bash
rustc --version    # 1.70+
go version          # 1.20+
gcc --version       # 11+
zig version         # 0.11+
julia --version     # 1.9+
python3 --version   # 3.10+
```

### Step 2: 파일 준비

```bash
cp examples/polyglot-demo.fl ./polyglot-test.fl
```

### Step 3: 파싱

```bash
npm test -- tests/nexus-polyglot.test.ts
```

**확인**:
- ✅ 6개 LangBlock 파싱됨
- ✅ 6개 externLibs 생성
- ✅ 의존성 그래프 구성

### Step 4: 컴파일 시뮬레이션

```bash
npx ts-node -e "
  const { NexusCodegen } = require('./src/nexus/codegen');
  const { NexusRunner } = require('./src/nexus/runtime');
  
  const codegen = new NexusCodegen();
  const result = codegen.generateProgram(ast);
  
  console.log('생성된 C 코드 줄수:', result.cCode.split('\n').length);
  console.log('생성된 Python 줄수:', result.pythonCode.split('\n').length);
  console.log('외부 라이브러리:', result.externLibs.map(l => l.artifact));
"
```

---

## 8️⃣ 주요 배운 점

### 🎓 6가지 언어 선택 기준

| 언어 | 선택 기준 | 대체 불가 |
|------|---------|---------|
| Rust | 메모리 안전 + 성능 | ❌ |
| C | POSIX 표준 라이브러리 | ❌ |
| Go | 크로스플랫폼 + 문자열 | ✓ Java |
| Zig | 저수준 비트 연산 | ✓ C |
| Julia | 수치 계산 + 행렬 | ✓ Python/Octave |
| Python | 통계 + 분석 + 스크립팅 | ✓ Lua/Perl |

### 🏗️ 확장 전략

```
1단계 (현재): 6개 언어
2단계: + Mojo (Python 컴파일), V (커스텀)
3단계: + Ruby, Node.js, Kotlin, Swift
4단계: + WASM (Rust → WASM), LLVM IR
```

---

## 9️⃣ 문제 해결

### Q1: 링크 순서 오류

```
undefined reference to 'sin_degrees'
```

**원인**: C 라이브러리 링크 전 math 함수 사용

**해결**:
```bash
gcc ... -lmath -lm  # math 우선
```

### Q2: 메모리 누수 (Go ↔ C)

```
C.CString() 할당 후 C.free() 필수
```

**해결**:
```go
defer C.free(unsafe.Pointer(result))
```

### Q3: 크로스 컴파일

```bash
# ARM64 대상 컴파일
export GOOS=linux GOARCH=arm64
rustc --target aarch64-unknown-linux-gnu ...
```

---

## 🔟 최종 정리

### 📋 체크리스트

- [ ] 6개 언어 문법 이해
- [ ] 의존성 그래프 구성 가능
- [ ] 각 언어의 강점 파악
- [ ] 링크 플래그 정확히 알기
- [ ] 메모리 관리 (특히 C ↔ Go)
- [ ] 성능 최적화 기법 적용
- [ ] 에러 처리 및 디버깅

### 🎯 다음 도전

1. **실제 프로젝트**: 이미지 메타데이터 파이프라인 (5언어)
2. **성능 튜닝**: Rust + Julia + SIMD 병합
3. **분산 시스템**: 여러 서버에서 동시 실행
4. **WASM**: Rust → WASM으로 브라우저 실행

---

## 📚 참고 자료

| 리소스 | 설명 |
|--------|------|
| `src/nexus/runtime/dependency-graph.ts` | 토폴로지 정렬 구현 |
| `examples/image-metadata-pipeline.fl` | 5언어 실무 사례 |
| `tests/nexus-polyglot.test.ts` | 전체 통합 테스트 |

---

**축하합니다! 🎉 FreeLang Nexus 완전 마스터 완료!**

다음: [실무 프로젝트 사례 연구](./04-case-study.md)
