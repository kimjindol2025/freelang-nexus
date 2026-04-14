# FreeLang Nexus 🌍

**단일 `.fl` 파일에서 6개 언어 FFI 완전 통합**

Rust + Go + Python + C + Zig + Julia를 한 파일에서 혼합 작성하고, 자동으로 컴파일·링크하는 **다중언어 FFI 컴파일러**입니다.

```fl
@mode(v)

@lang("rust")
---
#[no_mangle]
pub extern "C" fn rng_next() -> i64 { ... }
---

@lang("go")
---
//export count_files
func count_files() C.int { return 10 }
---

@lang("python")
def analyze(): ...

fn main() -> i64 {
  let result = rng_next()
  analyze([1.0, 2.0, 3.0])
  return 0
}
```

## ✨ 주요 기능

### 🎯 다중언어 혼합 작성
- **V 모드**: 타입 안전 오케스트레이터
- **Python 모드**: 데이터 분석·통계
- **@lang() 블록**: Rust, Go, C, Zig, Julia 네이티브 코드

### ⚡ 자동 FFI 생성
```
@lang("rust")           │  extern void rng_next(void);
@lang("go")      ──────>│  extern int count_files(void);
@lang("c")              │  extern double calc(int, int);
```
- 각 언어별 함수 자동 추출
- C 타입 선언 자동 생성
- 의존성 자동 정렬

### 🔗 컴파일 파이프라인
1. **렉싱/파싱**: V 모드 + Python 모드 + LangBlock 분석
2. **AST 생성**: 언어별 노드 타입 정의
3. **코드 생성**: C/Python 코드 생성
4. **빌드**: 언어별 컴파일러 호출 (.so 생성)
5. **링크**: 모든 artifact 통합 링크

## 📦 예제

### 📸 Image Metadata Pipeline (5개 언어)

```
🦀 Rust   → 이미지 메타데이터 (get_width, get_iso)
🐹 Go     → 파일 카운팅 (total_files, image_files)
⚙️ C      → 수학 연산 (image_size_mb, aspect_ratio)
📊 Python → 통계 분석 (stats_analyze)
🔷 V      → 오케스트레이터
```

**파일**: `examples/image-metadata-pipeline.fl`

### 🎲 Polyglot Demo (6개 언어)

```
🦀 Rust  → PCG 난수 생성기
⚙️ C     → 수학 함수 (-lm)
🐹 Go    → 문자열 해시
⚡ Zig   → 비트 연산
📊 Julia → 피보나치
🐍 Python→ 통계 분석
```

**파일**: `examples/polyglot-demo.fl`

## 🚀 시작하기

### 설치

```bash
git clone https://github.com/kim/freelang-nexus.git
cd freelang-nexus
npm install
npm run build
```

### 테스트

```bash
npm test                              # 전체 테스트 (443/444 PASS)
npm test -- tests/nexus-polyglot.test.ts      # Polyglot 테스트
npm test -- tests/nexus-image-pipeline.test.ts# Image Pipeline 테스트
```

### 예제 실행

```bash
npx ts-node examples/polyglot-demo.fl
```

## 🏗️ 아키텍처

```
┌─────────────────────────────────────┐
│        FreeLang Nexus               │
├─────────────────────────────────────┤
│ Lexer  ─> Parser ──> Codegen ─> Runner
├─────────────────────────────────────┤
│ ┌─── LangBlock (Rust) ──────────┐  │
│ │ ┌─── LangBlock (Go) ────────┐ │  │
│ │ │ ┌─── LangBlock (C) ──────┐│ │  │
│ │ │ │ ┌─── PyFunction ─────┐││ │  │
│ │ │ │ │ └── VFunction ────┘││ │  │
│ │ │ │ └──────────────────────┘│ │  │
│ │ │ └────────────────────────── │  │
│ │ └──────────────────────────────  │
│ └────────────────────────────────── │
└─────────────────────────────────────┘
         ↓ (AST + LangBlocks)
    ┌──────────────────────┐
    │ CodeGen             │
    ├──────────────────────┤
    │ main.c              │
    │ exec_python.py      │
    │ Link flags          │
    └──────────────────────┘
         ↓ (Compile)
    ┌──────────────────────┐
    │ Runtime             │
    ├──────────────────────┤
    │ rustc ──> lib.so    │
    │ go    ──> lib.so    │
    │ gcc   ──> lib.so    │
    │ python ──> output   │
    └──────────────────────┘
```

## 📊 테스트 결과

```
✅ 443/444 테스트 통과 (34 테스트 스위트)

Polyglot Demo:        11/12 PASS
Image Pipeline:       13/13 PASS
Lexer/Parser:         통과
Codegen:             통과
Runner:              통과
Self-reference:      통과
Minesweeper (4언어):  통과
```

## 🔑 핵심 파일

| 파일 | 설명 |
|------|------|
| `src/nexus/parser/ast.ts` | AST 노드 정의 (모든 언어) |
| `src/nexus/codegen/nexus-codegen.ts` | C/Python 코드 생성기 |
| `src/nexus/runtime/nexus-runner.ts` | 컴파일 및 실행 |
| `examples/polyglot-demo.fl` | 6개 언어 혼합 예제 |
| `examples/image-metadata-pipeline.fl` | 5개 언어 파이프라인 |

## 💡 독특한 특징

1. **Self-hosting**: 자신의 언어(FreeLang v9)로 자신을 컴파일
2. **자동 FFI**: 손으로 작성 없이 함수 자동 추출
3. **토폴로지 정렬**: 의존성 자동 계산하여 정확한 빌드 순서
4. **혼합 타입 시스템**: V 타입 + Python 동적 + C 정적 혼합
5. **완전 자동화**: 렉싱부터 링크까지 한 명령어

## 📚 문서

- [아키텍처 설계](./docs/architecture.md)
- [언어 문법](./docs/grammar.md)
- [확장 가이드](./docs/extending.md)

## 🤝 기여

이 프로젝트는 **개념 증명(PoC)** 및 **연구 목적**입니다.

아이디어, 버그 리포트, 기능 제안은 환영합니다.

## 📄 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능합니다.

## 👤 저자 및 참여

**저자**: kimjindol  
**참여**: Claude Code - AI-driven language compiler development

---

**"단일 파일, 6개 언어, 완벽한 FFI. 어디서도 본 적 없는 다중언어 컴파일러."**

🌍 [GitHub](https://github.com/kim/freelang-nexus) • 📖 [Documentation](./docs/) • 🚀 [Examples](./examples/)
