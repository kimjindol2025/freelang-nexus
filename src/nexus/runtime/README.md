# Runtime — 런타임 실행기

## 개요

`nexus-runner.ts`는 생성된 C/Python 코드를 **컴파일하고 실행**합니다.

```
CodegenResult (C + Python 코드)
    ↓
NexusRunner
    ├─ LangBlock 빌드 (rustc, go, gcc, ...)
    ├─ C 컴파일 + 링크
    ├─ Python 실행
    └─ 결과 수집
```

## 핵심 메서드

### `run(result: CodegenResult): RunResult`

전체 프로그램 실행

```typescript
interface RunResult {
  cOutput: string;      // C 프로그램 stdout
  pythonOutput: string; // Python stdout
  errors: string[];     // 에러 목록
}
```

**프로세스**:
1. 임시 디렉토리 생성
2. LangBlock 빌드 (병렬 가능)
3. C 컴파일 + 링크
4. 프로그램 실행
5. Python 실행
6. 결과 수집

### `buildLangBlock(block: ExternLib): string`

각 언어별 컴파일

```typescript
// Rust
rustc --crate-type cdylib -O -o librng.so rng.rs

// Go
go build -buildmode=c-shared -o libcount.so .

// C
gcc -shared -fPIC -O2 -o libmath.so math.c -lm

// Zig
zig build-lib -dynamic -O ReleaseSafe bitops.zig

// Julia
julia --startup-file=no -e 'using PackageCompiler; ...'
```

### `buildDependencyGraph(externLibs): DependencyGraph`

의존성 계산 및 **토폴로지 정렬**

```
Rust (독립)
  ↓
C (Rust 링크)
  ↓
메인 프로그램 (모두 링크)
```

## 의존성 해결 (토폴로지 정렬)

### 문제

```
main.c는 rng_next() 호출
  → librng.so 필요
    → Rust 빌드 필수
      
main.c는 sum_range() 호출
  → libmath.so 필요
    → C 빌드 필수
      → (독립적)
```

### 해결

**DependencyGraph** 클래스:
```typescript
class DependencyGraph {
  addNode(lib: ExternLib);
  addEdge(from, to);           // 의존성 추가
  topologicalSort(): ExternLib[]; // 정렬된 순서
}
```

**결과**:
```
1. Rust 빌드 (librng.so)
2. C 빌드 (libmath.so)
3. 메인 프로그램 (모두 링크)
```

## 컴파일 예제

### Simple Case (단일 언어)

```typescript
const runner = new NexusRunner();
const result = runner.run({
  cCode: "#include <stdio.h>\nint main() { printf(\"Hello\\n\"); return 0; }",
  pythonCode: "",
  externLibs: [],
  buildScript: ""
});

console.log(result.cOutput);  // "Hello\n"
console.log(result.errors);   // []
```

### Complex Case (다중 언어)

```typescript
const result = runner.run({
  cCode: `
    extern int get_random(void);
    int main() {
      int x = get_random();
      printf("Random: %d\\n", x);
      return 0;
    }
  `,
  pythonCode: "print('Python done')",
  externLibs: [
    {
      lang: 'rust',
      artifact: 'librng.so',
      buildCmd: 'rustc --crate-type cdylib -o librng.so rng.rs'
    }
  ],
  buildScript: "..."
});

// 결과
// C output: "Random: 42\n"
// Python output: "Python done\n"
// Errors: []
```

## 환경 감지

각 언어별 컴파일러 설치 여부 확인:

```typescript
function hasRustc(): boolean {
  try { 
    execSync('rustc --version', { stdio: 'pipe' }); 
    return true; 
  } catch { 
    return false; 
  }
}

function hasGo(): boolean { ... }
function hasGcc(): boolean { ... }
function hasZig(): boolean { ... }
function hasPython3(): boolean { ... }
```

**사용**:
```typescript
if (hasRustc()) {
  // Rust 빌드 진행
} else {
  errors.push('rustc not installed');
}
```

## 링크 플래그

### 기본 링크

```bash
gcc -o main main.c \
  -L/tmp/libs \              # 라이브러리 검색 경로
  -lrng -lgo -lmath \        # 링크할 라이브러리 (-l prefix)
  -lm \                      # 표준 라이브러리 (math)
  -Wl,-rpath,/tmp/libs       # 런타임 라이브러리 경로
```

### 플래그 설명

| 플래그 | 의미 |
|--------|------|
| `-L<dir>` | 라이브러리 검색 경로 추가 |
| `-l<name>` | lib<name>.so 링크 |
| `-lm` | libm.so (math 라이브러리) |
| `-Wl,...` | 링커에 옵션 전달 |
| `-rpath` | 런타임 라이브러리 경로 저장 |

## 에러 처리

### 컴파일 에러

```
"C 컴파일/실행 에러: 컴파일 실패 (gcc): ..."
→ GCC 컴파일 실패 (권한, 문법 오류 등)
```

### 런타임 에러

```
"Segmentation fault"
→ C 프로그램 크래시 (포인터 오류, 메모리 접근)
```

### 링크 에러

```
"undefined reference to 'my_func'"
→ 외부 함수를 찾을 수 없음 (라이브러리 미빌드)
```

## 성능 최적화

### 병렬 빌드

```typescript
// 현재: 순차 빌드
for (const lib of externLibs) {
  buildLangBlock(lib);
}

// 개선: 병렬 빌드
await Promise.all(
  externLibs.map(lib => buildLangBlock(lib))
);
```

### 캐싱

```typescript
// 빌드 해시 계산
const hash = md5(sourceCode);

// 캐시 확인
if (cache[hash]) {
  return cache[hash];
}

// 빌드
const result = build();
cache[hash] = result;
```

## 디버깅

### 중간 생성물 확인

```typescript
// main.c 저장
fs.writeFileSync('/tmp/main.c', cCode);

// exec_python.py 저장
fs.writeFileSync('/tmp/exec_python.py', pythonCode);

// 컴파일 명령어 확인
console.log(buildScript);
```

### 상세 로깅

```typescript
const runner = new NexusRunner();
runner.setVerbose(true);  // 모든 명령어 출력

const result = runner.run(codegen);
// rustc --crate-type cdylib ...
// go build -buildmode=c-shared ...
// gcc -o main main.c ...
// ./main
```

## 주의사항

### 메모리 관리

- Rust/C: 포인터 사용 시 메모리 누수 주의
- Python: 대용량 데이터는 메모리 부족 가능

### 포트 충돌

- 여러 LangBlock이 같은 포트 사용 시 에러
- 각 언어는 독립적인 서버 포트 사용 불가

### 경로 문제

- 라이브러리 경로는 `-rpath` 사용하여 절대 경로 설정
- 상대 경로는 작업 디렉토리에 따라 달라짐

---

**자세한 구현은 `nexus-runner.ts` + `dependency-graph.ts` 참고**
