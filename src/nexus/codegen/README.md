# Codegen — 코드 생성기

## 개요

`nexus-codegen.ts`는 AST를 **C + Python 코드**로 변환합니다.

```
AST (모든 언어 통일)
    ↓
CodeGen (C/Python 생성)
    ↓
main.c (V 함수 → C)
exec_python.py (Python 함수)
build_commands.sh (컴파일 명령어)
```

## 핵심 메서드

### `generateProgram(ast: Program): CodegenResult`

전체 프로그램 생성

```typescript
interface CodegenResult {
  cCode: string;           // 생성된 C 코드
  pythonCode: string;      // 생성된 Python 코드
  externLibs: ExternLib[]; // 외부 라이브러리 정보
  buildScript: string;     // 빌드 스크립트
}
```

### `genLangBlock(block: LangBlock)`

각 언어별 `extern "C"` 함수 추출

**Rust 패턴**:
```rust
#[no_mangle]
pub extern "C" fn my_func() -> i32
```
→ `extern int my_func(void);`

**Go 패턴**:
```go
//export my_func
func my_func() C.int
```
→ `extern int my_func(void);`

**C 패턴**:
```c
int my_func()
```
→ 그대로 사용

**Zig 패턴**:
```zig
export fn my_func() i32
```
→ `extern int my_func(void);`

### `inferSourceName(lang: string): string`

언어별 파일 확장자 결정

```typescript
switch(lang.toLowerCase()) {
  case 'rust': return '.rs';
  case 'go': return '.go';
  case 'c': return '.c';
  case 'zig': return '.zig';
  case 'julia': return '.jl';
  case 'python': return '.py';
}
```

## 생성 프로세스

### Step 1: LangBlock 처리

```typescript
for (const block of langBlocks) {
  // 1. 언어별 함수 추출
  const funcs = extractExterns(block.lang, block.sourceCode);
  
  // 2. C 선언 생성
  for (const func of funcs) {
    this.writeC(`extern ${func.returnType} ${func.name}(...);`);
  }
  
  // 3. 빌드 명령 저장
  if (block.compileCmd) {
    externLibs.push({
      lang: block.lang,
      artifact: block.artifact,
      buildCmd: block.compileCmd
    });
  }
}
```

### Step 2: V 함수 → C 변환

**입력** (V):
```v
fn main() -> i64 {
  let x = my_func(42)
  println("Result: " + x)
  return 0
}
```

**출력** (C):
```c
#include <stdio.h>

extern long long my_func(int);

int main() {
  long long x = my_func(42);
  printf("Result: %lld\n", x);
  return 0;
}
```

### Step 3: Python 함수 추출

**입력** (Python):
```python
@mode(python)
def analyze(data):
  import statistics
  print("Mean: " + str(statistics.mean(data)))
```

**출력** (exec_python.py):
```python
import sys
sys.path.insert(0, '.')

def analyze(data):
  import statistics
  print("Mean: " + str(statistics.mean(data)))

if __name__ == "__main__":
  data = [1.0, 2.0, 3.0]
  analyze(data)
```

## 타입 매핑

### V → C 타입 변환

| V | C | 설명 |
|---|---|------|
| `i64` | `long long` | 64비트 정수 |
| `i32` | `int` | 32비트 정수 |
| `f64` | `double` | 64비트 부동소수 |
| `string` | `char*` | 문자열 (제한적) |
| `bool` | `int` | 0/1 |

### 제약사항

- **배열**: C 배열 미지원 (스칼라만 가능)
- **문자열**: 긴 문자열은 printf 포맷 문제
- **구조체**: 기본 지원 없음

## 예제

### 간단한 예제

```typescript
const codegen = new NexusCodegen();
const result = codegen.generateProgram(ast);

console.log(result.cCode);        // main.c
console.log(result.pythonCode);   // exec_python.py
console.log(result.buildScript);  // 빌드 명령어
console.log(result.externLibs);   // 외부 라이브러리
```

## 최적화 팁

1. **매크로 사용**: 반복되는 코드는 매크로로
2. **인라인**: 작은 함수는 `inline` 키워드로
3. **링크 플래그**: `-O2` 최적화 레벨 사용
4. **LTO**: Link Time Optimization 활성화

---

**자세한 구현은 `nexus-codegen.ts` 참고**
