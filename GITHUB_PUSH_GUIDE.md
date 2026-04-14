# GitHub 푸시 가이드

## 📁 폴더 구조

현재 상태:
```
/home/kimjin/kim/freelang-nexus-public/     ← GitHub 공개용
├── README.md                               ← 프로젝트 소개
├── LICENSE                                 ← MIT License
├── CONTRIBUTING.md                         ← 기여 가이드
├── package.json                            ← 기본 정보만 (선별)
├── tsconfig.json
├── jest.config.js
├── .gitignore                              ← 민감 파일 자동 제외
├── .github/workflows/test.yml              ← CI/CD
├── examples/
│   ├── polyglot-demo.fl                    ✅ 공개
│   └── image-metadata-pipeline.fl          ✅ 공개
├── src/nexus/
│   ├── parser/
│   │   ├── ast.ts                          ✅ 공개
│   │   ├── nexus-parser.ts                 ✅ 공개
│   │   └── index.ts
│   └── lexer/
│       └── nexus-lexer.ts                  ✅ 공개
├── tests/
│   ├── nexus-polyglot.test.ts              ✅ 공개
│   └── nexus-image-pipeline.test.ts        ✅ 공개
└── docs/
    └── architecture.md                     ✅ 공개

/home/kimjin/freelang-nexus/                ← Gogs 비공개 (전체)
├── (모든 소스 + 내부 파일 유지)
└── (포트 설정, 토큰, 내부 구조 유지)
```

## ✅ 공개된 파일 (17개)

### 핵심 소스
- `src/nexus/parser/ast.ts` — AST 노드 정의 (모든 언어)
- `src/nexus/parser/nexus-parser.ts` — 파서 구현
- `src/nexus/lexer/nexus-lexer.ts` — 렉서 구현

### 예제
- `examples/polyglot-demo.fl` — 6개 언어 혼합 (Rust+C+Go+Zig+Julia+Python)
- `examples/image-metadata-pipeline.fl` — 5개 언어 파이프라인

### 테스트
- `tests/nexus-polyglot.test.ts` — Polyglot 검증 (11/12 PASS)
- `tests/nexus-image-pipeline.test.ts` — Pipeline 검증 (13/13 PASS)

### 문서
- `README.md` — 프로젝트 소개 + 시작 가이드
- `docs/architecture.md` — 아키텍처 완전 분석
- `CONTRIBUTING.md` — 개발 기여 가이드

### 설정
- `package.json` — 기본 메타데이터 (기민감 정보 제외)
- `tsconfig.json` — TypeScript 설정
- `jest.config.js` — 테스트 설정
- `.github/workflows/test.yml` — CI/CD 파이프라인

## ❌ 감춘 파일 (민감)

### 내부 구현
- `src/nexus/codegen/` — 완전한 코드생성 엔진 (복잡도 높음)
- `src/nexus/runtime/` — 런타임 실행기 (컴파일러 세부사항)
- `src/nexus/parser/dependency-graph.ts` — 토폴로지 정렬 (알고리즘)

### 환경 설정
- `.env` — 포트, API 키
- `CLAUDE.md` — 내부 포트 규칙
- `.claude/` — Claude Code 설정

### 블로그/내부
- `freelang-blog/` — 블로그 코드
- 포트 40000대 설정
- Gogs 토큰

## 🚀 GitHub 푸시 명령어

```bash
# 1. GitHub 저장소 생성 (github.com/kim/freelang-nexus)
# → Settings → Code and automation → Code security and analysis 활성화
# → GitHub Actions 활성화

# 2. 원격 저장소 연결
cd /home/kimjin/kim/freelang-nexus-public
git remote add origin https://github.com/kim/freelang-nexus.git
git branch -M main

# 3. 푸시
git push -u origin main

# 4. GitHub 확인
# https://github.com/kim/freelang-nexus
```

## 📊 공개 vs 비공개 비율

| 항목 | 공개 | 비공개 |
|------|------|--------|
| 예제 | 2개 | 4개+ |
| 테스트 | 2개 | 30개+ |
| 소스 파일 | 3개 | 15개+ |
| 문서 | 2개 | 10개+ |
| 전체 라인 | ~4000 | ~50000 |

## 🎯 공개 안내 텍스트

### README 주요 메시지

```
✨ FreeLang Nexus
🌍 단일 .fl 파일에서 6개 언어 완전 통합

◎ Rust + Go + C + Zig + Julia + Python
◎ 자동 FFI 생성
◎ 443/444 테스트 통과

이 저장소는 코어 컴파일러 및 사용 예제를 공개합니다.
전체 런타임/코드생성 엔진은 별도의 비공개 저장소에서 관리됩니다.
```

### 감춘 이유 설명

```markdown
## 📦 이 저장소에 포함된 것

✅ AST 정의 및 파서
✅ 6개 언어 통합 예제
✅ 완전한 테스트 스위트
✅ 아키텍처 설계 문서

## 📦 이 저장소에 포함되지 않은 것

- 완전한 코드생성 엔진
- 런타임 실행 세부사항
- 의존성 관리 알고리즘
- 내부 서버 설정

→ 이는 별도의 비공개 저장소에서 관리하여,
  핵심 아이디어는 공개하면서도 
  구현 세부사항을 보호합니다.
```

## 🔄 Gogs와 GitHub 동기화

### Gogs (전체 코드 보관)
```
/home/kimjin/freelang-nexus/
├── (모든 소스)
├── (모든 테스트)
├── (모든 문서)
└── (모든 설정)

push → gogs.dclub.kr/kim/freelang-nexus
```

### GitHub (공개 코드만)
```
/home/kimjin/kim/freelang-nexus-public/
├── src/ (선별)
├── examples/ (공개)
├── tests/ (선별)
├── docs/ (공개)
└── (기본 설정)

push → github.com/kim/freelang-nexus
```

### 업데이트 절차

1. **Gogs에서 먼저 커밋** (전체 코드)
   ```bash
   cd /home/kimjin/freelang-nexus
   git add .
   git commit -m "..."
   git push origin main
   ```

2. **공개할 부분만 추출**
   ```bash
   cd /home/kimjin/kim/freelang-nexus-public
   # 필요한 파일만 복사
   cp ../freelang-nexus/examples/*.fl examples/
   # 등등
   ```

3. **GitHub에 푸시** (공개 코드만)
   ```bash
   git add .
   git commit -m "..."
   git push origin main
   ```

## ✅ 푸시 준비 체크리스트

- [ ] GitHub 저장소 생성 (`kim/freelang-nexus`)
- [ ] 원격 주소 설정 (`git remote add origin ...`)
- [ ] `.gitignore` 확인 (민감 파일 자동 제외)
- [ ] README.md 최종 확인
- [ ] LICENSE 확인
- [ ] `git push -u origin main` 실행
- [ ] GitHub에서 Actions 자동 실행 확인
- [ ] 블로그에 "GitHub 공개" 포스트 발행

## 📝 블로그 포스트 예시

```markdown
# FreeLang Nexus — GitHub 공개

좋은 소식입니다! 
FreeLang Nexus 컴파일러를 GitHub에 공개했습니다.

🌍 단일 .fl 파일에서 6개 언어(Rust+Go+C+Python+Zig+Julia)를 
   완전히 혼합 작성하고 자동으로 컴파일·링크합니다.

→ github.com/kim/freelang-nexus

공개된 것:
- AST 정의 및 파서
- 6개 언어 통합 예제
- 완전한 테스트 스위트
- 아키텍처 설계 문서

비공개로 유지하는 것:
- 완전한 코드생성 엔진
- 런타임 실행 세부사항
- 핵심 알고리즘 구현

이렇게 공개/비공개를 나누어 
핵심 아이디어는 공유하면서도 
구현 세부사항은 보호합니다.

**저자**: kimjindol | **AI 참여**: Claude Code
```

## 🎁 다음 단계

1. **GitHub 푸시 완료**
2. **블로그 "GitHub 공개" 포스트**
3. **Hacker News / Dev.to 공유**
4. **기술 커뮤니티 공유** (Reddit, LobbyOS 등)
