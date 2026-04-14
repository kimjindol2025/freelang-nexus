# Parser Bug: TokenType.TRUE/FALSE 미정의

## 파일
`src/nexus/parser/nexus-parser.ts:1340`

## 문제
```typescript
if (token.type === TokenType.TRUE || token.type === TokenType.FALSE) {
  // ...
  value: token.type === TokenType.TRUE ? 1 : 0,
}
```

**에러**: `Property 'TRUE' does not exist on type 'typeof TokenType'`

## 근본 원인
`src/nexus/lexer/token.ts`의 TokenType enum에 TRUE/FALSE가 미정의

현재 정의:
- NUMBER, STRING, IDENTIFIER
- FN, LET, RETURN 등 키워드
- 연산자, 구분자
- **TRUE, FALSE 없음** ← 문제

## 범위
- **v1.0.2 범위 밖** — Pre-existing bug
- Phase 2 유틸 모듈화 작업과 무관

## 영향
- Jest 컴파일 단계에서 모든 테스트 실패
- 테스트 실행 불가

## 해결 방안 (Phase 3)
1. TokenType enum에 TRUE/FALSE 추가
2. 또는 기존 리터럴 값으로 대체 (NUMBER로 매핑)

## 우선순위
**높음** — 테스트 러너 블로킹
