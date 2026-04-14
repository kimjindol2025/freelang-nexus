# FreeLang Nexus — 예제 모음

다양한 난이도의 예제들로 FreeLang Nexus를 배워보세요.

## 📚 예제 목록

### 1️⃣ Hello World (초급)
**파일**: `hello-world.fl`

```
🦀 Rust  : 문자열 반복
🐍 Python: 인사말 함수
```

**포인트**:
- 가장 간단한 2개 언어 혼합
- 함수 호출 방식 이해
- 파일 크기: ~50줄

**실행**:
```bash
npx ts-node examples/hello-world.fl
```

---

### 2️⃣ Math Toolkit (초급~중급)
**파일**: `math-toolkit.fl`

```
🦀 Rust  : 피보나치, 팩토리얼
⚙️  C     : 삼각함수, 피타고라스
📊 Python: 통계 분석
```

**포인트**:
- 3개 언어 혼합
- 다양한 수학 함수
- C의 `-lm` 링크 학습
- 파일 크기: ~100줄

**특징**:
- Rust 재귀함수
- C 수학 라이브러리 (sin, cos, sqrt)
- Python statistics 모듈

---

### 3️⃣ String Processor (중급)
**파일**: `string-processor.fl`

```
🐹 Go    : 문자열 변환
⚙️  C     : 문자 분석
📊 Python: 단어 처리
```

**포인트**:
- Go 포인터 처리 (`*C.char`)
- C 문자 함수 (`isalpha`, `tolower`)
- 문자열 조작
- 파일 크기: ~120줄

**학습할 것**:
- Go의 `C.GoString()`, `C.CString()`
- C의 `ctype.h` 활용
- 안전한 메모리 관리

---

### 4️⃣ Data Pipeline (중급~고급)
**파일**: `data-pipeline.fl`

```
🦀 Rust  : 데이터 생성
🐹 Go    : 필터링
📊 Python: 분석
```

**포인트**:
- 실무적인 데이터 파이프라인
- 3개 언어의 역할 분담
- 난수 생성 → 필터링 → 통계 분석
- 파일 크기: ~130줄

**아키텍처**:
```
Rust (생성) → Go (필터) → Python (분석)
```

---

### 5️⃣ Polyglot Demo (고급)
**파일**: `polyglot-demo.fl`

```
🦀 Rust   : PCG RNG
⚙️  C      : 수학 함수
🐹 Go     : 해시
⚡ Zig    : 비트 연산
📊 Julia  : 피보나치
🐍 Python : 통계
🔷 V      : 오케스트레이터
```

**포인트**:
- **6개 언어** 완전 통합
- 각 언어의 강점 활용
- 컴파일 의존성 처리
- 파일 크기: ~200줄

**난이도**: 매우 높음

---

### 6️⃣ Image Metadata Pipeline (고급)
**파일**: `image-metadata-pipeline.fl`

```
🦀 Rust  : 이미지 메타데이터
🐹 Go    : 파일 카운팅
⚙️  C     : 수학 계산
📊 Python: 통계 분석
🔷 V     : 오케스트레이션
```

**포인트**:
- 실제 유즈 케이스
- 5개 언어 협력
- 해상도 계산, 통계 분석 등 실무 기능
- 파일 크기: ~150줄

---

## 🎯 난이도별 학습 경로

### 🟢 초급 (30분)
1. **hello-world.fl** — 2개 언어, 기본 구조 이해
2. **math-toolkit.fl** — 3개 언어, FFI 함수 호출

### 🟡 중급 (1시간)
3. **string-processor.fl** — 포인터 처리, C 라이브러리
4. **data-pipeline.fl** — 파이프라인 아키텍처

### 🔴 고급 (2시간+)
5. **polyglot-demo.fl** — 6개 언어 마스터
6. **image-metadata-pipeline.fl** — 실무 사례 분석

---

## 🚀 빠른 시작

### 모든 예제 테스트

```bash
npm test -- tests/nexus-polyglot.test.ts
npm test -- tests/nexus-image-pipeline.test.ts
```

### 특정 예제 실행

```bash
# 파일 읽기
cat examples/hello-world.fl

# (향후) 컴파일 및 실행
npx ts-node -e "
  const fs = require('fs');
  const { NexusLexer } = require('./src/nexus/lexer');
  const { NexusParser } = require('./src/nexus/parser');
  const source = fs.readFileSync('examples/hello-world.fl', 'utf-8');
  const tokens = new NexusLexer(source).tokenize();
  const ast = new NexusParser(tokens).parse();
  console.log(JSON.stringify(ast, null, 2));
"
```

---

## 📖 예제 구조 분석

### hello-world.fl 구조

```fl
@mode(v)              ← V 모드 시작

@lang("rust")         ← Rust 블록 선언
---                   ← 코드 시작
#[no_mangle]
pub extern "C" fn ... ← C 호출 가능 함수
---                   ← 코드 끝

@mode(python)         ← Python 모드로 전환

def greet(name):      ← Python 함수
    print(...)

@mode(v)              ← V 모드로 돌아옴

fn main() -> i64 {    ← V 메인 함수
    let len = repeat_string(...) ← Rust 함수 호출
    greet("FreeLang")             ← Python 함수 호출
}
```

---

## 💡 주요 패턴

### 패턴 1: Rust 외부 함수 정의
```rust
#[no_mangle]
pub extern "C" fn function_name(param: i32) -> i32 {
    // 구현
}
```

### 패턴 2: Go 내보내기
```go
//export function_name
func function_name(param C.int) C.int {
    // 구현
}
```

### 패턴 3: C 라이브러리 사용
```c
#include <math.h>  // ← @compile에 -lm 필수

double calculate(double x) {
    return sqrt(x);
}
```

### 패턴 4: Python 유틸리티
```python
@mode(python)

def helper_function(data):
    import module_name
    # 구현
```

### 패턴 5: V 오케스트레이션
```v
@mode(v)

fn main() -> i64 {
    let result = rust_function()
    python_function(result)
    return 0
}
```

---

## 🧪 테스트

각 예제는 별도의 테스트 파일을 가질 수 있습니다:

- `tests/nexus-polyglot.test.ts` — polyglot-demo.fl 검증
- `tests/nexus-image-pipeline.test.ts` — image-metadata-pipeline.fl 검증

---

## 📝 자신만의 예제 만들기

### Step 1: 새 파일 생성
```bash
touch examples/my-example.fl
```

### Step 2: 템플릿 사용
```fl
@mode(v)

@lang("rust")
---
#[no_mangle]
pub extern "C" fn my_function() -> i32 {
    42
}
---

@mode(v)

fn main() -> i64 {
    let result = my_function()
    println("Result: " + result)
    return 0
}
```

### Step 3: 테스트 추가
`tests/my-example.test.ts`를 만들어 검증하세요.

---

## 🤝 기여

새로운 예제 아이디어는 언제든 환영합니다!

---

**Happy coding with FreeLang Nexus! 🎉**
