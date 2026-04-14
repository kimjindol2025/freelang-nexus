# FreeLang Nexus — 아키텍처 설계

## 개요

FreeLang Nexus는 **단일 `.fl` 파일에서 여러 언어의 native 구현을 혼합 작성하고, 자동으로 FFI(Foreign Function Interface)를 생성하여 컴파일·링크하는 다중언어 컴파일러**입니다.

## 핵심 아이디어

```
┌─────────────────────────────────────────────┐
│  image-metadata-pipeline.fl (단일 파일)     │
├─────────────────────────────────────────────┤
│  @lang("rust")                              │
│  ---                                        │
│  pub extern "C" fn get_width() -> i32 {...} │
│  ---                                        │
│                                             │
│  @lang("go")                                │
│  ---                                        │
│  //export total_files                       │
│  func total_files() C.int { ... }          │
│  ---                                        │
│                                             │
│  @lang("c")                                 │
│  ---                                        │
│  double image_size_mb(...) { ... }         │
│  ---                                        │
│                                             │
│  @mode(python)                              │
│  def analyze(data): ...                     │
│                                             │
│  @mode(v)                                   │
│  fn main() -> i64 { ... }                   │
└─────────────────────────────────────────────┘
         ↓ (단일 컴파일러 실행)
    ┌──────────────────────┐
    │  렉싱 + 파싱         │
    │  + LangBlock 추출    │
    └──────────────────────┘
         ↓
    ┌──────────────────────┐
    │  AST 생성            │
    │  + 타입 검증         │
    └──────────────────────┘
         ↓
    ┌──────────────────────┐
    │  코드 생성            │
    │  C + Python          │
    └──────────────────────┘
         ↓
    ┌──────────────────────┐
    │  컴파일 + 링크       │
    │  (rust/go/c ...)    │
    └──────────────────────┘
         ↓
    ┌──────────────────────┐
    │  런타임 실행         │
    │  output 생성         │
    └──────────────────────┘
```

## 컴포넌트 구조

### 1. Lexer (`src/nexus/lexer/`)

**목적**: FreeLang 소스 코드를 토큰 스트림으로 변환

**토큰 타입**:
- `@mode`: V 모드 / Python 모드 전환
- `@lang`: Rust/Go/C/Zig/Julia 블록 선언
- `@artifact`: 생성 아티팩트 이름
- `@compile`: 컴파일 명령어
- `---`: 원본 코드 구분자
- V 모드: `fn`, `let`, `return` 등
- Python 모드: `def`, `import`, `print` 등

### 2. Parser (`src/nexus/parser/`)

**목적**: 토큰을 AST(Abstract Syntax Tree)로 변환

**주요 처리**:
1. **모드 감지**: `@mode(v)` vs `@mode(python)` 분기
2. **LangBlock 파싱**: `@lang()...---...---` 추출
3. **함수 정의 파싱**: 
   - V 함수: `fn name(...) -> Type { ... }`
   - Python 함수: `def name(...): ...`
4. **표현식 파싱**: 이항 연산, 함수 호출, 배열 접근 등

**AST 노드**:
```typescript
interface VFunction extends ASTNode {
  type: 'VFunction';
  name: string;
  params: Parameter[];
  returnType?: string;
  body: Statement[];
  mode: 'v';
}

interface LangBlock extends ASTNode {
  type: 'LangBlock';
  lang: string;           // "rust", "go", "c", etc.
  artifact?: string;      // "librng.so"
  compileCmd?: string;    // "rustc --crate-type cdylib ..."
  sourceCode: string;     // 원본 코드 (--- ... ---)
}

interface PyFunction extends ASTNode {
  type: 'PyFunction';
  name: string;
  params: Parameter[];
  body: Statement[];
  mode: 'python';
}
```

### 3. Codegen (`src/nexus/codegen/`)

**목적**: AST를 C/Python 코드로 변환

**생성 결과**:
```
main.c              # V 함수 → C 코드 (메인 프로그램)
exec_python.py      # Python 함수 실행 래퍼
build_commands.sh   # 각 언어별 컴파일 명령어
```

**프로세스**:

#### 3.1 LangBlock 처리

각 언어별 `extern "C"` 함수 추출:

```typescript
// Rust: pub extern "C" fn func_name()
// Go:   //export func_name
// C:    (직접 사용)
// Zig:  export fn func_name()
// Julia: (ccall 호출)

// → C 함수 선언 자동 생성:
extern void get_width(void);
extern int total_files(void);
```

#### 3.2 V 함수 → C 코드 변환

```v
fn main() -> i64 {
  let w = get_width()
  println("Width: " + w)
  return 0
}
```

↓

```c
#include <stdio.h>

extern int get_width(void);

int main() {
  long long w = get_width();
  printf("Width: %lld\n", w);
  return 0;
}
```

#### 3.3 Python 함수 격리

```python
def analyze(data):
  import statistics
  mean = statistics.mean(data)
  print("Mean: " + str(mean))
```

↓ (단독 `exec_python.py`에서 실행)

```python
import sys
sys.path.insert(0, '.')

def analyze(data):
  import statistics
  mean = statistics.mean(data)
  print("Mean: " + str(mean))

if __name__ == "__main__":
  data = [1.0, 2.0, 3.0]
  analyze(data)
```

### 4. Runner (`src/nexus/runtime/`)

**목적**: 생성된 코드를 실행하고 결과 수집

**프로세스**:

1. **LangBlock 빌드**
   ```bash
   rustc --crate-type cdylib -o librng.so rng.rs
   go build -buildmode=c-shared -o libcount.so .
   gcc -shared -o libmath.so math.c -lm
   ```

2. **C 프로그램 컴파일**
   ```bash
   gcc -o main main.c -lrng -lcount -lmath -L. -Wl,-rpath,.
   ```

3. **실행**
   ```bash
   ./main > output.txt 2>&1
   python3 exec_python.py > python_output.txt 2>&1
   ```

4. **결과 수집**
   ```typescript
   {
     cOutput: "Width: 3840\n...",
     pythonOutput: "Mean: 3.0\n...",
     errors: []
   }
   ```

## 의존성 관리 (토폴로지 정렬)

**문제**: 여러 LangBlock이 서로를 호출할 수 있음

**해결책**: 호출 그래프 분석 후 토폴로지 정렬

```
Rust (rng_next) ──┐
                  ├─→ C (compile math.c with -lrng)
C (sum_range) ────┘
                  
Python (analyze) ← C (size_mb) ← Go (total_files)
```

**정렬 순서**:
1. Rust 빌드 (독립적)
2. Go 빌드 (독립적)
3. C 빌드 (Rust 링크)
4. C 프로그램 (모두 링크)
5. Python 실행

## 타입 시스템

### V 모드 (정적 타입)
```
i64, f64, string, bool
[T], struct { field: T }
```

### Python 모드 (동적 타입)
```
int, float, str, bool, list, dict
```

### FFI 경계 (C 타입)
```
i64        → long long
f64        → double
string     → char* (제한적)
bool       → int
[T]        → 미지원 (배열은 데이터로 전달)
```

## 예제: Image Metadata Pipeline

### 입력 (`.fl` 파일)
```fl
@lang("rust")
---
#[no_mangle]
pub extern "C" fn get_width() -> i32 { 3840 }
---

@lang("c")
---
double image_size_mb(int w, int h, int c) {
  return (double)(w * h * c * 8) / 1000000.0;
}
---

@mode(python)
def analyze(data):
  import statistics
  print("Mean: " + str(statistics.mean(data)))

@mode(v)
fn main() -> i64 {
  let w = get_width()
  let size = image_size_mb(w, 2160, 4)
  analyze([2.0, 4.0, 6.0])
  return 0
}
```

### 처리 흐름

1. **Lexer**: 토큰 스트림 생성
2. **Parser**: AST 생성
   - LangBlock (Rust) 추출
   - LangBlock (C) 추출
   - PyFunction 추출
   - VFunction 추출
3. **Codegen**: 
   - `main.c` 생성 (V 함수 → C)
   - `exec_python.py` 생성 (Python 함수)
   - 링크 플래그: `-lrustlib -lclib`
4. **Runner**:
   - `rustc --crate-type cdylib ...` (librustlib.so)
   - `gcc -shared ...` (libclib.so)
   - `gcc -o main main.c -lrustlib -lclib` (main)
   - `./main` (실행)
   - `python3 exec_python.py` (실행)
5. **Output**: C 출력 + Python 출력 수집

## 확장 포인트

### 새로운 언어 추가 (예: Swift)

1. **ast.ts**: ExternCall.lang에 `'swift'` 추가
2. **codegen.ts**: 
   - `inferSourceName()`: `'swift': '.swift'` 추가
   - `genLangBlock()`: Swift `public func` 패턴 추출
3. **runner.ts**:
   - `hasSwift()`: 환경 감지
   - `buildLangBlock()`: Swift 컴파일 명령어 추가

### 새로운 V 기능 추가 (예: 구조체)

1. **ast.ts**: `StructDef` 정의
2. **parser.ts**: `parseStruct()` 구현
3. **codegen.ts**: 구조체 → C struct 변환

## 성능 특성

| 작업 | 시간 |
|------|------|
| 파싱 | ~10ms (1000줄) |
| Rust 빌드 | ~2-5s (최적화) |
| Go 빌드 | ~1-2s |
| C 컴파일 | ~0.5s |
| 링크 | ~1s |
| 실행 | ~0.1s |
| **전체** | ~5-10s |

## 제약사항

1. **V 모드**: Python과의 완벽한 호환성 불가 (의도적)
2. **FFI 경계**: 문자열 전달 제한 (C interop)
3. **메모리 관리**: Rust/C의 소유권 규칙 유지 필수
4. **병렬화**: 현재 순차 빌드 (개선 가능)

## 참고 자료

- [Lexer 구현](../src/nexus/lexer/)
- [Parser 구현](../src/nexus/parser/)
- [Codegen 구현](../src/nexus/codegen/)
- [Runtime 구현](../src/nexus/runtime/)
