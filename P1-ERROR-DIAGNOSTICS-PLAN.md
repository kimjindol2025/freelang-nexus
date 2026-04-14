# P1: Error Message Enhancement (에러 진단 품질)

**Epic:** Trust Closure (신뢰 갭 폐쇄)  
**Priority:** P1 (Failure Diagnostics를 1.0 → 2.0으로)  
**Target Level:** 2.0/3.0 (60%)  
**Duration:** 1주 (4일)

---

## 🎯 목표

**"빌드 실패가 발생했을 때, 사용자가 원인과 다음 행동을 이해할 수 있게 만든다."**

현재:
```
Go 빌드 실패: go build -buildmode=c-shared -o lib.so .
```

목표:
```
[FreeLang Nexus] Go 빌드 실패
  원인: ld: cannot find -lfoo (링크 에러)
  명령: go build -buildmode=c-shared -o lib.so .
  제안: @artifact 이름이 실제 .so 파일명과 일치하는지 확인하세요
  stderr: [... 실제 에러 메시지 ...]
```

---

## 📋 Scope (최소 범위)

### A. stderr/stdout 수집 및 출력
- 현재: `stdio: 'pipe'` 있으나 catch에서 버림
- 변경: execSync → 결과 버퍼 수집 → 에러 메시지에 포함

**Files:**
- `src/nexus/runtime/nexus-runner.ts:470~480` (buildLangBlock catch)
- `src/nexus/runtime/nexus-runner.ts:140` (빌드 실패 메시지)

### B. exit code + language + command 포함
- 현재 메시지: 언어명만 있음
- 변경: exit code, 언어명, 명령어, 작업 디렉토리 모두 포함

**Files:**
- 상동

### C. 실패 분류 1차 (5가지)
- `syntax_error` — Rust `error[E`, Zig `error:`
- `toolchain_missing` — `command not found in PATH`, `rustc not found`
- `linker_error` — `ld: cannot find -l`, `undefined reference`
- `symbol_error` — Go `undefined:`, Rust `error: unresolved`
- `unsupported_type` — 타입 변환 실패 (향후 P2)

**Implementation:**
- `src/nexus/runtime/build-error.ts` (신규 파일)
  ```typescript
  export interface BuildError {
    lang: string;
    command: string;
    exitCode: number;
    stderr: string;
    classification: 'syntax' | 'toolchain' | 'linker' | 'symbol' | 'unsupported';
    suggestion: string;
  }

  export function classifyError(lang: string, stderr: string, exitCode: number): { classification: string; suggestion: string } {
    // 언어별 패턴 매칭 + 제안 생성
  }
  ```

### D. 제안 한 줄 (각 실패 타입별)
- syntax → "구문을 확인하세요. 위의 stderr를 참고하세요."
- toolchain → "{{lang}} 컴파일러가 PATH에 없습니다. 설치 후 재시도하세요."
- linker → "링크 플래그를 확인하세요. @artifact 이름과 실제 아티팩트명이 일치하는지 확인하세요."
- symbol → "심볼이 누락되었을 수 있습니다. 의존성 또는 링크 순서를 확인하세요."
- unsupported → "지원되지 않는 타입 변환입니다. Type Bridge Tier를 확인하세요."

### E. 병렬 로그 분리 (최소)
- 현재: 로그가 섞일 수 있음
- 변경: 최소한 `[{{lang}}]` prefix 추가

**Files:**
- `src/nexus/runtime/nexus-runner.ts:140` (직접 실패 표시)
- `src/nexus/runtime/nexus-runner.ts:144` (전파 실패 표시 — 향후)

---

## 🔧 Implementation Checklist

### Phase 1: BuildError 구조 + 분류 함수

- [ ] `src/nexus/runtime/build-error.ts` 생성
  - [ ] BuildError 인터페이스
  - [ ] classifyError(lang, stderr, exitCode) 함수
  - [ ] 5가지 패턴 매칭 규칙
  - [ ] 각 언어별 제안 텍스트

**시간:** ~2시간

### Phase 2: buildLangBlock 에러 처리 개선

- [ ] `nexus-runner.ts:470~480` 수정
  - [ ] execSync catch에서 stderr 수집
  - [ ] BuildError 객체 생성
  - [ ] classifyError 호출
  - [ ] 상세 에러 메시지 생성

- [ ] `nexus-runner.ts:140` 수정
  - [ ] 기존 단순 메시지 → BuildError 출력
  - [ ] language prefix `[{{lang}}]` 추가

**시간:** ~1.5시간

### Phase 3: 테스트 작성

- [ ] `tests/error-messages.test.ts` 생성
  - [ ] E1: Rust syntax error 분류
  - [ ] E2: Go linker error 분류
  - [ ] E3: Zig toolchain missing 분류
  - [ ] E4: Symbol error 분류
  - [ ] E5: 에러 메시지 포맷 검증

**시간:** ~1.5시간

### Phase 4: 통합 검증

- [ ] 전체 빌드
- [ ] 기존 419+ 테스트 실행
- [ ] E2E: 실제 빌드 실패 시뮬레이션

**시간:** ~1시간

---

## 📐 Done 정의

모두 만족해야 P1 완료:

- [ ] top 5 실패 유형 중 stderr 출력 가능
- [ ] exit code + language + command 포함된 메시지
- [ ] 3개 이상 실패 유형 분류 가능
- [ ] 3개 이상 실패 유형에 수정 힌트 포함
- [ ] `tests/error-messages.test.ts` 5개 테스트 PASS
- [ ] 병렬 로그 `[{{lang}}]` prefix 추가
- [ ] 기존 전체 테스트 PASS
- [ ] P1-CLOSURE-NOTE.md 작성

---

## 🎁 Bonus (선택)

선택사항 — P1 범위를 넘어가지만 원하면 추가 가능:

- [ ] 링크 플래그 제안 (예: "-lm이 빠졌나?")
- [ ] 의존성 그래프 진단 (예: "librust.so가 빌드되지 않았을 수 있습니다")
- [ ] 직접 실패 vs 전파 실패 구분
- [ ] 에러 로그 파일 저장 (디버깅용)

---

## 📚 Reference

**P0 완료 기준:** `P0-CLOSURE-NOTE.md`  
**Trust Closure 계획:** `/claude-plans/clever-wondering-metcalfe.md`  
**TRUST-MATRIX:** `TRUST-MATRIX.md` (P1 후 1.0 → 2.0으로 수정)

---

## GitHub Issue Template

아래를 GitHub에서 복붙하세요:

```markdown
# P1: Error Message Enhancement

## Description
빌드 실패 시 에러 메시지 품질 향상. 현재는 단순 "언어 빌드 실패" 수준이므로, stderr, 원인 분류, 해결 제안을 포함한 상세 메시지 제공.

## Goal
Failure Diagnostics: Level 1.0 → 2.0 (33% → 60%)

## Scope (최소)
- [ ] stderr/stdout 수집
- [ ] exit code + language + command
- [ ] 5가지 실패 분류
- [ ] 제안 한 줄
- [ ] 병렬 로그 prefix

## Done
- top 5 실패 유형 stderr 출력
- 3개 이상 분류 + 제안
- `tests/error-messages.test.ts` PASS
- 기존 419+ 테스트 PASS

## Links
- Epic: Trust Closure
- Blocked By: P0 (완료)
- Related: TRUST-MATRIX.md
```
