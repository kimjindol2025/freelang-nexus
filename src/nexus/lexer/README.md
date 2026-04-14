# Lexer — 어휘 분석기

## 개요

`nexus-lexer.ts`는 FreeLang 소스 코드를 **토큰 스트림**으로 변환합니다.

```
@mode(v)
@lang("rust")
---
#[no_mangle]
pub extern "C" fn my_func() -> i32 { 42 }
---
  ↓ (렉싱)
Token[], Token[], ...
[AT_MODE, LPAREN, IDENTIFIER("v"), ...]
[AT_LANG, LPAREN, STRING("rust"), ...]
[DASH_DASH_DASH, ...]
```

## 토큰 타입

### 지시문 (Directives)

```
@mode(v)          → AT_MODE, LPAREN, IDENTIFIER, RPAREN
@mode(python)     → AT_MODE, LPAREN, IDENTIFIER, RPAREN

@lang("rust")     → AT_LANG, LPAREN, STRING, RPAREN
@artifact("lib")  → AT_ARTIFACT, LPAREN, STRING, RPAREN
@compile("...")   → AT_COMPILE, LPAREN, STRING, RPAREN

@call python:numpy 1.24  → AT_CALL, IDENTIFIER, COLON, IDENTIFIER, NUMBER
```

### 키워드 (Keywords)

#### V 모드
```
fn, let, return, if, else, while, for, in
match, case, break, continue
```

#### Python 모드
```
def, import, if, else, elif, while, for, in
return, break, continue, try, except, finally
```

### 리터럴

```
NUMBER:  42, 3.14, 0xFF, 0b1010
STRING:  "hello", 'world'
IDENTIFIER: my_func, variable_name
```

### 연산자

```
PLUS (+), MINUS (-), STAR (*), SLASH (/)
PERCENT (%), POWER (**)
LOGICAL_AND (&&), LOGICAL_OR (||), NOT (!)
EQ (==), NE (!=), LT (<), GT (>), LE (<=), GE (>=)
ASSIGN (=), ARROW (->)
```

### 구분자

```
LPAREN ((), RPAREN ())
LBRACE ({), RBRACE (})
LBRACKET ([), RBRACKET (])
COMMA (,), COLON (:), SEMICOLON (;)
DOT (.)
TRIPLE_DASH (---)
```

## 렉싱 프로세스

### Step 1: 문자 읽기

```typescript
let ch = this.peek();           // 현재 문자
let nextCh = this.peek(1);      // 다음 문자

this.advance();                 // 다음으로 이동
```

### Step 2: 토큰 인식

```
'@'      → AT_DIRECTIVE (@ 기호)
'"'      → 문자열 읽기
'0'-'9'  → 숫자 읽기
'a'-'z', 'A'-'Z', '_' → 식별자 읽기
'-' '-' '-' → TRIPLE_DASH (---)
```

### Step 3: 토큰 생성

```typescript
const token = {
  type: TokenType.IDENTIFIER,
  value: 'my_func',
  line: 5,
  column: 10
};
```

## 예제

### 간단한 렉싱

```typescript
const lexer = new NexusLexer(`
@mode(v)

@lang("rust")
---
#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a + b
}
---

fn main() -> i64 {
  return 0
}
`);

const tokens = lexer.tokenize();

// 결과
[
  { type: AT_MODE, line: 2, column: 1 },
  { type: LPAREN, line: 2, column: 6 },
  { type: IDENTIFIER("v"), line: 2, column: 7 },
  { type: RPAREN, line: 2, column: 8 },
  { type: AT_LANG, line: 4, column: 1 },
  ...
  { type: TRIPLE_DASH, line: 5, column: 1 },
  ...
]
```

### 모드 전환

```typescript
// Input
`@mode(v)
fn main() { }

@mode(python)
def func(): pass
`

// Tokens
AT_MODE, LPAREN, IDENTIFIER("v"), RPAREN
FN, IDENTIFIER("main"), ...

AT_MODE, LPAREN, IDENTIFIER("python"), RPAREN
DEF, IDENTIFIER("func"), ...
```

## 특수 처리

### 문자열 리터럴

```
"hello world"  → STRING "hello world"
'single'       → STRING 'single'
"escaped\"quote" → STRING "escaped\"quote"
```

**이스케이프 시퀀스**:
```
\" → "
\\ → \
\n → 줄바꿈
\t → 탭
```

### 숫자 리터럴

```
42          → NUMBER 42
3.14        → NUMBER 3.14
0xFF        → NUMBER 255 (16진수)
0b1010      → NUMBER 10 (2진수)
1e10        → NUMBER 10000000000 (과학 표기법)
```

### 코드 블록 (`---...---`)

```
---
#[no_mangle]
pub extern "C" fn my_func() { }
---

→ 사이의 모든 코드는 RAW_CODE 토큰으로 (파싱 불필요)
```

## 에러 처리

### 예상 토큰 불일치

```
Input: `@lang(rust)  // 따옴표 누락

Error: Line 1, Column 7
Expected STRING after @lang(
```

### 미종료 문자열

```
Input: `let x = "hello

Error: Line 1
Unterminated string
```

### 알 수 없는 문자

```
Input: `let x = @#$

Error: Line 1, Column 8
Unknown character: '#'
```

## 최적화

### 키워드 테이블

```typescript
const KEYWORDS: Record<string, TokenType> = {
  'fn': TokenType.FN,
  'let': TokenType.LET,
  'def': TokenType.DEF,
  'return': TokenType.RETURN,
  ...
};

// 조회: O(1)
if (identifier in KEYWORDS) {
  return KEYWORDS[identifier];
}
```

### 토큰 캐싱

```typescript
// 자주 사용되는 토큰은 재사용
const LPAREN = new Token(TokenType.LPAREN);
const RPAREN = new Token(TokenType.RPAREN);
```

### 한 번에 읽기

```typescript
// 여러 문자를 한 번에 처리
if (ch === '-' && nextCh === '-' && peek(2) === '-') {
  advance();
  advance();
  advance();
  return TRIPLE_DASH;
}
```

## 토큰 시퀀스 분석

### 유효한 시퀀스

```
@mode ( v )                    ✓
@lang ( "rust" )               ✓
fn identifier ( params ) { }   ✓
```

### 무효한 시퀀스

```
@mode v                        ✗ (괄호 필요)
@lang rust                     ✗ (따옴표 필요)
fn 123 ( ) { }                 ✗ (식별자 필요)
```

## 디버깅

### 토큰 출력

```typescript
const lexer = new NexusLexer(source);
const tokens = lexer.tokenize();

for (const token of tokens) {
  console.log(`${token.type}: ${token.value} (${token.line}:${token.column})`);
}
```

### 토큰 흐름 추적

```typescript
// Verbose 모드
lexer.setVerbose(true);
const tokens = lexer.tokenize();
// → 각 토큰 생성 시 로그 출력
```

---

**자세한 구현은 `nexus-lexer.ts` 참고**
