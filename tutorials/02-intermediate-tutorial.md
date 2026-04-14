# FreeLang Nexus 중급 튜토리얼

> 🟡 **난이도**: 중급 (1시간)  
> 📚 **목표**: 3개 언어 혼합, 데이터 파이프라인, 의존성 관리  
> 📖 **학습 파일**: `examples/data-pipeline.fl`

---

## 1️⃣ 개요: 데이터 처리 파이프라인

이번 예제는 실무에서 자주 보는 **ETL 패턴**(Extract → Transform → Load)을 구현합니다.

```
🦀 Rust (데이터 생성)
    ↓
[난수 5개 생성]
    ↓
🐹 Go (데이터 필터링)
    ↓
[짝수만 선택]
    ↓
📊 Python (데이터 분석)
    ↓
[통계 계산]
```

**이번 예제에서 배울 것**:
- ✅ 3개 언어의 역할 분담
- ✅ 라이브러리 의존성 관리
- ✅ 함수 간 데이터 흐름
- ✅ 실제 비즈니스 로직 구현

---

## 2️⃣ 파일 구조: 3가지 언어 역할

파일: `examples/data-pipeline.fl`

### 🦀 **Rust**: 데이터 생성

```rust
@lang("rust")
@artifact("libdata.so")
@compile("rustc --crate-type cdylib -O -o libdata.so data.rs")
---
#[no_mangle]
pub extern "C" fn generate_random(seed: i32) -> i32 {
    let mut x = seed as u32;
    x = x.wrapping_mul(1664525).wrapping_add(1013904223);
    (x % 100) as i32
}

#[no_mangle]
pub extern "C" fn sum_range(start: i32, end: i32) -> i64 {
    let mut sum = 0i64;
    for i in start..=end {
        sum += i as i64;
    }
    sum
}
---
```

**Rust의 역할**:
- **고속 난수 생성**: LCG(Linear Congruential Generator) 알고리즘
- **범위 합계**: 1부터 N까지의 합 계산

**핵심 개념**:

| 개념 | 설명 |
|------|------|
| `#[no_mangle]` | C에서 호출 가능 (심볼 이름 보존) |
| `extern "C"` | C 호출 규약 사용 |
| `wrapping_mul` | 오버플로우 허용 (순환 곱셈) |
| `as i32` | 타입 변환 (u32 → i32) |

---

### 🐹 **Go**: 데이터 필터링

```go
@lang("go")
@artifact("libfilter.so")
@compile("go build -buildmode=c-shared -o libfilter.so .")
---
package main

import "C"

//export filter_even
func filter_even(n C.int) C.int {
    if int(n)%2 == 0 {
        return 1  // 짝수
    }
    return 0      // 홀수
}

//export multiply_by_two
func multiply_by_two(n C.int) C.int {
    return n * 2
}

func main() {}
---
```

**Go의 역할**:
- **필터링**: 짝수/홀수 판별
- **변환**: 값을 2배로

**핵심 개념**:

| 개념 | 설명 |
|------|------|
| `package main` | Go 진입점 |
| `import "C"` | C FFI 지원 |
| `//export` | 함수를 C에 내보내기 |
| `C.int` | Go의 C 타입 (int) |
| `int(n)` | C.int를 Go int로 변환 |

---

### 📊 **Python**: 데이터 분석

```python
@mode(python)

def analyze_array(name, values):
    import statistics

    print("\n" + name + " 분석:")
    mean = statistics.mean(values)
    total = sum(values)
    print("  합계: " + str(total))
    print("  평균: " + str(mean))
    print("  개수: " + str(len(values)))
```

**Python의 역할**:
- **통계 분석**: 평균, 합계, 개수 계산
- **보고서 생성**: 읽기 쉬운 형태로 출력

**핵심 개념**:

| 개념 | 설명 |
|------|------|
| `import statistics` | 표준 라이브러리 사용 |
| `statistics.mean()` | 평균값 계산 |
| `str()` | 숫자를 문자열로 변환 |

---

### 🔷 **V**: 오케스트레이션

```v
@mode(v)

fn main() -> i64 {
  println("╔════════════════════════════════════════════╗")
  println("║  Data Pipeline — 데이터 처리               ║")
  println("╚════════════════════════════════════════════╝")

  println("\n[Rust] 데이터 생성...")
  let r1 = generate_random(42)
  let r2 = generate_random(123)
  let r3 = generate_random(999)
  println("[Rust] 난수: " + r1 + ", " + r2 + ", " + r3)

  println("\n[Rust] 범위 합계...")
  let sum = sum_range(1, 10)
  println("[Rust] sum(1..10) = " + sum)

  println("\n[Go] 데이터 필터링...")
  let is_even_r1 = filter_even(r1)
  println("[Go] " + r1 + "는 짝수인가? " + is_even_r1)

  let doubled = multiply_by_two(r1)
  println("[Go] " + r1 + " × 2 = " + doubled)

  println("\n[Python] 통계 분석...")
  let samples = [10.0, 20.0, 30.0, 40.0, 50.0]
  analyze_array("데이터셋", samples)

  println("\n✅ 파이프라인 완료!")
  return 0
}
```

**V의 역할**:
- 전체 워크플로우 제어
- 함수 호출 순서 결정
- 사용자 피드백 (print)

---

## 3️⃣ 컴파일 과정 상세

### 🔄 자동 처리 (Nexus가 내부에서 함)

```
data-pipeline.fl
    ↓ (렉싱 + 파싱)
AST
    ↓ (코드 생성)
├─ main.c (V 함수 → C)
├─ data.rs (Rust 코드)
├─ filter.go (Go 코드)
└─ build_commands.sh (빌드 스크립트)
    ↓ (병렬 컴파일)
├─ rustc → libdata.so
├─ go build → libfilter.so
└─ gcc → main (링크)
    ↓
./main (실행)
```

### 🔗 링크 과정

```bash
gcc -o main main.c \
  -L/tmp/libs \              # 라이브러리 검색 경로
  -ldata -lfilter \          # Rust, Go 라이브러리
  -lm \                      # C 수학 라이브러리
  -Wl,-rpath,/tmp/libs       # 런타임 라이브러리 경로
```

**각 플래그 설명**:

| 플래그 | 의미 |
|--------|------|
| `-L/tmp/libs` | `/tmp/libs`에서 라이브러리 찾기 |
| `-ldata` | `libdata.so` 링크 |
| `-lfilter` | `libfilter.so` 링크 |
| `-lm` | libm.so (수학 함수) 링크 |
| `-rpath` | 런타임에 라이브러리 경로 저장 |

---

## 4️⃣ 핵심 개념: 의존성 해석

### 📊 토폴로지 정렬 (Topological Sort)

Nexus는 자동으로 **빌드 순서**를 결정합니다.

```
main.c는 libdata.so, libfilter.so 필요
    ↓
Rust 빌드 필수 (libdata.so 생성)
Go 빌드 필수 (libfilter.so 생성)
    ↓
둘 다 완료 후 gcc로 링크
```

**순서**:
```
Step 1: rustc --crate-type cdylib -O -o libdata.so data.rs
Step 2: go build -buildmode=c-shared -o libfilter.so .
Step 3: gcc -o main main.c -ldata -lfilter -lm -Wl,-rpath,...
Step 4: ./main
```

### 📍 @artifact & @compile

```fl
@lang("rust")
@artifact("libdata.so")        ← 생성될 라이브러리 이름
@compile("rustc ... libdata.so") ← 빌드 명령어
```

**Nexus가 이용하는 정보**:
- `@artifact`: 라이브러리 이름 결정 (링킹 시 `-ldata`)
- `@compile`: 정확한 빌드 명령어 (캐싱 가능)

---

## 5️⃣ 실제 동작 흐름

### 입력값
```
Rust seed: 42, 123, 999
Range: 1 ~ 10
Python 샘플: [10.0, 20.0, 30.0, 40.0, 50.0]
```

### 처리 흐름

```
generate_random(42)
  → Rust: x = 42
  → x *= 1664525; x += 1013904223
  → (x % 100) as i32
  → 반환: 82

filter_even(82)
  → Go: 82 % 2 == 0?
  → return 1 (짝수)

multiply_by_two(82)
  → Go: 82 * 2
  → return 164

analyze_array("데이터셋", [10.0, ..., 50.0])
  → Python: 
    mean = 30.0
    total = 150
    len = 5
  → 출력: "합계: 150, 평균: 30.0, 개수: 5"
```

---

## 6️⃣ 실제 테스트

### Step 1: 예제 복사

```bash
cp examples/data-pipeline.fl ./pipeline-test.fl
```

### Step 2: 파싱 검증

```bash
npm test -- tests/nexus-pipeline.test.ts
```

**확인사항**:
- ✅ 3개 LangBlock (rust, go, python) 파싱됨
- ✅ externLibs 2개 생성 (libdata.so, libfilter.so)
- ✅ V main 함수 존재

### Step 3: 의존성 분석

```bash
npx ts-node -e "
  const { DependencyGraph } = require('./src/nexus/runtime/dependency-graph');
  const graph = new DependencyGraph();
  // ... 노드/엣지 추가
  const sorted = graph.topologicalSort();
  console.log('빌드 순서:', sorted.map(lib => lib.artifact));
"
```

**예상 출력**:
```
빌드 순서: ['libdata.so', 'libfilter.so']
```

---

## 7️⃣ 주요 배운 점

### 🎓 3가지 역할 분담

```
┌─────────────────────────────────────────┐
│      V (오케스트레이션)                  │
│  - 흐름 제어                            │
│  - 타입 안전                            │
│  - 함수 호출 순서                       │
└─────────────────────────────────────────┘
    ↓             ↓             ↓
┌──────────┐ ┌──────────┐ ┌──────────┐
│   Rust   │ │    Go    │ │  Python  │
│          │ │          │ │          │
│ 고속 계산 │ │ 유연 처리 │ │ 동적 분석 │
└──────────┘ └──────────┘ └──────────┘
```

### 🔗 4가지 핵심 지시문

| 지시문 | 목적 |
|--------|------|
| `@lang("rust")` | Rust 코드 블록 선언 |
| `@artifact("libdata.so")` | 생성될 라이브러리 이름 |
| `@compile("...")` | 빌드 명령어 |
| `@mode(v)` | V 모드로 전환 |

### 🏗️ 실무 패턴

**이 구조는 이런 실제 업무에 적용 가능**:
- 데이터 파이프라인 (ETL)
- 실시간 스트림 처리
- 이미지/비디오 처리
- 머신러닝 추론

---

## 8️⃣ 일반적인 문제와 해결책

### Q1: 라이브러리를 찾을 수 없다는 오류

```
error: undefined reference to 'generate_random'
```

**원인**: Rust 라이브러리 빌드 실패

**해결책**:
```bash
# Rust 설치 확인
rustc --version

# 수동 빌드
rustc --crate-type cdylib -O -o libdata.so data.rs
```

### Q2: 함수 시그니처 불일치

```
C에서는 int generate_random(int)를 기대했는데
Rust에서는 pub extern "C" fn generate_random(seed: i32) -> i32를 제공
```

**해결책**: V 코드에서 함수 호출 시 **정확한 인자 개수**와 **타입** 확인

```v
let r1 = generate_random(42)    // ✅ 맞음
let r2 = generate_random()      // ❌ 틀림 (인자 필수)
```

### Q3: Python 함수가 호출되지 않는다

```python
def analyze_array(name, values):
    ...
```

**원인**: Python은 `@mode(python)`에서만 정의되므로, V에서 호출 가능

**해결책**: 항상 Python 함수 정의 후 `@mode(v)`로 돌아와서 호출

---

## 9️⃣ 다음 단계

✅ **이번 튜토리얼 완료 후**:

1. **더 복잡한 데이터 구조**:
   - 배열 처리
   - 구조체 (struct)
   - 문자열 처리

2. **고급 기능**:
   - 에러 처리 (Result 타입)
   - 병렬 처리
   - 네트워크 I/O

3. **실무 프로젝트**:
   - 이미지 메타데이터 파이프라인 (고급 튜토리얼)
   - 음성 처리 시스템
   - 블록체인 트랜잭션 분석

---

## 📚 추가 자료

| 파일 | 설명 |
|------|------|
| `src/nexus/runtime/README.md` | 컴파일/링킹 상세 |
| `src/nexus/runtime/dependency-graph.ts` | 토폴로지 정렬 구현 |
| `examples/README.md` | 모든 예제 개요 |

---

**다음 튜토리얼**: [03-advanced-tutorial.md](03-advanced-tutorial.md)
