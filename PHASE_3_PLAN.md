# Phase 3 — 테스트 러너 블로커 해소

## 목표
테스트 실행 가능 상태 복구

## 블로킹 이슈
`src/nexus/parser/nexus-parser.ts:1340` — TokenType.TRUE/FALSE 미정의

## 해결 경로

### 옵션 A (권장): TokenType enum 추가
1. `src/nexus/lexer/token.ts` 수정
   - TokenType enum에 TRUE, FALSE 추가
   ```typescript
   TRUE = 'TRUE',
   FALSE = 'FALSE',
   ```
2. 테스트 실행 확인
3. 커밋

### 옵션 B: 기존 값으로 대체
1. parser에서 TRUE/FALSE를 다른 토큰으로 매핑
2. 더 침투적 (좋지 않음)

## 실행 계획
1. TokenType enum 수정 (옵션 A)
2. `npm test` 실행
3. Phase 2 테스트 통과 확인
4. 커밋: `fix: TokenType.TRUE/FALSE 추가 (parser 버그 수정)`

## 담당
Phase 3 독립 실행

## 예상 결과
테스트 컴파일 성공 → 실제 테스트 실행 가능
