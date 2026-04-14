# FreeLang Nexus 기초 튜토리얼

> 🟢 **난이도**: 초급 (30분)  
> 📚 **목표**: 2개 언어 혼합, 기본 개념 이해  
> 📖 **학습 파일**: `examples/hello-world.fl`

---

## 1️⃣ 개요: 단일 파일에서 2개 언어

FreeLang Nexus의 핵심은 **하나의 `.fl` 파일에서 여러 언어를 섞어서 쓴다**는 것입니다.

```
hello-world.fl (V + Rust + Python)
    ↓ (렉싱 + 파싱)
AST (추상 구문 트리)
    ↓ (코드 생성)
main.c (V 함수) + ... (Rust 라이브러리)
    ↓ (컴파일 + 링크)
실행 가능한 프로그램
```

**이번 예제에서 할 것**:
- ✅ Rust 함수 만들기 (`repeat_string`)
- ✅ Python 함수 만들기 (`greet`)
- ✅ V에서 두 함수 호출하기
- ✅ 전체 컴파일 및 실행

---

## 2️⃣ 파일 구조 분석

파일: `examples/hello-world.fl`

### Part 1: V 모드 선언

```fl
@mode(v)
```

- `@mode(v)` = "이제부터 V 언어 코드를 쓸 거야"
- V = FreeLang의 오케스트레이션 언어 (C로 컴파일됨)
- 타입 안전, 함수형

### Part 2: Rust 블록

```fl
@lang("rust")
---
#[no_mangle]
pub extern "C" fn repeat_string(n: i32) -> i32 {
    n * 5  // 5배 반복
}
---
```

**각 줄 설명**:

| 코드 | 의미 |
|------|------|
| `@lang("rust")` | 다음은 Rust 코드 |
| `---` | Rust 코드 시작 |
| `#[no_mangle]` | C에서 호출 가능하게 함 |
| `pub extern "C" fn` | C 스타일 함수 선언 |
| `repeat_string` | 함수 이름 |
| `(n: i32)` | 입력: 32비트 정수 |
| `-> i32` | 출력: 32비트 정수 |
| `---` | Rust 코드 끝 |

**Rust의 역할**: 빠른 계산이 필요한 부분 담당

### Part 3: Python 블록

```fl
@mode(python)

def greet(name):
    print("Hello, " + name + "! 👋")
```

**각 줄 설명**:

| 코드 | 의미 |
|------|------|
| `@mode(python)` | V 모드에서 Python 모드로 전환 |
| `def greet(name):` | Python 함수 정의 |
| `print(...)` | 화면에 출력 |

**Python의 역할**: 동적 스크립팅, 사용자 상호작용

### Part 4: V 메인 함수

```fl
@mode(v)

fn main() -> i64 {
  let length = repeat_string(5)
  println("길이: " + length)
  
  greet("FreeLang")
  return 0
}
```

**각 줄 설명**:

| 코드 | 의미 |
|------|------|
| `@mode(v)` | 다시 V 모드로 복귀 |
| `fn main()` | 메인 함수 (진입점) |
| `-> i64` | 반환 타입: 64비트 정수 |
| `let length = ...` | 변수 선언 + Rust 함수 호출 |
| `println(...)` | 화면 출력 (V 문법) |
| `greet("FreeLang")` | Python 함수 호출 |
| `return 0` | 정상 종료 (코드 0) |

**V의 역할**: 전체 흐름 제어 (오케스트레이션)

---

## 3️⃣ 실행 흐름

```
입력값: 5
    ↓
V main() 실행
    ↓
repeat_string(5) 호출 → Rust 실행 → 5 * 5 = 25 반환
    ↓
"길이: 25" 출력
    ↓
greet("FreeLang") 호출 → Python 실행
    ↓
"Hello, FreeLang! 👋" 출력
    ↓
프로그램 종료 (return 0)
```

---

## 4️⃣ 핵심 개념

### 🔗 FFI (Foreign Function Interface)

```
[V 함수]  ←→  [Rust 함수]  ←→  [C 라이브러리]
                   ↓
              (rustc 컴파일)
                   ↓
                librng.so (공유 라이브러리)
```

**Nexus가 자동으로 하는 것**:
1. Rust 코드에서 `extern "C" fn` 함수 찾기
2. C 헤더 만들기: `extern int repeat_string(int);`
3. Rust → librng.so 컴파일
4. V → main.c로 생성
5. main.c + librng.so 링크 → 최종 실행 파일

### 📍 `@lang()` 지시문

```fl
@lang("rust")     ← Rust FFI 블록
@lang("python")   ← Python 스크립팅 블록
@lang("go")       ← Go FFI 블록
@lang("c")        ← C 코드 직접 포함
```

### 📍 `@mode()` 지시문

```fl
@mode(v)      ← V 언어 모드 (타입 체크, C 컴파일)
@mode(python) ← Python 모드 (동적 스크립팅)
```

---

## 5️⃣ 실제 테스트

### Step 1: 파일 복사

```bash
cp examples/hello-world.fl ./test.fl
```

### Step 2: 렉싱 테스트

```bash
npx ts-node -e "
  const fs = require('fs');
  const { NexusLexer } = require('./src/nexus/lexer');
  const source = fs.readFileSync('./test.fl', 'utf-8');
  const tokens = new NexusLexer(source).tokenize();
  console.log('토큰 개수:', tokens.length);
  console.log('첫 10개 토큰:', tokens.slice(0, 10).map(t => t.type));
"
```

**예상 출력**:
```
토큰 개수: 58
첫 10개 토큰: [AT_MODE, LPAREN, IDENTIFIER, RPAREN, AT_LANG, ...]
```

### Step 3: 파싱 테스트

```bash
npm test -- tests/nexus-hello-world.test.ts
```

**확인사항**:
- ✅ 파싱 성공 (오류 없음)
- ✅ 3개 LangBlock 존재 (rust, python 포함)
- ✅ Main 함수 존재

---

## 6️⃣ 주요 배운 점

### 📌 Nexus의 3가지 핵심 패턴

#### 1️⃣ Rust FFI 패턴
```rust
#[no_mangle]
pub extern "C" fn function_name(param: i32) -> i32 {
    // Rust 구현
}
```
→ 고속 계산, 수치 분석에 최적

#### 2️⃣ Python 유틸리티 패턴
```python
@mode(python)

def function_name(param):
    # Python 구현
    print(param)
```
→ 동적 처리, 문자열 조작에 최적

#### 3️⃣ V 오케스트레이션 패턴
```v
fn main() -> i64 {
    let result = rust_function(x)
    python_function(result)
    return 0
}
```
→ 전체 흐름 제어, 타입 안전성

---

## 7️⃣ 이제 무엇을 할까?

✅ **이번 튜토리얼 완료 후**:

1. **문법 복습**:
   - `@mode()`, `@lang()` 지시문 이해
   - V 기본 문법 (let, println, return)
   - Rust `extern "C" fn` 패턴
   - Python 기본 함수

2. **다음 단계**:
   - 🟡 **중급 튜토리얼**: 3개 언어 혼합 (Rust + C + Python)
   - 데이터 처리 파이프라인 학습
   - 의존성 관리 (라이브러리 링크)

3. **실습**:
   - 새로운 Rust 함수 추가
   - Python 함수 확장
   - 더 복잡한 타입 (배열, 구조체) 시도

---

## 📚 추가 자료

| 파일 | 설명 |
|------|------|
| `src/nexus/lexer/README.md` | 렉싱 상세 가이드 |
| `src/nexus/codegen/README.md` | C 코드 생성 원리 |
| `src/nexus/runtime/README.md` | 컴파일 및 실행 프로세스 |
| `examples/README.md` | 모든 예제 설명 |

---

**다음 튜토리얼**: [02-intermediate-tutorial.md](02-intermediate-tutorial.md)
