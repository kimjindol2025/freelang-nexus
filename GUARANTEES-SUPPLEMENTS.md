# FreeLang Nexus — GUARANTEES 보완 자료

> **GUARANTEES.md를 실제 실행 가능하게 만드는 10가지 보충 문서**

---

## 📋 필요한 10가지 보완

### 1️⃣ Type Bridge Specification (완전 버전)

**위치**: `docs/TYPE-BRIDGE-SPEC.md`

**내용**: 모든 가능한 타입 조합 매핑

```markdown
# Type Bridge Specification v1.0

## Tier 1: 완전 지원 (No conversion needed)
i32 Rust ↔ i32 V ↔ C.int Go ↔ int C
→ 바이너리 레벨에서 동일, 비용 0

## Tier 2: 자동 변환 (Implicit conversion)
i32 → i64 (upcast)
f32 → f64 (upcast)
→ 안전, 비용 무시

## Tier 3: 명시적 변환 (Explicit cast required)
i64 → i32 (downcast, 범위 체크 필수)
array → pointer (메모리 주소 변환)
→ 개발자가 명시, 위험 인식

## Tier 4: 불가능 (Unsupported)
Rust Vec<T> → C array (메모리 모델 불일치)
Python dict → C struct (동적 vs 정적)
→ 에러로 빌드 실패

## 표: 16개 주요 타입 조합

| From | To | Tier | Cost | Notes |
|------|----|----|------|-------|
| Rust i32 | V i32 | 1 | 0 | Direct |
| Rust i64 | C long long | 1 | 0 | Direct |
| V f64 | C double | 1 | 0 | Direct |
| Go string | C char* | 2 | low | C.CString() + free |
| Python str | C char* | 2 | low | PyUnicode_AsUTF8 |
| C char* | Rust &str | 3 | medium | Bounds check |
| Rust Vec<i32> | C int* | 3 | medium | .as_ptr() |
| Python list | C array | 4 | ✗ | Unsupported |
```

**왜 필요한가**:
- GUARANTEES의 "Type Bridge Validation"을 구체화
- 개발자가 "이 타입 조합 가능한가?"를 즉시 확인 가능
- Level/Cost/Notes로 의사결정 가능

---

### 2️⃣ Failure Mode Catalog (실패 사례 카탈로그)

**위치**: `docs/FAILURE-CATALOG.md`

**형식**: "문제 → 증상 → 진단 → 해결" 4단계

```markdown
# Failure Mode Catalog v1.0

## FM-001: 타입 불일치

**증상**:
```
Error: Type mismatch
  Rust function returns i64
  V function expects i32
  Line: main.v:45
```

**근본 원인**:
- Rust: `pub extern "C" fn calculate() -> i64`
- V: `let result: i32 = calculate()`
- 자동 downcast 없음

**진단**:
- Type Bridge Spec 확인 (Tier 3)
- 메모리 오버플로우 가능성 체크
- 범위 재조정 필요

**해결**:
```v
let result: i64 = calculate()  // 타입 일치
// 또는
let result: i32 = (calculate() & 0xFFFFFFFF) as i32  // 명시적 변환
```

**점검 항목**:
- [ ] 반환형 확인 (Rust 함수 헤더)
- [ ] V 변수 타입 확인
- [ ] Type Bridge Spec에서 Tier 확인

---

## FM-002: 미링크 심볼

**증상**:
```
error: undefined reference to 'hash_value'
```

**근본 원인**:
- Go function에 `//export` 미포함
- 또는 `@artifact("libhash.so")` 링크 누락

**진단**:
```bash
$ nm libhash.so | grep hash_value
# 결과 없음 → 심볼이 라이브러리에 없음
```

**해결**:
```go
//export hash_value  // ← 필수
func hash_value(n C.int) C.uint {
  return uint32(n * 31)
}
```

---

## FM-003: 플랫폼 간 .so/.dylib 충돌

**증상**:
```
Darwin: dyld: Library not loaded: @rpath/librust.so
        Reason: image not found
```

**근본 원인**:
- Linux에서 .so로 빌드
- macOS에서 .dylib 필요
- 확장자 자동 감지 실패

**해결**:
```bash
# runner.ts에서 자동 감지
const libExt = process.platform === 'darwin' ? '.dylib' : '.so';
```

---

## FM-004: 난수/타임스탬프로 인한 비결정성

**증상**:
```
$ npm run build && md5sum main
abc123...
$ npm run build && md5sum main
def456...  # ← 다름!
```

**근본 원인**:
- codegen에서 `new Date().toISOString()` 사용
- 난수 시드 고정 안 됨
- 병렬 빌드 순서 변동

**해결**:
```typescript
// codegen에서
const FIXED_VERSION = "1.0.0";  // 타임스탐프 NO
const FIXED_SEED = 42;  // 난수 고정

// runner에서
const sortedLibs = externLibs.sort((a, b) => a.name.localeCompare(b.name));
// 순서 정규화
```

---

## 이런 식으로 최소 20개 FM 정의

각 FM은:
- 시나리오 (개발자가 겪을 실제 상황)
- 진단 방법 (어떻게 확인하는가)
- 해결책 (정확한 수정)
- 예방법 (다음에 안 되도록)
```

**왜 필요한가**:
- GUARANTEES의 "Failure Isolation & Diagnostics" 구체화
- 개발자가 실패 시 5분 안에 해결 가능
- 신뢰 형성 (설명이 정확함 = 경험 많음)

---

### 3️⃣ ABI Contract Test Suite

**위치**: `tests/abi-contracts/`

**형식**: 자동화된 유닛 테스트

```typescript
// tests/abi-contracts/type-mapping.test.ts

describe("ABI Type Contracts", () => {
  
  describe("Integer mappings", () => {
    it("i32 Rust == i32 V == C.int Go == int C", () => {
      // 4가지 다른 파일에서 같은 함수 정의
      const testCases = [
        { lang: "rust", expected: 4 },
        { lang: "v", expected: 4 },
        { lang: "go", expected: 4 },
        { lang: "c", expected: 4 }
      ];
      
      for (const test of testCases) {
        const result = callFunction(test.lang, "get_int32");
        expect(result).toBe(test.expected);  // 모두 4여야 함
      }
    });
  });
  
  describe("Implicit conversions", () => {
    it("i32 → i64 upcast is safe", () => {
      const value = callFunction("rust", "return_i32");
      const storedAsI64 = callFunction("v", "store_as_i64", value);
      expect(storedAsI64).toBe(value);
    });
  });
  
  describe("Unsupported conversions", () => {
    it("Vec<T> → array should fail at compile time", () => {
      const code = `
        @lang("rust")
        pub extern "C" fn get_vec() -> *const i32 { ... }
        
        @mode(v)
        let arr: [i32; 10] = get_vec()  // ← 컴파일 실패
      `;
      
      expect(() => compile(code)).toThrow("Type mismatch");
    });
  });
});
```

**왜 필요한가**:
- GUARANTEES의 "Stable ABI Boundaries" 검증 가능
- 각 타입 조합이 정말로 작동하는지 증명
- 회귀 방지 (새 기능이 ABI를 깨지 않도록)

---

### 4️⃣ Platform Compatibility Matrix

**위치**: `docs/PLATFORM-MATRIX.md`

**형식**: 각 언어/플랫폼별 지원 상태

```markdown
# Platform Support Matrix

## Support Levels
- ✅ Fully Supported (CI tested, regular validation)
- ⚠️  Partial (known issues, workarounds documented)
- ❌ Unsupported (no testing, expect failures)

## By Language

### Rust
| Platform | Level | Notes |
|----------|-------|-------|
| Linux x86_64 | ✅ | Full support |
| macOS arm64 | ✅ | Full support |
| Windows x86_64 | ⚠️  | Some edge cases |

### Go
| Platform | Level | Notes |
|----------|-------|-------|
| Linux x86_64 | ✅ | cgo fully supported |
| macOS | ✅ | Works with DYLD_LIBRARY_PATH |
| Windows | ⚠️  | PATH issues, use absolute paths |

### Python
| Platform | Level | Notes |
|----------|-------|-------|
| Linux | ✅ | Python 3.10+ |
| macOS | ✅ | Homebrew Python |
| Windows | ❌ | Not tested |

## By Platform

### Linux (x86_64)
**Supported**: Rust, Go, C, Python, Zig, Julia
**CI**: Daily (GitHub Actions)
**Tested Combinations**: All 20+ combinations

### macOS (arm64)
**Supported**: Rust, Go, C, Python, Zig
**CI**: 3x per week
**Known Issues**: dylib load path complexity
**Workaround**: Use `DYLD_LIBRARY_PATH`

### Windows
**Supported**: Rust, Go, C (basic)
**CI**: Weekly
**Not recommended for**: Julia, Zig (unstable)
**Known Issues**: PATH, .dll conflicts
```

**왜 필요한가**:
- GUARANTEES의 "Deterministic Build" 플랫폼 범위 명확화
- 개발자가 "내 플랫폼에서 되나?" 즉시 확인
- 정직한 범위 제시 (신뢰 형성)

---

### 5️⃣ Error Message Examples (좋은/나쁜 비교)

**위치**: `docs/ERROR-MESSAGE-GUIDE.md`

**형식**: 같은 오류의 좋은 vs 나쁜 메시지 비교

```markdown
# Error Message Quality Guide

## Example 1: Type Mismatch

### ❌ 나쁜 예
```
Error: type mismatch
```

**문제**:
- 뭐가 안 맞는가? (불명확)
- 어디인가? (파일/줄 없음)
- 어떻게 고칠까? (단서 없음)

### ✅ 좋은 예
```
Type mismatch at main.v:45:12
  Expected: i32
  Got:      i64 (from Rust function 'calculate')
  
Context:
  41 | fn main() -> i64 {
  42 |   let x = 10
  43 |   let result: i32 = calculate(x)  // ← 여기
  45 |   println("result: " + result)
  46 | }
  
Suggestion:
  Change line 43 to:
    let result: i64 = calculate(x)
  
  Or cast explicitly:
    let result: i32 = (calculate(x) & 0xFFFFFFFF) as i32
    
Learn more: https://docs.freelangnexus.io/type-bridge
```

**개선 포인트**:
- 정확한 위치 (파일:줄:열)
- 기대값 vs 실제값
- 코드 컨텍스트 표시
- 최소 2가지 해결책
- 문서 링크

---

## Example 2: Missing Symbol

### ❌ 나쁜 예
```
undefined reference to 'hash_value'
```

### ✅ 좋은 예
```
Link error: undefined reference to 'hash_value'
  Location: hash.go:45

Possible causes:
  1. Function not marked with //export
     Current:  func hash_value(n C.int) C.uint { ... }
     Fix:      //export\nfunc hash_value(n C.int) C.uint { ... }
  
  2. Library not included in @artifact
     Current:  @lang("go")
     Fix:      @lang("go")\n@artifact("libhash.so")
  
  3. Library not linked in build
     Check: gcc command includes -lhash

Linked libraries: [-lrust, -lc]
Missing: -lhash

Learn more: https://docs.freelangnexus.io/go-ffi
```

---

## 메시지 작성 체크리스트

에러 메시지는 반드시:
- [ ] 위치 명시 (파일:줄:열)
- [ ] 기대값 vs 실제값
- [ ] 2+ 가능한 원인
- [ ] 각 원인의 해결책
- [ ] 문서 링크 포함
- [ ] 100자 이하 (줄바꿈)
```

**왜 필요한가**:
- GUARANTEES의 "Failure Isolation & Diagnostics" 품질 기준 제시
- 실제 사용자 경험 개선
- "신뢰"는 세부사항에서 나옴

---

### 6️⃣ Performance Baseline & Metrics

**위치**: `docs/PERFORMANCE.md`

**형식**: 측정 방법 + 기준값

```markdown
# Performance Baseline v1.0

## Baseline Test Files

### polyglot-demo.fl (6 languages)
```bash
Total lines: 250
Languages: Rust, Go, C, Zig, Julia, Python
Expected:
  Lexing:  50ms
  Parsing: 80ms
  Codegen: 120ms
  Rust:    450ms (rustc -O)
  Go:      180ms
  C:       50ms
  Zig:     200ms
  Julia:   500ms (JIT)
  Link:    150ms
  Total:   ~1800ms (목표: < 2s)
```

### image-metadata-pipeline.fl (5 languages)
```
Expected:
  Lexing:  40ms
  Parsing: 60ms
  Codegen: 80ms
  Compile: 600ms (병렬)
  Link:    80ms
  Total:   ~860ms (목표: < 1s)
```

## Measurement Method

```bash
$ npm run build -- --metrics

Output:
{
  "total_time": 1823,
  "phases": {
    "lexing": 48,
    "parsing": 82,
    "codegen": 115,
    "compile": {
      "rust": 451,
      "go": 182,
      "c": 52,
      "zig": 198,
      "julia": 502
    },
    "link": 152
  },
  "binary_size": 2430000,
  "memory_peak": 180000000
}
```

## Regression Detection

```bash
$ npm run test -- regression-perf

Result:
baseline: 1800ms
current:  1850ms
delta:    +50ms (+2.8%)
status:   ⚠️  WARNING (threshold: ±5%)
```

**경고 조건**:
- 총 시간 ±5% 초과
- 특정 언어 ±10% 초과
- 메모리 사용량 ±10% 초과

---

## 성능이 중요한 이유

PoC에서는 성능이 중요하지 않습니다.  
하지만 프로덕션 도구가 되려면:

- **CI/CD 파이프라인에 통합 가능해야** (빌드 시간 < 2분)
- **개발자 경험이 좋아야** (피드백 루프 < 10초)
- **성능 저하 감지 가능해야** (회귀 방지)

이 문서는 그 약속을 정량화합니다.
```

**왜 필요한가**:
- GUARANTEES의 "Deterministic Build" + 성능 증명
- 성능 저하 감지 가능 (회귀 방지)
- 프로덕션 채택 기준 제시

---

### 7️⃣ Version & Support Policy

**위치**: `docs/VERSION-POLICY.md`

**형식**: 장기 약속 (언어 프로젝트의 신뢰)

```markdown
# Version & Support Policy v1.0

## Versioning Scheme

FreeLang Nexus는 Semantic Versioning을 따릅니다.

### Version Format: MAJOR.MINOR.PATCH

**MAJOR** (불호환 변경)
- ABI 경계 변경
- 5가지 불변조건 중 하나 수정
- 언어 제거
- 예: v1.0.0 → v2.0.0

**MINOR** (하위 호환)
- 새 언어 추가
- 새로운 타입 지원
- 에러 메시지 개선
- 성능 향상
- 예: v1.0.0 → v1.1.0

**PATCH** (버그 수정)
- Type bridge 오류 수정
- 플랫폼별 호환성 개선
- 테스트 추가
- 문서 개선
- 예: v1.0.0 → v1.0.1

## Long-Term Support (LTS)

### v1.x (LTS)
**지원 기간**: 3년
**보장**:
- MAJOR 변경 없음
- 5가지 불변조건 고정
- 월간 보안 업데이트
- Critical bug fix 48시간 내

### v2.x (Current)
**지원 기간**: 2년
**보장**:
- MAJOR 변경 가능 (사전 공지 3개월)
- 새 기능 추가 가능
- Monthly release

## Support Timeline

```
v1.0.0 (2024-10)  ───────────────────────────> EOL (2027-10)
v1.1.0 (2024-11)  ───────────────────────────> EOL (2027-11)
v2.0.0 (2026-06)  ──────────────────> EOL (2028-06)
```

## Breaking Changes Policy

MAJOR 버전에 breaking change가 있을 경우:

1. **사전 공지** (3개월)
   - GitHub announcement
   - 블로그 포스트
   - 마이그레이션 가이드

2. **마이그레이션 지원** (6개월)
   - 구 버전과 신 버전 동시 지원
   - 자동 마이그레이션 도구 제공

3. **Deprecation Period** (3개월)
   - 구 버전 경고 메시지
   - 신 버전으로의 명확한 경로 제시
```

**왜 필요한가**:
- 프로덕션 도입자의 가장 큰 우려 (버전 정책)
- "3년 지원" 같은 명시적 약속 = 신뢰
- 오픈소스 성숙도의 지표

---

### 8️⃣ Security Considerations

**위치**: `docs/SECURITY.md`

**형식**: 범위, 책임, 취약점 대응

```markdown
# Security Considerations v1.0

## Scope: What We Protect

FreeLang Nexus는 다음을 보장합니다:

### 빌드 시간 안전성
- ✅ Type safety (타입 불일치 감지)
- ✅ Symbol resolution (미정의 함수 감지)
- ✅ ABI contract validation
- ✅ Deterministic output (재현 가능)

## Out of Scope: What You Control

FreeLang Nexus는 다음을 보장하지 않습니다:

### 네트워크 보안
- ❌ 암호화 (OpenSSL 선택은 사용자)
- ❌ 인증 (라이브러리 선택은 사용자)
- ❌ 권한 관리

### 런타임 보안
- ❌ 메모리 안전성 (Rust FFI의 unsafe 블록)
- ❌ 버퍼 오버플로우 (C 코드는 작성자 책임)
- ❌ 경합 조건 (멀티 스레드는 작성자 책임)

### 데이터 보안
- ❌ 입력 검증 (각 언어에서 처리)
- ❌ 민감 데이터 보호 (로깅 설정은 사용자)
- ❌ 접근 제어

---

## Vulnerability Reporting

발견 시 공개하지 말고:
```
security@freelangnexus.io
```

최대 48시간 내 응답, 30일 내 패치 공개.

---

## 신뢰할 수 없는 입력 처리

FFI 경계에서는:
```rust
// ❌ 위험: C에서 Python 함수 호출
#[no_mangle]
pub extern "C" fn process(data: *const char) {
  let s = CStr::from_ptr(data);  // ← 데이터 유효성 검증 필요
  python_function(s);
}

// ✅ 안전
#[no_mangle]
pub extern "C" fn process(data: *const char) -> int {
  if data.is_null() { return -1; }  // Null check
  
  let s = match CStr::from_ptr(data).to_str() {
    Ok(s) => s,
    Err(_) => return -2,  // UTF-8 check
  };
  
  python_function(s) as int
}
```
```

**왜 필요한가**:
- GUARANTEES에서 "보장하지 않는 것"을 명확히
- 책임 경계를 그음 (신뢰 형성)
- 채택자가 위험을 이해하도록 함

---

### 9️⃣ Migration Guide

**위치**: `docs/MIGRATION-GUIDE.md`

**형식**: 기존 방식 → Nexus로의 구체적 전환

```markdown
# Migration Guide: From Makefile to FreeLang Nexus

## Before: Traditional Multi-Language Build

```bash
project/
├── src/
│   ├── main.v
│   ├── lib/
│   │   ├── rng.rs
│   │   ├── hash.go
│   │   ├── calc.c
│   │   └── Makefile
│   └── build.rs
├── Makefile
├── CMakeLists.txt
├── go.mod
└── setup.sh  # 빌드 스크립트
```

**빌드 프로세스**:
```bash
$ ./setup.sh
# ├─ mkdir -p build
# ├─ cd lib && make
# ├─ rustc --crate-type cdylib ...
# ├─ go build -buildmode=c-shared ...
# ├─ gcc -shared ...
# ├─ gcc -o main main.c -L... -lrng -lhash -lcalc -lm
# └─ ./main
```

**문제점**:
- 5개 빌드 도구 유지 (Makefile, CMake, build.rs, go.mod, 셸 스크립트)
- C 헤더 수작업 유지보수
- 언어 추가할 때마다 빌드 체인 수정
- 팀원마다 다른 로컬 환경 설정 문제

---

## After: FreeLang Nexus

```bash
project/
├── multi-lang.fl  # 모든 코드 1개 파일
├── package.json
└── npm run build  # 끝!
```

**단계별 마이그레이션**:

### Step 1: .fl 파일 생성 (30분)

```fl
@mode(v)

@lang("rust")
---
#[no_mangle]
pub extern "C" fn rng_next(seed: i32) -> i32 { ... }
---

@lang("go")
---
//export hash_value
func hash_value(n C.int) C.int { ... }
---

@lang("c")
---
double calc_pi() { ... }
---

fn main() -> i64 {
  let r = rng_next(42)
  let h = hash_value(r)
  let pi = calc_pi()
  println("result: " + h)
  return 0
}
```

### Step 2: 빌드 스크립트 제거

```bash
$ rm -f Makefile CMakeLists.txt build.rs setup.sh
$ rm -f src/lib/*.c src/lib/*.h
$ git add multi-lang.fl && git rm Makefile CMakeLists.txt ...
```

### Step 3: package.json 최소화

```json
{
  "name": "multi-lang-project",
  "version": "1.0.0",
  "scripts": {
    "build": "nexus build multi-lang.fl",
    "test": "npm run build && ./main"
  }
}
```

### Step 4: CI/CD 단순화

```yaml
# 이전 GitHub Actions (복잡)
- run: cargo build
- run: go build
- run: gcc ...
- run: ./build.sh

# 이후 (단순)
- run: npm run build
- run: npm test
```

---

## 마이그레이션 체크리스트

- [ ] .fl 파일 생성
- [ ] 모든 언어 코드 `.fl`로 옮김
- [ ] 빌드 도구 제거 (Makefile 등)
- [ ] package.json 생성
- [ ] `npm run build` 성공 확인
- [ ] 기존 빌드와 결과 비교
- [ ] CI/CD 업데이트
- [ ] 팀 문서 업데이트

---

## 예상 개선

| 항목 | 기존 | Nexus | 개선 |
|------|------|-------|------|
| 빌드 도구 수 | 5개 | 1개 | 80% ↓ |
| C 헤더 유지보수 | 수동 | 자동 | 100% 제거 |
| 빌드 스크립트 줄 | 200+ | 0 | 100% 제거 |
| 초기 구성 시간 | 3시간 | 30분 | 83% ↓ |
| 언어 추가 시간 | 2시간 | 15분 | 87% ↓ |
```

**왜 필요한가**:
- GUARANTEES의 가치를 "비용 절감" 숫자로 증명
- 실제 채택자가 가장 궁금해하는 부분
- "정말로 간단해지나?"에 대한 구체적 답변

---

### 🔟 Known Limitations & Roadmap

**위치**: `docs/KNOWN-ISSUES.md`

**형식**: 정직한 제약사항 + 향후 계획

```markdown
# Known Limitations & Future Work

## 현재 제약사항 (v1.0.0)

### 언어
- ❌ 11개 이상 언어 동시 혼합 (미테스트)
- ❌ Julia 완전 지원 (Level 1, 기본 only)
- ❌ Windows Python 통합 (Path 문제)

### 기능
- ❌ 핫 리로드 (재컴파일 필요)
- ❌ 실시간 IPC (프로세스 간 통신)
- ❌ WASM 컴파일 타겟
- ❌ 자동 병렬화 (수동만 가능)

### 성능
- ⚠️  Julia: JIT 워밍업 시간 길음 (첫 실행 느림)
- ⚠️  Python: GIL로 인한 멀티 스레드 제약
- ⚠️  Go cgo: 오버헤드 존재

### 타입 시스템
- ❌ 제네릭 (Template 안 됨)
- ❌ 고급 타입 (Union, Intersection)
- ❌ 동적 타입 → 정적 타입 검증

---

## 향후 계획 (Roadmap)

### v1.1.0 (Q1 2025)
- ✅ Mojo 언어 추가
- ✅ Windows Python 지원
- ✅ Julia 타입 검증 강화

### v1.2.0 (Q2 2025)
- ✅ 8-10언어 조합 테스트
- ✅ 실패 격리 완벽화
- ✅ 성능 10% 향상

### v2.0.0 (Q4 2025)
- ✅ WASM 타겟 (실험)
- ✅ Generic 기본 지원
- ✅ Hot reload (제한적)

---

## 투표: 우선순위

사용자 피드백을 반영합니다.
어떤 기능이 가장 필요한가?

1. Windows 완전 지원 (5표)
2. 더 많은 언어 (3표)
3. 성능 최적화 (2표)
4. WASM 지원 (1표)

→ 결과에 따라 Q1 로드맵 조정
```

**왜 필요한가**:
- 정직한 커뮤니케이션 (숨기는 게 없음)
- "우리도 알고 있다"는 신호 (신뢰)
- 사용자 피드백 기반 우선순위 투명화

---

## 📊 이 10가지의 효과

| 보완 자료 | 주요 역할 | 신뢰도 +++ |
|----------|---------|----------|
| 1. Type Bridge Spec | 타입 조합의 정확한 지도 | ⭐⭐⭐ |
| 2. Failure Catalog | "실패를 설명 가능" 신호 | ⭐⭐⭐ |
| 3. ABI Contracts | 자동화된 검증 증명 | ⭐⭐⭐ |
| 4. Platform Matrix | 솔직한 범위 제시 | ⭐⭐ |
| 5. Error Examples | 사용자 경험 품질 | ⭐⭐ |
| 6. Performance Baseline | 정량화된 약속 | ⭐⭐⭐ |
| 7. Version Policy | 장기 안정성 보장 | ⭐⭐⭐ |
| 8. Security Model | 책임 경계 명확화 | ⭐⭐ |
| 9. Migration Guide | 실제 도입 경로 | ⭐⭐⭐ |
| 10. Known Issues | 정직한 커뮤니케이션 | ⭐⭐⭐ |

---

## 🎯 작성 우선순위

### 우선순위 1 (2주 내)
- Type Bridge Spec
- Failure Catalog
- Platform Matrix

**이유**: GUARANTEES의 5가지 조건을 가장 직접 지원

### 우선순위 2 (1개월 내)
- Performance Baseline
- Error Message Guide
- Version Policy

**이유**: 프로덕션 채택의 실제 기준

### 우선순위 3 (2개월 내)
- ABI Contract Tests
- Migration Guide
- Known Issues

**이유**: 커뮤니티 성숙도 지표

---

## 최종 효과

이 10개를 다 하면:

```
GUARANTEES.md (철학)
    ↓
이 10개 (구체화)
    ↓
"신뢰할 수 있는 컴파일러"
```

---

**"문서가 계약이 되려면, 숫자와 예시가 필요합니다."**

이 10가지가 그것입니다.
