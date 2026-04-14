# P1 Closure Note — Error Message Enhancement (완료)

**Commit:** `922f00a`  
**Date:** 2026-04-14  
**Status:** ✅ 완료 (Level 1.0 → 2.0)

---

## 무엇이 바뀌었나

### 1. BuildError 구조 + 분류 함수
**File:** `src/nexus/runtime/build-error.ts` (신규)

```typescript
export interface BuildError {
  lang: string;
  command: string;
  exitCode: number;
  stderr: string;
  classification: ErrorClassification;  // 분류
  suggestion: string;                   // 제안 한 줄
}

export function classifyError(lang, stderr, exitCode) → { classification, suggestion }
export function formatBuildError(error) → string
```

**5가지 분류:**
- `syntax` — 구문 오류 (error[E...], error:)
- `toolchain_missing` — 컴파일러 미설치 (command not found)
- `linker` — 링크 에러 (ld: cannot find, undefined reference)
- `symbol` — 심볼 오류 (undefined symbol, unresolved)
- `unsupported` — 미지원 기능 (향후 P2)

### 2. buildLangBlock 에러 처리 개선
**File:** `src/nexus/runtime/nexus-runner.ts`

**Before:**
```
Go 빌드 실패: go build -buildmode=c-shared -o lib.so .
```

**After:**
```
[FreeLang Nexus] GO 빌드 실패
  원인: [LINKER] 링크 에러입니다. @artifact 이름이 일치하는지 확인하세요.
  명령: go build -buildmode=c-shared -o lib.so .
  종료 코드: 1
  stderr:
    ld: cannot find -lfoo
    ... (더 많은 출력)
```

### 3. 테스트 작성
**File:** `tests/error-messages.test.ts` (신규)

- E1-E7: 언어별 분류 검증 (7개)
- E8-E10: 포맷 검증 (3개)
- E11-E14: 언어 특화 패턴 (4개)
- E15-E20: 엣지 케이스 (6개)
- I1-I2: 통합 검증 (2개)
- **총 20개 테스트 케이스**

---

## 무엇이 아직 남았나

### 아직 미구현
- **병렬 빌드 실패 격리**: [LANG] prefix는 추가했으나, "직접 실패" vs "전파 실패" 구분 미구현
- **top 10 case 완전 커버**: 현재 5가지 주요 분류, 추가 세부 패턴 확장 필요
- **stderr 완전 캡처**: execSync는 stderr를 capture하기 어려움 (spawnSync 필요)

### 평가
"완전 폐쇄"이라 보기는 어렵지만, **에러 분류와 제안의 기초는 완성**. Level 2.0 (67%) 기준.

---

## 어떻게 검증했나

### 1. classifyError 정규식 패턴
```typescript
✅ Rust: error[E...] → syntax
✅ Go: undefined: → syntax, ld: cannot find → linker
✅ Zig: command not found → toolchain_missing
✅ C: undefined reference → symbol/linker
✅ 공통: ld:, linker, undefined reference, symbol mismatch
```

### 2. formatBuildError 포맷
```
✅ [LANG] 빌드 실패 (분류): 제안
✅ 원인, 명령, 종료 코드, stderr (첫 5줄)
✅ stderr 초과 시 "더 많은 출력" 표시
```

### 3. 테스트 커버리지
```
✅ 20개 테스트 케이스
✅ E1-E7: 언어별 분류
✅ E8-E10: 포맷 검증
✅ E11-E20: 엣지 케이스 + 통합
```

---

## TRUST-MATRIX 영향

| 항목 | 이전 | 현재 | 상향도 |
|------|------|------|--------|
| 에러 설명 품질 | Level 1 | Level 2 | ✅ +1 |
| 해결책 제시 | Level 1 | Level 2 | ✅ +1 |
| Failure Diagnostics (평균) | Level 1.0 | Level 2.0 | ✅ +1.0 |

**종합 영향:**
- Failure Diagnostics: 1.0 (33%) → 2.0 (67%)
- 전체 평균: 1.9 (63%) → 2.1 (70%)

---

## 다음 단계

P2: Type Bridge Tier System
- Goal: Level 2.0 → 2.6 (67% → 87%)
- Scope: Tier 1/2/3/4 분류, 포인터 규칙, 진단 메시지

