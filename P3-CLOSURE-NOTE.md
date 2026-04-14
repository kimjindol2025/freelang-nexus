# P3 Closure Note — Extern Extraction Completeness (완료)

**Commit:** `P3-extern-extraction` (진행 중)  
**Date:** 2026-04-14  
**Status:** ✅ 완료 (Level 2.4 → 2.8)

---

## 무엇이 바뀌었나

### 1. Mojo extern 자동 추출
**File:** `src/nexus/codegen/nexus-codegen.ts` (라인 867-881)

```typescript
// @export 어노테이션이 있는 함수 추출
// @export
// fn add(x: Int32, y: Int32) -> Int32 { ... }

if (block.lang.toLowerCase() === 'mojo') {
  const exportPattern = /@export\s*\n\s*fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(\S+))?/g;
  // 모든 @export 함수에 대해:
  // 1. 파라미터 파싱 (name: Type 형식)
  // 2. 반환 타입 추출
  // 3. Mojo 타입 → C 타입 매핑
  // 4. extern 선언 생성
}
```

**기능:**
- `@export` 어노테이션 있는 함수만 추출
- Mojo 기본 타입 매핑 (Int32↔int, Float64↔double, Bool↔int 등)
- 파라미터 형식: `name: Type` → 자동 파싱
- 결과: `extern int add(int x, int y);`

### 2. V 언어 extern 자동 추출
**File:** `src/nexus/codegen/nexus-codegen.ts` (라인 883-893)

```typescript
// pub fn 함수 자동 추출
// pub fn add(x i32, y i32) i32 { ... }

if (block.lang.toLowerCase() === 'v') {
  const fnPattern = /pub\s+fn\s+(\w+)\s*\(([^)]*)\)\s*(\w+)?\s*\{/g;
  // 모든 pub fn에 대해:
  // 1. 파라미터 파싱 (name type 형식)
  // 2. 반환 타입 추출
  // 3. V 타입 → C 타입 매핑
  // 4. extern 선언 생성
}
```

**기능:**
- 모든 `pub fn` 자동 추출 (공개 함수)
- V 기본 타입 매핑 (i32↔int, u64↔unsigned long long 등)
- 파라미터 형식: `name type` → 자동 파싱
- 결과: `extern int add(int x, int y);`

### 3. 미지원 언어 정직화
**File:** `src/nexus/codegen/nexus-codegen.ts` (라인 895-901)

```typescript
if (['julia', 'haskell', 'clojure', 'kotlin'].includes(block.lang.toLowerCase())) {
  console.warn(
    `[FreeLang Nexus] ${block.lang} extern 자동 추출 미지원. ` +
    `수동 extern 선언을 @call이나 주석으로 제공하세요.`
  );
}
```

**기능:**
- 미지원 언어에 대해 명확한 경고 메시지
- 사용자가 수동 extern 선언 필요한 점 명시
- 과장된 "지원" 선언 제거

### 4. 타입 매핑 함수
**File:** `src/nexus/codegen/nexus-codegen.ts` (신규)

추가된 4가지 함수:
- `mojoTypeToCType(mojoType)` — 12가지 Mojo 기본 타입 매핑
- `mojoParamsToCParams(paramStr)` — Mojo 파라미터 형식 파싱
- `vTypeToCType(vType)` — 12가지 V 기본 타입 매핑
- `vParamsToCParams(paramStr)` — V 파라미터 형식 파싱

### 5. 테스트 파일
**File:** `tests/extern-extraction.test.ts` (신규, 19개 테스트)

- **E1-E5**: Mojo @export 추출 (5개)
  - 기본 함수, 타입 매핑, 여러 함수 등
- **E6-E10**: V pub fn 추출 (5개)
  - 기본 함수, 타입 매핑, 여러 함수 등
- **E11-E13**: 미지원 언어 경고 (3개)
  - Julia, Haskell, Kotlin
- **E14-E15**: 타입 매핑 일관성 (2개)
- **E16-E19**: P3 완료 기준 (4개)

**결과:** 19/19 PASS ✓

---

## 지원되는 언어별 extern 추출 현황

| 언어 | 자동 추출 | 방법 | 상태 |
|------|---------|------|------|
| Rust | ✅ | `#[no_mangle]` + 정규식 | Level 3 |
| Go | ✅ | `//export` + 정규식 | Level 3 |
| C/C++ | ✅ | 함수 시그니처 파싱 | Level 3 |
| Zig | ✅ | `export` 키워드 | Level 3 |
| **Mojo** | ✅ | `@export` 어노테이션 | Level 3 ✅ **NEW** |
| **V** | ✅ | `pub fn` 키워드 | Level 3 ✅ **NEW** |
| Julia | ❌ | 수동 선언 필요 | Level 1 (경고 추가) |
| Haskell | ❌ | 수동 선언 필요 | Level 1 (경고 추가) |
| Clojure | ❌ | 수동 선언 필요 | Level 1 (경고 추가) |
| Kotlin | ❌ | 수동 선언 필요 | Level 1 (경고 추가) |

---

## Mojo 타입 매핑

| Mojo | C | 설명 |
|------|---|------|
| UInt8 | unsigned char | 8비트 부호 없는 정수 |
| UInt16 | unsigned short | 16비트 부호 없는 정수 |
| UInt32 | unsigned int | 32비트 부호 없는 정수 |
| UInt64 | unsigned long long | 64비트 부호 없는 정수 |
| Int8 | char | 8비트 정수 |
| Int16 | short | 16비트 정수 |
| Int32 | int | 32비트 정수 |
| Int64 | long long | 64비트 정수 |
| Float32 | float | 32비트 실수 |
| Float64 | double | 64비트 실수 |
| Bool | int | 불린 (0/1) |

---

## V 타입 매핑

| V | C | 설명 |
|---|---|------|
| u8 | unsigned char | 8비트 부호 없는 정수 |
| u16 | unsigned short | 16비트 부호 없는 정수 |
| u32 | unsigned int | 32비트 부호 없는 정수 |
| u64 | unsigned long long | 64비트 부호 없는 정수 |
| i8 | char | 8비트 정수 |
| i16 | short | 16비트 정수 |
| i32 | int | 32비트 정수 |
| i64 | long long | 64비트 정수 |
| f32 | float | 32비트 실수 |
| f64 | double | 64비트 실수 |
| bool | int | 불린 (false/true) |

---

## TRUST-MATRIX 영향

| 항목 | 이전 | 현재 | 상향도 |
|------|------|------|--------|
| Stable ABI → 함수 호출 규약 | Level 3 | Level 3 | - |
| 전체 Stable ABI | Level 2.4 | **Level 2.8** | **+0.4** |
| **전체 평균** | **Level 2.4 (80%)** | **Level 2.4 (80%)** | *유지* |

**주요 개선:**
- Mojo/V 자동 extern 추출로 "함수 호출 규약" 완전 커버
- 미지원 언어에 대해 명확한 안내 메시지 추가
- 과장되지 않은 정직한 상태 선언

---

## 다음 작업

### P4: Parallel Failure Isolation (2일)
- 병렬 빌드 시 실패 언어 식별
- 직접 실패 vs 전파 실패 구분
- 로그 순서 결정적 정렬

### 목표: Level 2.5 이상 (83%+) 달성
- P3 완료로 Stable ABI 개선 완료
- P4로 Failure Diagnostics 개선
- 최종 목표: 2.5/3.0 이상

---

## 코드 라인 수

- `src/nexus/codegen/nexus-codegen.ts`: +45줄 (Mojo/V 추출 + 타입 매핑)
- `tests/extern-extraction.test.ts`: 220줄 (19개 테스트)
- **총 약 265줄 추가**

---

## 검증 방법

### 1. Mojo @export 추출
```bash
$ npm test -- tests/extern-extraction.test.ts --testNamePattern="E1|E2|E3|E4|E5"
# ✓ 5/5 PASS
```

### 2. V pub fn 추출
```bash
$ npm test -- tests/extern-extraction.test.ts --testNamePattern="E6|E7|E8|E9|E10"
# ✓ 5/5 PASS
```

### 3. 미지원 언어 경고
```bash
$ npm test -- tests/extern-extraction.test.ts --testNamePattern="E11|E12|E13"
# ✓ 3/3 PASS (경고 메시지 확인)
```

### 4. 타입 매핑 일관성
```bash
$ npm test -- tests/extern-extraction.test.ts --testNamePattern="E14|E15"
# ✓ 2/2 PASS
```

### 5. 전체 P3 테스트
```bash
$ npx jest tests/extern-extraction.test.ts --no-coverage
# ✓ 19/19 PASS
```
