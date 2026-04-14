# FreeLang Nexus — 안정성 헌장

> **우리가 약속하는 것**  
> 다중언어 시스템을 하나의 안정적인 컴파일 모델로 수렴시킨다

---

## 📋 5가지 불변조건(Invariants)

FreeLang Nexus가 보장하는 5가지 기본 약속입니다.

### 1️⃣ **결정적 빌드 그래프** (Deterministic Build Graph)

#### 약속
```
같은 입력 파일 → 항상 같은 빌드 순서 → 항상 같은 컴파일 결과
```

#### 의미
- 어제 성공한 빌드가 오늘도 성공
- CI/CD에서 재현 가능한 빌드
- 팀 전체가 동일한 결과 경험

#### 검증 방법
```bash
# 1단계: 10번 연속 빌드
for i in {1..10}; do npm run build; done

# 2단계: 결과 해시 비교
$ md5sum ./main | cut -d' ' -f1
abc123def456...

$ md5sum ./main | cut -d' ' -f1
abc123def456...  # ← 항상 같음
```

#### 실패 조건
- 같은 소스인데 빌드 순서가 다름
- 같은 소스인데 최종 바이너리 해시가 다름
- 타임스탬프나 UUID 같은 비결정적 요소 주입

#### 달성 방법
- 의존성 정렬: 토폴로지 정렬 (이미 구현)
- 캐시 무효화: 해시 기반 검증
- 타임스탬프 제거: 빌드 시간을 결과에 포함하지 않음

---

### 2️⃣ **안정적인 ABI 경계** (Stable ABI Boundaries)

#### 약속
```
언어 간 경계에서 타입과 호출 규약이 예측 가능하고 검증 가능하다
```

#### 의미
- Rust int32 = V i32 = Go C.int = C int (예측 가능)
- 함수 호출 규약이 항상 같음 (cdecl, stdcall 등)
- 포인터/메모리 관리가 명확

#### 검증 방법
```bash
# 타입 매핑 테스트
$ npm run test -- tests/abi-type-mapping.test.ts

Expected: Rust i64 ↔ V i64 ↔ C long long
Result:   ✅ All type mappings verified
```

#### 실패 조건
- 다른 언어 간에 타입이 예기치 않게 변환됨
- 함수 호출이 스택 정렬 오류로 크래시
- 포인터 크기 불일치 (32→64비트)

#### 달성 방법
- Type Bridge 명세: 각 언어 ↔ C 매핑 정의 (문서화)
- Compile-time Validation: 타입 불일치 시 빌드 오류
- Runtime Safety: 런타임 타입 체크 (선택적)

---

### 3️⃣ **타입 브리지 검증** (Type Bridge Validation)

#### 약속
```
연결 가능한 타입과 불가능한 타입이 명확하고, 빌드 타임에 검증된다
```

#### 의미
- "이 Rust 함수는 V에서 호출 가능한가?" → 자동 검증
- "이 타입은 파이썬으로 전달 가능한가?" → 명확한 답
- 런타임 타입 에러 없음

#### 검증 방법
```bash
# Type Bridge Spec에 따른 검증
$ npm run build 2>&1 | grep "Type mismatch"

❌ Type mismatch detected:
   - Function: calculate (Rust)
   - Returns: i64
   - V expects: i32
   - Fix: Change 'let result: i32 = calculate(x)' to 'let result: i64 = calculate(x)'
```

#### 실패 조건
- 호환되지 않는 타입을 강제로 변환
- 배열/리스트 크기 불일치
- null/optional 처리 불명확

#### 달성 방법
- Type Bridge Spec: 지원되는 타입 목록 (int, float, string, array)
- Validation Rule: 각 조합의 검증 규칙
- Error Message: 명확한 실패 메시지 + 해결책

---

### 4️⃣ **실패 격리와 진단** (Failure Isolation & Diagnostics)

#### 약속
```
실패 시 정확한 위치, 이유, 해결책을 1분 안에 파악할 수 있다
```

#### 의미
- "어디가 깨졌나?" → 파일:줄 번호로 명확
- "왜 깨졌나?" → 기술적 원인 설명
- "어떻게 고칠까?" → 해결책 제시

#### 검증 방법
```bash
# 시나리오: Go 함수에 문법 에러
$ npm run build

[Lexing/Parsing] ✅
[Codegen]       ✅
[Compile/Rust]  ✅ libcalc.so (30s)
[Compile/Go]    ❌ FAIL
  Error: syntax error
  File: hash.go
  Line: 45
  Near: //export func hash_value
  Issue: 'func' keyword expected after '//export'
  Fix: Change '//export hash_value' to '//export\nfunc hash_value(...)'
  Docs: https://docs.freelangnexus.io/go-export-syntax

[Compile/C]     ✅ libmath.so (2s)
[Link]          ⏭️ SKIP (Go failed)

Summary:
  Failed: Go (1 error)
  Passed: Rust, C
  Blocked: Link phase
  Estimated fix time: 2 minutes
```

#### 실패 조건
- 에러가 모호하거나 불명확
- 문제 위치를 찾기 어려움
- 해결 방법이 없음

#### 달성 방법
- 모듈식 컴파일: 각 언어 독립적 컴파일 (병렬화)
- 상세 로깅: 각 단계별 시간, 성공/실패 기록
- 지능형 에러: 문제 → 원인 → 해결책 연결

---

### 5️⃣ **재현 가능한 실행** (Reproducible Execution)

#### 약속
```
같은 입력과 환경에서 항상 같은 출력이 나온다
```

#### 의미
- 팀 전체가 같은 결과 경험
- 버그 재현 가능
- 성능 측정 일관

#### 검증 방법
```bash
# 5번 실행 후 결과 비교
$ for i in {1..5}; do ./main < input.txt >> outputs.txt; done

# 모든 출력이 동일한지 확인
$ sort outputs.txt | uniq -c
5 [output line 1]
5 [output line 2]
5 [output line 3]
# ← 모두 5번 나온 것 = 재현 가능
```

#### 실패 조건
- 같은 입력인데 다른 출력 (타이밍/난수 등)
- 부동소수점 연산 결과 차이
- 메모리 주소 노출 (ASLR 등)

#### 달성 방법
- 난수 시드 고정 (테스트)
- 부동소수점 정밀도 명시
- 메모리 주소 비노출 (보안)

---

## 📊 불변조건 검증 매트릭스

| 불변조건 | 테스트 | CI 주기 | 실패 시 대응 |
|---------|--------|--------|----------|
| 결정적 빌드 | 10회 연속 빌드 해시 비교 | 모든 커밋 | 빌드 실패 |
| 안정 ABI | 타입 매핑 유닛 테스트 | 모든 커밋 | 빌드 실패 |
| 타입 브리지 | 조합 매트릭스 테스트 | 매 PR | 빌드 실패 |
| 실패 격리 | 각 언어 독립 컴파일 | 모든 커밋 | 알림 + 로그 |
| 재현 실행 | E2E 5회 실행 테스트 | 매일 | 빌드 경고 |

---

## 🎯 언어별 보장 수준

### 현재 상태 (Level 2)

```
Level 1: 언어 지원 기본
  ✅ Lexing/Parsing ✅ Codegen
  ❓ 테스트 부분적

Level 2: 검증 포함 (현재)
  ✅ 5개 불변조건 문서화
  ✅ 테스트 443/444
  ❓ 10언어 스케일 미검증

Level 3: 확장성 검증 (목표)
  ✅ 10언어 조합 테스트
  ✅ 플랫폼 크로스 검증
  ✅ 성능 메트릭

Level 4: 신뢰 인증 (최종)
  ✅ 외부 감사
  ✅ 장기 운영 기록
  ✅ SLA 보장
```

### 6개 언어별 현재 보장 수준

| 언어 | 결정적 빌드 | 안정 ABI | 타입 검증 | 실패 격리 | 재현 실행 |
|------|----------|---------|---------|---------|---------|
| Rust | ✅ Level 3 | ✅ Level 3 | ✅ Level 2 | ✅ Level 2 | ✅ Level 2 |
| Go | ✅ Level 3 | ✅ Level 3 | ✅ Level 2 | ✅ Level 2 | ✅ Level 2 |
| C | ✅ Level 3 | ✅ Level 3 | ✅ Level 2 | ✅ Level 2 | ✅ Level 2 |
| Python | ✅ Level 2 | ✅ Level 2 | ❓ Level 1 | ❓ Level 1 | ✅ Level 2 |
| Zig | ✅ Level 2 | ✅ Level 2 | ✅ Level 2 | ✅ Level 2 | ✅ Level 2 |
| Julia | ✅ Level 2 | ❓ Level 1 | ❓ Level 1 | ❓ Level 1 | ❓ Level 1 |

**Legend**:
- ✅ Level 3: 완전 검증
- ✅ Level 2: 기본 검증
- ❓ Level 1: 부분 지원

---

## 🚀 Level 4 진입 기준 (신뢰 인증)

### Phase 1: 기반 강화 (2개월)
- [ ] 모든 불변조건 Level 3 달성
- [ ] 10언어 조합 테스트 추가
- [ ] 플랫폼 3개 (Linux/macOS/Windows) 검증
- [ ] 성능 메트릭 수집

### Phase 2: 확장성 증명 (1개월)
- [ ] 8언어 프로덕션 데모
- [ ] 회귀 테스트 자동화
- [ ] 실패 격리 완벽화
- [ ] 성능 비교 벤치마크

### Phase 3: 신뢰 구축 (지속)
- [ ] 외부 감사 신청
- [ ] 장기 운영 사례 수집
- [ ] 버전 정책 수립 (Semantic Versioning)
- [ ] SLA 보장 가능성 검토

---

## 📝 우리가 보장하지 않는 것

명확히 하기 위해, 우리가 **아직 보장하지 않는 것**도 명시합니다.

### 아직 지원 안 함
- [ ] 11개 이상의 언어 동시 혼합
- [ ] 실시간 상호 통신 (IPC)
- [ ] 프로세스 간 메모리 공유
- [ ] WebAssembly 컴파일 타겟
- [ ] 자동 병렬화 (수동 스레드만 가능)

### 향후 검토
- [ ] JIT 컴파일 (현재: AOT만)
- [ ] 핫 리로드 (현재: 재컴파일 필수)
- [ ] 분산 컴파일 (현재: 단일 머신)
- [ ] 자동 최적화 (현재: 수동 튜닝)

### 명시적으로 하지 않음
- [ ] 금융 시스템 핵심 경로용 인증
- [ ] 밀리초 단위 레이턴시 보장
- [ ] 비밀 키 보호 (개발자 책임)
- [ ] 네트워크 보안 (암호화 라이브러리 선택 권)

---

## 🔍 검증 방법: 매월 보장 확인

### 매월 점검항목

```bash
# 1. 결정적 빌드
$ ./monthly-check.sh verify-deterministic

# 2. ABI 안정성
$ ./monthly-check.sh verify-abi

# 3. 타입 검증
$ ./monthly-check.sh verify-types

# 4. 실패 격리
$ ./monthly-check.sh verify-failure-isolation

# 5. 재현성
$ ./monthly-check.sh verify-reproducibility

# 결과
Monthly guarantee report:
✅ Deterministic Build:    PASS (10/10 builds identical)
✅ ABI Stability:          PASS (all 6 languages)
✅ Type Bridge:            PASS (78/80 combinations)
⚠️  Failure Isolation:     WARN (Python edge cases)
✅ Reproducible Exec:      PASS (100/100 runs)

Overall: GRADE A (96% compliance)
```

---

## 💬 이 헌장의 의미

**FreeLang Nexus는 "다중언어를 섞을 수 있다"가 아니라**  
**"다중언어를 섞어도 안정적으로 컴파일하고 실행된다"를 약속합니다.**

이 차이가 "프로젝트"와 "프로덕션 도구"를 나눕니다.

---

## 🤝 피드백

이 헌장에 대한 의견은:
- GitHub Issues: "Feedback: Guarantees.md"
- 또는 커뮤니티 토론

**우리가 지킬 수 있는 약속을 명시하고,**  
**매월 그것을 검증하고,**  
**개선하면서 신뢰를 쌓는 것.**

이것이 FreeLang Nexus의 길입니다.

---

**"안정성은 기능이 아니라 약속이다."**  
**"우리는 그 약속을 지킬 수 있습니다."**
