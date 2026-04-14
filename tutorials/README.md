# 🎓 FreeLang Nexus 튜토리얼

> **단일 파일에서 6개 언어를 완벽하게 섞는 방법을 배우세요!**

---

## 📚 학습 구조

### 🟢 **초급** (30분)

**[01-basic-tutorial.md](01-basic-tutorial.md)**

- 🎯 목표: 2개 언어 혼합 (Rust + Python)
- 📖 학습 파일: `examples/hello-world.fl`
- ✅ 배울 것:
  - `@lang()`, `@mode()` 지시문
  - Rust `extern "C" fn` 패턴
  - Python 동적 함수
  - V 오케스트레이션
  - 렉싱 → 파싱 → 코드생성

**후 다음 단계**:
- ✓ 새로운 Rust 함수 추가
- ✓ Python 함수 확장
- ✓ V에서 호출

---

### 🟡 **중급** (1시간)

**[02-intermediate-tutorial.md](02-intermediate-tutorial.md)**

- 🎯 목표: 3개 언어 혼합 (Rust + Go + Python)
- 📖 학습 파일: `examples/data-pipeline.fl`
- ✅ 배울 것:
  - 데이터 파이프라인 (ETL) 아키텍처
  - `@artifact()`, `@compile()` 지시문
  - 의존성 관리
  - 토폴로지 정렬
  - 링크 플래그 (`-L`, `-l`, `-lm`)
  - 실무 패턴

**후 다음 단계**:
- ✓ 추가 Go 함수 작성
- ✓ C 라이브러리 링크
- ✓ 복잡한 데이터 흐름

---

### 🔴 **고급** (2시간+)

**[03-advanced-tutorial.md](03-advanced-tutorial.md)**

- 🎯 목표: 6개 언어 완전 통합 (Rust + C + Go + Zig + Julia + Python)
- 📖 학습 파일: `examples/polyglot-demo.fl`
- ✅ 배울 것:
  - 각 언어의 강점과 선택 이유
  - 복잡한 의존성 분석
  - 병렬 빌드 최적화
  - 교차 언어 성능 튜닝
  - 실제 고주파 거래 시스템 사례
  - 고급 패턴 (캐싱, 콜백, 병렬)

**후 다음 단계**:
- ✓ 7번째 언어 추가 (Mojo, V)
- ✓ WASM 컴파일
- ✓ 분산 시스템 구축

---

## 🗺️ 학습 로드맵

```
시작
  ↓
[01-basic] 30분
  - 개념: @lang, @mode, 렉싱
  - 실습: hello-world.fl
  ↓
[02-intermediate] 1시간
  - 개념: 파이프라인, 의존성, 링킹
  - 실습: data-pipeline.fl
  ↓
[03-advanced] 2시간
  - 개념: 6언어 마스터, 최적화
  - 실습: polyglot-demo.fl
  ↓
프로젝트 구축 🚀
  - 이미지 처리
  - 음성 인식
  - 블록체인
  - 머신러닝
```

---

## 🚀 빠른 시작

### 모두 한번에 실행

```bash
# Step 1: 전체 테스트
npm test -- tests/nexus-hello-world.test.ts
npm test -- tests/nexus-pipeline.test.ts
npm test -- tests/nexus-polyglot.test.ts

# Step 2: 파일 확인
cat examples/hello-world.fl
cat examples/data-pipeline.fl
cat examples/polyglot-demo.fl
```

### 개별 학습

```bash
# 초급만
npx ts-node tutorials/run-basic.js

# 중급만
npx ts-node tutorials/run-intermediate.js

# 고급만 (환경 충분히 설정된 경우)
npx ts-node tutorials/run-advanced.js
```

---

## 📖 각 튜토리얼의 섹션

### 공통 구조

| 섹션 | 설명 |
|------|------|
| **개요** | 무엇을 배울 것인가 |
| **파일 구조** | 코드 단계별 분석 |
| **핵심 개념** | 이론 설명 |
| **동작 흐름** | 처리 순서 시각화 |
| **실제 테스트** | 직접 해보기 |
| **배운 점** | 정리 및 체크리스트 |
| **다음 단계** | 심화 과제 |

---

## 🎯 학습 목표별 가이드

### 🎓 "기본 개념을 빨리 이해하고 싶어요"

→ **[01-basic-tutorial.md](01-basic-tutorial.md)** 읽기 (30분)
- @lang(), @mode() 이해
- FFI 개념 파악

---

### 🎓 "실제 데이터 처리 시스템을 만들고 싶어요"

→ **[02-intermediate-tutorial.md](02-intermediate-tutorial.md)** 읽고 따라하기 (1시간)
- 파이프라인 아키텍처
- 의존성 관리
- 링킹 방법

---

### 🎓 "모든 언어의 강점을 활용하고 싶어요"

→ **[03-advanced-tutorial.md](03-advanced-tutorial.md)** 마스터 (2시간+)
- 각 언어 선택 기준
- 성능 최적화
- 프로덕션 시스템

---

### 🎓 "특정 언어만 깊이 있게 배우고 싶어요"

| 언어 | 튜토리얼 | 섹션 |
|------|---------|------|
| Rust | 01-기초 | Part 2 |
| Python | 01-기초 | Part 3 |
| Go | 02-중급 | Go FFI |
| C | 02-중급 | 링크 플래그 |
| Zig | 03-고급 | Zig 역할 |
| Julia | 03-고급 | Julia 역할 |

---

## ❓ 자주 묻는 질문

### Q: 어느 튜토리얼부터 시작해야 하나요?

**A**: 반드시 **01-basic**부터 시작하세요. FFI의 기본 개념이 없으면 나머지는 이해 어렵습니다.

### Q: 하나 언어만 알아도 되나요?

**A**: 네! V만 알아도 Nexus 사용 가능합니다.
- Rust/Go/C 코드는 **복사-붙여넣기** 가능
- Nexus가 자동으로 FFI 생성

### Q: 전체 튜토리얼에 걸리는 시간?

**A**:
- 읽기만: 1.5시간
- 실제 테스트 포함: 3시간
- 직접 코드 작성: 5시간+

### Q: 어느 환경에서 실행하나요?

**A**:
| 환경 | 필요사항 |
|------|---------|
| 초급 | Node.js 18+, TypeScript |
| 중급 | + Rust, Go, GCC |
| 고급 | + Zig, Julia, Python3 |

### Q: 튜토리얼 중 에러가 발생하면?

**A**: 각 튜토리얼의 **"문제 해결"** 섹션을 먼저 보세요.

---

## 🔗 다른 자료와의 연결

| 자료 | 연결점 |
|------|--------|
| `examples/README.md` | 6개 예제 개요 |
| `src/nexus/lexer/README.md` | 렉싱 심화 |
| `src/nexus/codegen/README.md` | C 코드 생성 이론 |
| `src/nexus/runtime/README.md` | 컴파일/링킹 심화 |
| `tests/*.test.ts` | 자동화 테스트 |

---

## 💡 학습 팁

### 💡 팁 1: 예제 파일 직접 수정

```bash
cp examples/hello-world.fl my-hello.fl
# 에디터에서 열고 수정
# 테스트 실행 → 결과 확인
```

### 💡 팁 2: 간단한 것부터 시작

```fl
@mode(v)

@lang("rust")
---
#[no_mangle]
pub extern "C" fn double_me(x: i32) -> i32 {
    x * 2
}
---

fn main() -> i64 {
  let result = double_me(21)
  println("Result: " + result)
  return 0
}
```

### 💡 팁 3: 에러 메시지 읽기

```
error: Line 15, Column 3: Expected STRING after @lang(
```

→ `@lang(rust)` 아니라 `@lang("rust")` (따옴표 필수)

### 💡 팁 4: 렉싱부터 테스트

```bash
# 파싱 전에 토큰 확인
npx ts-node -e "
  const { NexusLexer } = require('./src/nexus/lexer');
  const tokens = new NexusLexer(source).tokenize();
  console.log(tokens.map(t => t.type));
"
```

### 💡 팁 5: C 코드 생성 확인

```bash
# main.c 어떻게 생성되었는지 보기
npm test -- tests/nexus-hello-world.test.ts 2>&1 | grep main.c
```

---

## 🏆 학습 체크리스트

### 초급 완료

- [ ] @lang(), @mode() 개념 이해
- [ ] hello-world.fl 읽고 이해
- [ ] 테스트 통과 확인
- [ ] 새로운 Rust 함수 추가해보기

### 중급 완료

- [ ] 파이프라인 아키텍처 이해
- [ ] @artifact, @compile 설명 가능
- [ ] 토폴로지 정렬 개념 이해
- [ ] data-pipeline.fl 수정해보기

### 고급 완료

- [ ] 6개 언어 선택 이유 설명 가능
- [ ] 복잡한 의존성 그래프 그릴 수 있음
- [ ] polyglot-demo.fl 이해
- [ ] 새로운 언어 추가 가능

---

## 🚀 다음 단계

### 프로젝트 아이디어

1. **이미지 처리 파이프라인** (5언어)
   - Rust: 이미지 읽기
   - C: 필터 적용
   - Go: 파일 카운팅
   - Python: 통계

2. **음성 인식 시스템** (4언어)
   - Go: 오디오 읽기
   - Rust: 특성 추출
   - Python: ML 모델
   - V: API 제공

3. **블록체인 검증** (6언어)
   - Rust: 암호화
   - Go: 해싱
   - C: 수학 검증
   - Zig: 비트 연산
   - Julia: 복잡도 분석
   - Python: 결과 보고

---

## 📞 질문 및 피드백

이 튜토리얼이 도움이 되었나요?

- **버그 리포트**: GitHub Issues
- **개선 아이디어**: GitHub Discussions
- **추가 예제 요청**: Pull Request

---

## 📄 라이선스

This tutorial is part of FreeLang Nexus, licensed under MIT.

---

**Happy Learning! 🎉**

👉 **지금 [01-basic-tutorial.md](01-basic-tutorial.md)로 시작하세요!**
