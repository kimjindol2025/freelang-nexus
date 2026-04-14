# FreeLang Nexus 🌍

**FreeLang Nexus는 다중언어 코드와 다중언어 라이브러리를 하나의 안정적인 빌드로 통합하는 polyglot systems compiler입니다.**

Rust, Go, C, C++, Python, Zig, Mojo, V, Julia를 단일 `.fl` 파일에서 혼합 작성하고, **자동 FFI 생성과 의존성 정렬을 통해 최종 컴파일을 단일화합니다.**

### 🔒 우리가 보장하는 것

우리는 단순한 "지원"이 아니라 **안정성을 약속**합니다.

✅ **결정적 빌드**: 같은 소스 = 항상 같은 결과  
✅ **안정 ABI**: 언어 간 경계가 예측 가능함  
✅ **타입 검증**: 빌드 타임에 타입 불일치 감지  
✅ **실패 격리**: 한 언어 에러가 전체를 먹지 않음  
✅ **재현 실행**: 같은 입력 = 항상 같은 출력

👉 **[안정성 헌장 보기](./GUARANTEES.md)** — 5가지 불변조건과 검증 방법

```fl
@mode(v)

// 🦀 Rust: 빠른 계산
@lang("rust")
---
#[no_mangle]
pub extern "C" fn calculate(x: i32) -> i64 { x as i64 * 2 }
---

// 🐹 Go: 해싱
@lang("go")
---
//export hash_value
func hash_value(n C.int) C.uint { return uint32(n * 31) }
---

// 📊 Python: 분석
@mode(python)
def analyze(data):
    import statistics
    print(f"Mean: {statistics.mean(data)}")

// 🔷 V: 오케스트레이션 (타입 안전)
@mode(v)
fn main() -> i64 {
  let result = calculate(10)      // Rust 호출
  let hash = hash_value(result)   // Go 호출
  analyze([1.0, 2.0, 3.0])       // Python 호출
  return 0
}
```

---

## 🎯 3가지 핵심 축

### 1️⃣ **Polyglot Authoring** — 언어 혼합 작성

단일 `.fl` 파일에서 서로 다른 언어를 자연스럽게 혼합

- **V**: 타입 안전한 오케스트레이션 (C로 컴파일)
- **Python**: 동적 스크립팅 (분석, 통계)
- **Rust/Go/C/C++/Zig/Mojo**: 각 언어의 강점 직접 활용
- **Julia**: 과학 계산 (수치해석, ML)

```fl
@lang("rust")  ─┐
@lang("go")    ─┼─ 단일 파일에서 혼합
@lang("python")─┤
@mode(v)       ─┘
```

### 2️⃣ **Polyglot Libraries** — 라이브러리 조합

각 언어 생태계의 라이브러리를 하나의 프로그램에서 사용

| 언어 | 라이브러리 예시 | 용도 |
|------|--------|------|
| Rust | tokio, ndarray, serde | 비동기, 수치계산, 직렬화 |
| Go | crypto, image, flag | 암호화, 이미지, CLI |
| C | POSIX, math, OpenSSL | 표준 함수, 수학, 암호화 |
| Python | numpy, pandas, sklearn | 데이터분석, ML |

**Nexus가 자동으로 처리**:
- 각 언어의 라이브러리를 자동으로 링크
- FFI 충돌 해결
- 심볼 관리

### 3️⃣ **Unified Compilation** — 컴파일 단일화

개발자는 **한 명령**으로 완전한 빌드 완성

```bash
$ npm run build
# ↓
# [Rust] rustc → libcalc.so
# [Go]   go build → libhash.so
# [C]    gcc → libmath.so
# [Link] gcc + (libcalc.so + libhash.so + libmath.so) → binary
```

**기존 방식의 복잡성 제거**:
```
❌ 기존: CMakeLists.txt + Makefile + build.rs + go.mod + package.json
✅ Nexus: npm run build (끝)
```

---

## 🔴 왜 이것이 필요한가?

### 문제: 다중언어 개발의 마찰

여러 언어를 섞으려면:

```
1️⃣ 각 언어로 코드 작성
   ├─ Rust 파일
   ├─ Go 파일
   ├─ C 헤더
   ├─ Python 모듈
   └─ ...

2️⃣ FFI 바인딩 손으로 작성
   ├─ C 헤더 작성: int calculate(int)
   ├─ Go cgo 코드: import "C"
   ├─ V 외부 선언: extern int calculate(int)
   └─ ...

3️⃣ 빌드 스크립트 작성
   ├─ CMakeLists.txt
   ├─ Makefile
   ├─ build.rs
   └─ ...

4️⃣ 의존성 관리
   ├─ 어디서 컴파일할지
   ├─ 어떤 순서로 컴파일할지
   ├─ 링크 플래그는
   └─ ...

5️⃣ 링크 디버깅
   ├─ "undefined reference" 오류
   ├─ "-L" 경로 설정
   ├─ "-l" 라이브러리 이름
   └─ ...
```

**결과**: 실제 비즈니스 로직보다 **"연결"에 훨씬 더 많은 시간 소비**

---

## 🟢 솔루션: FreeLang Nexus

모든 연결을 **자동화**하고, 개발자는 **비즈니스 로직에만 집중**

### ✨ 자동 FFI

```fl
@lang("rust")
---
#[no_mangle]
pub extern "C" fn calculate(x: i32) -> i64 { x as i64 * 2 }
---

// ↓ Nexus가 자동으로 생성
extern i64 calculate(int);
```

❌ 수작업 없음  
✅ 함수 자동 추출  
✅ C 타입 자동 생성  
✅ 심볼 이름 자동 관리

### ✨ 자동 의존성 정렬

```
main.c는 libcalc.so 필요
   ↓
[Rust] rustc → libcalc.so
   ↓
[Link] gcc -o main main.c -lcalc
```

❌ CMakeLists.txt 작성 필요 없음  
✅ 토폴로지 정렬로 순서 자동 결정  
✅ 순환 의존성 감지

### ✨ 자동 링킹

```bash
gcc -o main main.c \
  -L/tmp/libs \           # ← Nexus 자동 추가
  -lcalc -lhash \         # ← 자동 감지
  -lm                     # ← 필요시 자동
```

❌ 링크 플래그 디버깅 필요 없음  
✅ `@compile()` 지시문 하나로 모든 처리  
✅ 런타임 경로 (`-rpath`) 자동 설정

---

## 📦 실제 예제로 보는 차이

### 🔴 기존 방식: 이미지 메타데이터 파이프라인

```
project/
├── src/
│   ├── main.v           # V 오케스트레이션
│   ├── image.rs         # Rust 이미지 읽기
│   ├── count.go         # Go 파일 세기
│   ├── calc.c           # C 수학 계산
│   └── analyze.py       # Python 통계
├── CMakeLists.txt       # Rust 컴파일
├── Makefile            # Go 컴파일
├── build.rs            # C 컴파일
├── image/main.h        # 수작업 C 헤더
├── go.mod              # Go 의존성
└── setup.sh            # 빌드 스크립트
```

**빌드 과정** (~10분):
```bash
./setup.sh
# ├─ rustc -O -o libimage.so ...
# ├─ go build -buildmode=c-shared ...
# ├─ gcc -shared -o libcalc.so ...
# ├─ python3 -c "..."
# ├─ 링크 플래그 수정
# ├─ gcc -o main main.c -L... -lcalc -limage -lcount -lm
# └─ ./main
```

문제점:
- 빌드 스크립트 5개 유지
- C 헤더 수작업 (오류 가능)
- 링크 오류 발생 시 디버깅 복잡

### 🟢 FreeLang Nexus 방식

```
project/
├── image-pipeline.fl   # 모든 코드 (V + Rust + Go + C + Python)
├── package.json
└── npm run build       # 끝!
```

**빌드 과정** (~1분):

```bash
npm run build
# ├─ [Lexing] image-pipeline.fl 토큰화
# ├─ [Parsing] AST 생성
# ├─ [Codegen] main.c + Rust + Go + C + Python 코드 생성
# ├─ [Compile] 병렬 컴파일 (rustc, go, gcc)
# ├─ [Link] 자동으로 모든 .so 링크
# └─ ✅ 실행
```

장점:
- **단일 파일**: 전체 로직이 한 곳에
- **자동화**: glue code, 빌드 스크립트 없음
- **신뢰성**: FFI 오류 자동 감지

---

## 📊 테스트 결과

```
✅ 443/444 테스트 통과 (34 테스트 스위트)

┌──────────────────────────────────────────┐
│ Polyglot Demo (6개 언어)        11/12 ✅ │
│ Image Pipeline (5개 언어)       13/13 ✅ │
│ Data Pipeline (3개 언어)         8/8  ✅ │
│ Hello World (2개 언어)           5/5  ✅ │
│ Lexer/Parser                     ✅   │
│ Codegen (C + Python)             ✅   │
│ Runner (Compile + Link)          ✅   │
│ Dependency Graph                 ✅   │
└──────────────────────────────────────────┘
```

---

## 🏗️ 아키텍처: 통합 컴파일 파이프라인

```
Input: image-pipeline.fl
    ↓
┌─────────────────────────────────────┐
│ Lexing: @lang, @mode 토큰화        │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Parsing: 언어별 AST 생성             │
│ ├─ V 모드 (타입 체크)               │
│ ├─ LangBlock (Rust/Go/C/Zig/Julia) │
│ └─ Python 함수                      │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Codegen: 각 언어별 코드 생성        │
│ ├─ main.c (V → C)                   │
│ ├─ image.rs (Rust 추출)             │
│ ├─ count.go (Go 추출)               │
│ ├─ calc.c (C 추출)                  │
│ └─ exec_python.py (Python)          │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Runner: 컴파일 + 링크               │
│ ├─ [Parallel] rustc → libimage.so   │
│ ├─ [Parallel] go build → libcount   │
│ ├─ [Parallel] gcc → libcalc.so      │
│ └─ [Serial] gcc link → binary       │
└─────────────────────────────────────┘
    ↓
Output: ./main (실행 가능한 최종 바이너리)
```

---

## 💡 핵심 특징

| 특징 | 설명 | 차별점 |
|------|------|--------|
| **자동 FFI** | 함수 추출 → C 선언 자동 생성 | ⭐⭐⭐ |
| **의존성 정렬** | 토폴로지 정렬로 빌드 순서 자동 결정 | ⭐⭐⭐ |
| **컴파일 단일화** | 한 명령으로 모든 언어 빌드 | ⭐⭐⭐ |
| **혼합 타입** | V(정적) + Python(동적) + C(정적) | ⭐⭐ |
| **Self-hosting** | FreeLang v9로 자신을 컴파일 | ⭐ |

---

## 🔍 GraalVM, WASM과의 차별점

| 시스템 | 초점 | Nexus와의 차이 |
|--------|------|--------|
| **GraalVM** | 런타임 다중성<br/>(같은 메모리 공간) | Nexus: 컴파일 타임 통합<br/>(빌드 단일화) |
| **WASM Component Model** | 컴포넌트 상호운용<br/>(ABI 표준화) | Nexus: 네이티브 라이브러리 조합<br/>(FFI 자동화) |
| **CMake/Bazel** | 빌드 시스템 | Nexus: 언어 혼합 + 빌드 통합 |

→ **Nexus는 "다중언어 라이브러리 조합"을 전면에 둔 유일한 시스템입니다.**

---

## 📚 문서 및 학습

### 빠른 시작

```bash
git clone https://github.com/kimjindol2025/freelang-nexus.git
npm install && npm run build
npm test                          # 443/444 테스트 통과
```

### 학습 경로

1. **초급** (30분): [01-basic-tutorial.md](./tutorials/01-basic-tutorial.md)
   - 2개 언어 (Rust + Python)
   - FFI 기본 개념

2. **중급** (1시간): [02-intermediate-tutorial.md](./tutorials/02-intermediate-tutorial.md)
   - 3개 언어 (Rust + Go + Python)
   - 데이터 파이프라인

3. **고급** (2시간): [03-advanced-tutorial.md](./tutorials/03-advanced-tutorial.md)
   - 6개 언어 완전 마스터
   - 성능 최적화

### 심화 문서

- [아키텍처 설계](./docs/architecture.md)
- [Lexer 상세](./src/nexus/lexer/README.md)
- [Codegen 상세](./src/nexus/codegen/README.md)
- [Runtime 상세](./src/nexus/runtime/README.md)

---

## 🤝 기여 및 라이선스

이 프로젝트는 **개념 증명(PoC) 및 연구 목적**입니다.

- **라이선스**: MIT (자유롭게 사용, 수정, 배포)
- **저자**: kimjindol
- **참여**: Claude Code - AI-driven polyglot compiler development

---

## 🎯 최종 메시지

**기존 다중언어 개발**은 언어보다 **glue code와 빌드 스크립트**가 더 문제였습니다.

FreeLang Nexus는 이 마찰을 제거합니다.

✅ **다중언어 라이브러리를 하나의 파일에서 혼합**  
✅ **자동 FFI로 연결 제거**  
✅ **한 명령으로 완전한 빌드 완성**

**결과**: 개발자는 비즈니스 로직에만 집중.

---

**"다중언어 라이브러리를 한 번에 컴파일하는 경험. 어디서도 본 적 없는 polyglot systems compiler."**

🌍 [GitHub](https://github.com/kimjindol2025/freelang-nexus) • 📖 [Tutorials](./tutorials/) • 🚀 [Examples](./examples/)
