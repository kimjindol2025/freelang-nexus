/**
 * FreeLang Nexus - 통합 Parser
 * V 모드 + Python 모드 함수를 혼합하여 파싱
 */

import { Token, TokenType } from './token';
import * as AST from './ast';

export class NexusParser {
  private tokens: Token[];
  private pos: number = 0;
  private noStructLit: boolean = false; // true일 때 { 를 struct literal로 파싱 안 함

  constructor(tokens: Token[], private source: string = '') {
    this.tokens = tokens;
  }

  private makeError(message: string, token: Token): Error {
    const lines = this.source.split('\n');
    const lineText = lines[token.line - 1] ?? '';
    const pointer = ' '.repeat(Math.max(0, token.column - 1)) + '^^^';
    const detail = this.source
      ? `\n  ${lineText}\n  ${pointer}`
      : '';
    return new Error(
      `파싱 오류 (line ${token.line}, col ${token.column}): ${message}${detail}`
    );
  }

  /**
   * 파싱 진입점
   */
  parse(): AST.Program {
    const body: Array<AST.VFunction | AST.PyFunction | AST.StructDef | AST.Statement | AST.ExternCall | AST.LangBlock | AST.SharedMemDirective> = [];

    while (!this.isAtEnd()) {
      this.skipNewlines();
      if (this.isAtEnd()) break;

      const token = this.peek();

      // @mode 마커는 스킵 (이미 렉서에서 처리됨)
      if (token.type === TokenType.MODE_MARKER) {
        this.advance();
        continue;
      }

      // @shared_mem 디렉티브 (공유 메모리)
      if (token.type === TokenType.LANG_SHARED_MEM) {
        const sharedMem = this.parseSharedMemDirective();
        if (sharedMem) body.push(sharedMem);
        continue;
      }

      // @lang 디렉티브 (다중언어 블록)
      if (token.type === TokenType.LANG_DIRECTIVE) {
        const langBlock = this.parseLangBlock();
        if (langBlock) {
          body.push(langBlock);
        } else {
          // 따옴표 없는 @lang(python) 형식: 다음 탑레벨 선언까지 스킵
          while (!this.isAtEnd()) {
            const next = this.peek();
            if (
              next.type === TokenType.FN ||
              next.type === TokenType.STRUCT ||
              next.type === TokenType.LANG_DIRECTIVE ||
              next.type === TokenType.CALL_DIRECTIVE ||
              next.type === TokenType.MODE_MARKER
            ) break;
            this.advance();
          }
        }
        continue;
      }

      // @call 디렉티브
      if (token.type === TokenType.CALL_DIRECTIVE) {
        const callNode = this.parseCallDirective();
        if (callNode) body.push(callNode);
        continue;
      }

      // 탑레벨 아이템 파싱
      const item = this.parseTopLevel();
      if (item) {
        body.push(item);
      }
    }

    return { type: 'Program', body };
  }

  /**
   * @call 디렉티브 파싱
   * 토큰 value: "@call python:numpy 1.24" 또는 "@call rust:rand as r"
   *
   * 문법: @call <lang>:<package> [<version>] [as <alias>]
   */
  private parseCallDirective(): AST.ExternCall | null {
    const token = this.advance(); // CALL_DIRECTIVE 토큰 소비
    const raw = token.value; // "@call python:numpy 1.24"

    // "@call " 제거
    const body = raw.slice('@call '.length).trim();

    // lang:package 분리
    const colonIdx = body.indexOf(':');
    if (colonIdx === -1) return null;

    const lang = body.slice(0, colonIdx).trim() as AST.ExternCall['lang'];
    const rest = body.slice(colonIdx + 1).trim();

    // "as alias" 분리
    let alias: string | undefined;
    let packageAndVersion = rest;
    const asIdx = rest.search(/\s+as\s+/);
    if (asIdx !== -1) {
      alias = rest.slice(asIdx).replace(/\s+as\s+/, '').trim();
      packageAndVersion = rest.slice(0, asIdx).trim();
    }

    // package와 version 분리 (마지막 공백 기준)
    const parts = packageAndVersion.split(/\s+/);
    const pkg = parts[0];
    const version = parts.length > 1 ? parts[parts.length - 1] : undefined;

    const supportedLangs = new Set(['python', 'rust', 'go', 'julia', 'js', 'c', 'cpp', 'ruby', 'node', 'zig']);
    if (!supportedLangs.has(lang)) return null;

    return {
      type: 'ExternCall',
      lang,
      package: pkg,
      version,
      alias,
      line: token.line,
      column: token.column,
      mode: token.mode,
    };
  }

  /**
   * 다중언어 블록 파싱
   * @lang("rust")
   * @artifact("lib.so")
   * @compile("rustc ...")
   * ---
   * 실제 코드
   * ---
   */
  private parseLangBlock(): AST.LangBlock | null {
    const startToken = this.consume(TokenType.LANG_DIRECTIVE, '@lang 필요');

    // @lang("rust") 에서 "rust" 추출
    const langValue = startToken.value; // "@lang(\"rust\")"
    const langMatch = langValue.match(/@lang\("([^"]*)"\)/);
    if (!langMatch) return null;
    const lang = langMatch[1];

    let artifact: string | undefined;
    let compileCmd: string | undefined;
    let cgo: boolean | undefined;
    let dependsOn: string[] = [];

    // 선택적인 @artifact 파싱
    this.skipNewlines();
    while (this.peek().type === TokenType.LANG_ARTIFACT) {
      const artifactToken = this.advance();
      const artifactMatch = artifactToken.value.match(/@artifact\("([^"]*)"\)/);
      if (artifactMatch) {
        artifact = artifactMatch[1];
      }
      this.skipNewlines();
    }

    // 선택적인 @compile 파싱
    while (this.peek().type === TokenType.LANG_COMPILE_CMD) {
      const compileToken = this.advance();
      const compileMatch = compileToken.value.match(/@compile\("([^"]*)"\)/);
      if (compileMatch) {
        compileCmd = compileMatch[1];
      }
      this.skipNewlines();
    }

    // 선택적인 @cgo 파싱
    if (this.peek().type === TokenType.LANG_CGO) {
      this.advance();
      cgo = true;
      this.skipNewlines();
    }

    // 선택적인 @depends_on 파싱 (여러 번 반복 가능)
    while (this.peek().type === TokenType.LANG_DEPENDS_ON) {
      const depsToken = this.advance();
      const depsMatch = depsToken.value.match(/@depends_on\("([^"]*)"\)/);
      if (depsMatch) {
        dependsOn.push(depsMatch[1]);
      }
      this.skipNewlines();
    }

    // --- raw block (STRING 토큰으로 처리됨)
    const blockToken = this.peek();
    if (blockToken.type !== TokenType.STRING) {
      throw this.makeError('--- 블록 필요', this.peek());
    }

    // blockToken.value = "<content>"
    const sourceCode = blockToken.value.trim();

    this.advance(); // --- 블록 소비

    return {
      type: 'LangBlock',
      lang,
      artifact,
      compileCmd,
      sourceCode,
      cgo,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
      line: startToken.line,
      column: startToken.column,
      mode: startToken.mode,
    };
  }

  /**
   * @shared_mem 디렉티브 파싱
   * @shared_mem("result_buf", size=64, type="i64")
   * POSIX shm_open() + mmap()으로 공유 메모리 생성
   */
  private parseSharedMemDirective(): AST.SharedMemDirective | null {
    const startToken = this.consume(TokenType.LANG_SHARED_MEM, '@shared_mem 필요');

    // @shared_mem("name", size=N, type="dataType") 파싱
    const tokenValue = startToken.value; // "@shared_mem(\"result_buf\", size=64, type=\"i64\")"

    // 예상 형식: @shared_mem("name", size=N, type="type")
    const pattern = /@shared_mem\("([^"]*)"\s*,\s*size\s*=\s*(\d+)\s*,\s*type\s*=\s*"([^"]*)"\)/;
    const match = tokenValue.match(pattern);

    if (!match) {
      throw this.makeError(`@shared_mem 형식 오류: ${tokenValue}`, startToken);
    }

    const name = match[1];
    const size = parseInt(match[2], 10);
    const dataType = match[3];

    this.skipNewlines();

    return {
      type: 'SharedMemDirective',
      name,
      size,
      dataType,
      line: startToken.line,
      column: startToken.column,
      mode: startToken.mode,
    };
  }

  /**
   * 탑레벨 아이템 파싱
   * V 함수, Python 함수, 구조체, 또는 문장
   */
  private parseTopLevel(): AST.VFunction | AST.PyFunction | AST.StructDef | AST.Statement | null {
    const token = this.peek();

    // module 키워드 스킵 (이미 모듈명 처리됨)
    if (token.type === TokenType.MOD) {
      this.advance(); // 'module' 소비
      if (this.peek().type === TokenType.IDENTIFIER) {
        this.advance(); // 모듈명 소비
      }
      this.skipNewlines();
      // module 선언은 AST에 포함되지 않음 (skip)
      return null;
    }

    // V 모드 함수
    if (token.type === TokenType.FN) {
      return this.parseVFunction();
    }

    // Python 모드 함수
    if (token.type === TokenType.DEF) {
      return this.parsePyFunction();
    }

    // 구조체 정의
    if (token.type === TokenType.STRUCT) {
      return this.parseStructDef();
    }

    // 그 외: 문장
    return this.parseStatement();
  }

  /**
   * V 함수 파싱
   * fn name(params) -> type { body }
   */
  private parseVFunction(): AST.VFunction {
    const startToken = this.consume(TokenType.FN, 'fn 키워드 필요');
    const nameToken = this.consume(TokenType.IDENTIFIER, '함수명 필요');
    const name = nameToken.value;

    this.consume(TokenType.LPAREN, '( 필요');
    const params = this.parseVParams();
    this.consume(TokenType.RPAREN, ') 필요');

    const returnType = this.parseReturnType();

    // body 없는 extern 선언: fn foo(a: i64) -> i64  (줄 끝 또는 다음 줄)
    this.skipNewlines();
    if (this.peek().type !== TokenType.LBRACE) {
      return {
        type: 'VFunction',
        name,
        params,
        returnType,
        body: [],
        isExternDecl: true,
        mode: 'v',
        line: startToken.line,
        column: startToken.column,
      } as any;
    }

    this.consume(TokenType.LBRACE, '{ 필요');
    const body = this.parseVBlock();
    this.consume(TokenType.RBRACE, '} 필요');

    return {
      type: 'VFunction',
      name,
      params,
      returnType,
      body,
      mode: 'v',
      line: startToken.line,
      column: startToken.column,
    };
  }

  /**
   * Python 함수 파싱
   * def name(params): INDENT body DEDENT
   */
  private parsePyFunction(): AST.PyFunction {
    const startToken = this.consume(TokenType.DEF, 'def 키워드 필요');
    const nameToken = this.consume(TokenType.IDENTIFIER, '함수명 필요');
    const name = nameToken.value;

    this.consume(TokenType.LPAREN, '( 필요');
    const params = this.parsePyParams();
    this.consume(TokenType.RPAREN, ') 필요');

    const returnType = this.parseReturnType();

    this.consume(TokenType.COLON, ': 필요');
    this.skipNewlines();

    const body = this.parsePyBlock();

    return {
      type: 'PyFunction',
      name,
      params,
      returnType,
      body,
      mode: 'python',
      line: startToken.line,
      column: startToken.column,
    };
  }

  /**
   * 구조체 정의 파싱
   * struct Person { name: string, age: i64 }
   */
  private parseStructDef(): AST.StructDef {
    const startToken = this.consume(TokenType.STRUCT, 'struct 키워드 필요');
    const nameToken = this.consume(TokenType.IDENTIFIER, '구조체 이름 필요');
    this.consume(TokenType.LBRACE, '{ 필요');
    this.skipNewlines();

    const fields: AST.StructField[] = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      this.skipNewlines();
      if (this.peek().type === TokenType.RBRACE) break;

      const fieldNameToken = this.consume(TokenType.IDENTIFIER, '필드명 필요');
      this.consume(TokenType.COLON, ': 필요');
      const typeAnnotation = this.parseType();

      fields.push({
        name: fieldNameToken.value,
        typeAnnotation,
        line: fieldNameToken.line,
        column: fieldNameToken.column,
      });

      // 필드 구분자 , 선택적 소비
      if (this.peek().type === TokenType.COMMA) {
        this.advance();
      }
      this.skipNewlines();
    }

    this.consume(TokenType.RBRACE, '} 필요');

    return {
      type: 'StructDef',
      name: nameToken.value,
      fields,
      line: startToken.line,
      column: startToken.column,
      mode: 'v',
    };
  }

  /**
   * V 함수 파라미터 파싱
   * (x: i64, y: i64)
   */
  private parseVParams(): AST.Parameter[] {
    const params: AST.Parameter[] = [];

    while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
      const nameToken = this.consume(TokenType.IDENTIFIER, '파라미터명 필요');
      this.consume(TokenType.COLON, ': 필요');
      const typeToken = this.peek();
      const typeAnnotation = this.parseType();

      params.push({
        name: nameToken.value,
        typeAnnotation,
        line: nameToken.line,
        column: nameToken.column,
      });

      if (!this.check(TokenType.RPAREN)) {
        this.consume(TokenType.COMMA, ', 필요');
      }
    }

    return params;
  }

  /**
   * Python 함수 파라미터 파싱
   * (x, y) 또는 (x: int, y: int)
   */
  private parsePyParams(): AST.Parameter[] {
    const params: AST.Parameter[] = [];

    while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
      const nameToken = this.consume(TokenType.IDENTIFIER, '파라미터명 필요');
      let typeAnnotation: string | undefined;

      // 타입 어노테이션 (선택)
      if (this.check(TokenType.COLON)) {
        this.advance();
        typeAnnotation = this.parseType();
      }

      params.push({
        name: nameToken.value,
        typeAnnotation,
        line: nameToken.line,
        column: nameToken.column,
      });

      if (!this.check(TokenType.RPAREN)) {
        this.consume(TokenType.COMMA, ', 필요');
      }
    }

    return params;
  }

  /**
   * 반환 타입 파싱
   * -> i64 (선택)
   */
  private parseReturnType(): string | undefined {
    if (this.match(TokenType.ARROW)) {
      return this.parseType();
    }
    return undefined;
  }

  /**
   * 타입 파싱
   * i64, string, bool 등
   */
  private parseType(): string {
    const token = this.peek();

    // 기본 타입
    if (
      token.type === TokenType.I64 ||
      token.type === TokenType.I32 ||
      token.type === TokenType.F64 ||
      token.type === TokenType.F32 ||
      token.type === TokenType.U32 ||
      token.type === TokenType.U64 ||
      token.type === TokenType.BOOL ||
      token.type === TokenType.STRING_TYPE ||
      token.type === TokenType.CHAR ||
      token.type === TokenType.VOID ||
      token.type === TokenType.STRING ||
      token.type === TokenType.IDENTIFIER
    ) {
      return this.advance().value;
    }

    throw this.makeError('타입 필요', token);
  }

  /**
   * 변수 선언 타입 어노테이션 파싱
   * i64, string, bool, i64[], f64[], string[] 등 (배열 타입 포함)
   */
  private parseTypeAnnotation(): string {
    const base = this.parseType();
    // 배열 타입: i64[], string[] 등
    if (this.check(TokenType.LBRACKET) && this.peekAt(1).type === TokenType.RBRACKET) {
      this.advance(); // [
      this.advance(); // ]
      return `${base}[]`;
    }
    return base;
  }

  /**
   * V 블록 파싱
   * { statements }
   */
  private parseVBlock(): AST.Statement[] {
    const statements: AST.Statement[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.skipNewlines();

      if (this.check(TokenType.RBRACE)) break;

      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }

      this.skipNewlines();
    }

    return statements;
  }

  /**
   * Python 블록 파싱
   * INDENT statements DEDENT
   */
  private parsePyBlock(): AST.Statement[] {
    const statements: AST.Statement[] = [];

    this.consume(TokenType.INDENT, 'INDENT 필요');

    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      this.skipNewlines();

      if (this.check(TokenType.DEDENT) || this.isAtEnd()) break;

      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }

      this.skipNewlines();
    }

    // DEDENT 또는 EOF 모두 허용 (파일 끝에서 DEDENT가 항상 생성되지 않을 수 있음)
    if (this.check(TokenType.DEDENT)) {
      this.advance();
    }

    return statements;
  }

  /**
   * 문장 파싱
   */
  private parseStatement(): AST.Statement {
    const token = this.peek();

    // Python import 문장 — 한 줄 전체를 ImportStatement로 파싱
    // "import math" / "import math, statistics" / "from x import y"
    if (token.type === TokenType.IMPORT || token.type === TokenType.FROM) {
      const startToken = this.advance(); // import / from
      const parts: string[] = [startToken.value];
      // 같은 줄 끝까지 읽기
      while (!this.isAtEnd() && this.peek().type !== TokenType.NEWLINE && this.peek().type !== TokenType.EOF) {
        parts.push(this.advance().value);
      }
      return {
        type: 'ExprStatement',
        expression: { type: 'Identifier', name: parts.join(' '), line: startToken.line, column: startToken.column, mode: startToken.mode },
        line: startToken.line,
        column: startToken.column,
        mode: startToken.mode,
      } as any;
    }

    // return 문장
    if (token.type === TokenType.RETURN) {
      return this.parseReturnStatement();
    }

    // if 문장
    if (token.type === TokenType.IF) {
      return this.parseIfStatement();
    }

    // while 루프
    if (token.type === TokenType.WHILE) {
      return this.parseWhileStatement();
    }

    // for 루프
    if (token.type === TokenType.FOR) {
      return this.parseForStatement();
    }

    // break 문장
    if (token.type === TokenType.BREAK) {
      const t = this.advance();
      return { type: 'Break', line: t.line, column: t.column, mode: t.mode };
    }

    // continue 문장
    if (token.type === TokenType.CONTINUE) {
      const t = this.advance();
      return { type: 'Continue', line: t.line, column: t.column, mode: t.mode };
    }

    // match 문장
    if (token.type === TokenType.MATCH) {
      return this.parseMatchStatement();
    }

    // pass 문장 (Python)
    if (token.type === TokenType.PASS) {
      const passToken = this.advance();
      return {
        type: 'ExprStatement',
        expression: {
          type: 'Identifier',
          name: 'pass',
          line: passToken.line,
          column: passToken.column,
          mode: passToken.mode,
        },
        line: passToken.line,
        column: passToken.column,
        mode: passToken.mode,
      };
    }

    // let 또는 식별자 (할당 가능성)
    if (token.type === TokenType.LET || token.type === TokenType.IDENTIFIER) {
      return this.parseAssignOrExpr();
    }

    // 기본값: 표현식 문장
    const expr = this.parseExpression();
    const startToken = this.peek();
    return {
      type: 'ExprStatement',
      expression: expr,
      line: startToken.line,
      column: startToken.column,
      mode: startToken.mode,
    };
  }

  /**
   * match 문장 파싱
   * match x { case 1 => { ... } case _ => { ... } }
   */
  private parseMatchStatement(): AST.MatchStatement {
    const startToken = this.consume(TokenType.MATCH, 'match 키워드 필요');
    // subject 파싱: { 직전에서 멈춤 (struct literal 방지)
    const subject = this.parseForIterable();
    this.skipNewlines();
    this.consume(TokenType.LBRACE, '{ 필요');
    this.skipNewlines();

    const arms: AST.MatchArm[] = [];

    while (this.peek().type !== TokenType.RBRACE && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.peek().type === TokenType.RBRACE) break;

      // case 키워드
      this.consume(TokenType.CASE, 'case 키워드 필요');

      // 패턴: _ (wildcard) 또는 표현식
      let pattern: AST.Expression | null;
      const patternToken = this.peek();
      if (patternToken.type === TokenType.IDENTIFIER && patternToken.value === '_') {
        this.advance(); // _ 소비
        pattern = null; // wildcard
      } else {
        pattern = this.parseExpression();
      }

      // => 화살표
      const arrowToken = this.peek();
      if (arrowToken.type === TokenType.IDENTIFIER && arrowToken.value === '=>') {
        this.advance();
      } else {
        throw this.makeError(`=> 필요, got: '${arrowToken.value}'`, arrowToken);
      }

      // arm body: { ... } 블록 또는 단일 문장
      const body: AST.Statement[] = [];
      this.skipNewlines();
      if (this.peek().type === TokenType.LBRACE) {
        this.advance(); // { 소비
        this.skipNewlines();
        while (this.peek().type !== TokenType.RBRACE && !this.isAtEnd()) {
          this.skipNewlines();
          if (this.peek().type === TokenType.RBRACE) break;
          body.push(this.parseStatement());
          this.skipNewlines();
        }
        this.consume(TokenType.RBRACE, '} 필요');
      } else {
        body.push(this.parseStatement());
      }

      arms.push({
        pattern,
        body,
        line: patternToken.line,
        column: patternToken.column,
      });

      this.skipNewlines();
    }

    this.consume(TokenType.RBRACE, '} 필요');

    return {
      type: 'MatchStatement',
      subject,
      arms,
      mode: startToken.mode,
      line: startToken.line,
      column: startToken.column,
    };
  }

  /**
   * Return 문장 파싱
   */
  private parseReturnStatement(): AST.ReturnStatement {
    const startToken = this.consume(TokenType.RETURN, 'return 필요');
    let value: AST.Expression | undefined;

    // 반환값이 있으면 파싱
    if (!this.check(TokenType.NEWLINE) && !this.check(TokenType.DEDENT) && !this.check(TokenType.RBRACE)) {
      value = this.parseExpression();
    }

    return {
      type: 'Return',
      value,
      line: startToken.line,
      column: startToken.column,
      mode: startToken.mode,
    };
  }

  /**
   * 할당 또는 표현식 파싱
   */
  private parseAssignOrExpr(): AST.Statement {
    const startToken = this.peek();

    // let x = value  또는  let x: type = value
    if (startToken.type === TokenType.LET) {
      this.advance();
      const nameToken = this.consume(TokenType.IDENTIFIER, '변수명 필요');

      // 선택적 타입 어노테이션: : i64, : string, : i64[], : f64[] 등
      let typeAnnotation: string | undefined;
      if (this.check(TokenType.COLON)) {
        this.advance();
        typeAnnotation = this.parseTypeAnnotation();
      }

      this.consume(TokenType.EQUAL, '= 필요');
      const value = this.parseExpression();

      return {
        type: 'Assign',
        name: nameToken.value,
        typeAnnotation,
        value,
        line: startToken.line,
        column: startToken.column,
        mode: startToken.mode,
      };
    }

    // x = value 또는 함수호출 등
    if (startToken.type === TokenType.IDENTIFIER) {
      const nameToken = this.peek();
      const name = nameToken.value;
      this.advance();

      if (this.check(TokenType.EQUAL)) {
        this.advance();
        const value = this.parseExpression();

        return {
          type: 'Assign',
          name,
          value,
          line: startToken.line,
          column: startToken.column,
          mode: startToken.mode,
        };
      }

      // arr[i] = v — 배열 인덱스 할당 (lookahead)
      if (this.check(TokenType.LBRACKET)) {
        const savedPos = this.pos;
        this.advance(); // [
        const index = this.parseExpression();
        if (this.check(TokenType.RBRACKET)) {
          this.advance(); // ]
          if (this.check(TokenType.EQUAL)) {
            this.advance(); // =
            const value = this.parseExpression();
            return {
              type: 'IndexAssign',
              object: { type: 'Identifier', name, line: startToken.line, column: startToken.column, mode: startToken.mode },
              index,
              value,
              line: startToken.line,
              column: startToken.column,
              mode: startToken.mode,
            } as any;
          }
        }
        // 아니면 되돌리기
        this.pos = savedPos;
      }

      // p.field = v — 구조체 필드 할당 (lookahead)
      if (this.check(TokenType.DOT)) {
        const savedPos = this.pos;
        this.advance(); // .
        if (this.check(TokenType.IDENTIFIER)) {
          const fieldName = this.peek().value;
          this.advance(); // field
          if (this.check(TokenType.EQUAL)) {
            this.advance(); // =
            const value = this.parseExpression();
            return {
              type: 'FieldAssign',
              object: { type: 'Identifier', name, line: startToken.line, column: startToken.column, mode: startToken.mode },
              field: fieldName,
              value,
              line: startToken.line,
              column: startToken.column,
              mode: startToken.mode,
            } as any;
          }
        }
        // 아니면 되돌리기
        this.pos = savedPos;
      }

      // 아니면 전체 표현식으로 다시 파싱 (함수호출 등 포함)
      // pos를 한 칸 뒤로 이동하여 식별자부터 다시 파싱
      this.pos--;
      const expr = this.parseExpression();

      return {
        type: 'ExprStatement',
        expression: expr,
        line: startToken.line,
        column: startToken.column,
        mode: startToken.mode,
      };
    }

    throw this.makeError('예상치 못한 토큰', startToken);
  }

  /**
   * If 문장 파싱
   * if condition { body } [else { body }]
   */
  private parseIfStatement(): AST.IfStatement {
    const startToken = this.consume(TokenType.IF, 'if 키워드 필요');
    this.noStructLit = true;
    const condition = this.parseExpression();
    this.noStructLit = false;
    this.consume(TokenType.LBRACE, '{ 필요');
    const thenBranch = this.parseVBlock();
    this.consume(TokenType.RBRACE, '} 필요');

    let elseBranch: AST.Statement[] | undefined;
    this.skipNewlines();
    if (this.match(TokenType.ELSE)) {
      this.skipNewlines();
      // else if 체인 지원
      if (this.check(TokenType.IF)) {
        elseBranch = [this.parseIfStatement()];
      } else {
        this.consume(TokenType.LBRACE, '{ 필요');
        elseBranch = this.parseVBlock();
        this.consume(TokenType.RBRACE, '} 필요');
      }
    }

    return {
      type: 'IfStatement',
      condition,
      thenBranch,
      elseBranch,
      line: startToken.line,
      column: startToken.column,
      mode: startToken.mode,
    };
  }

  /**
   * While 루프 파싱
   * while condition { body }
   */
  private parseWhileStatement(): AST.WhileStatement {
    const startToken = this.consume(TokenType.WHILE, 'while 키워드 필요');
    this.noStructLit = true;
    const condition = this.parseExpression();
    this.noStructLit = false;
    this.consume(TokenType.LBRACE, '{ 필요');
    const body = this.parseVBlock();
    this.consume(TokenType.RBRACE, '} 필요');

    return {
      type: 'WhileStatement',
      condition,
      body,
      line: startToken.line,
      column: startToken.column,
      mode: startToken.mode,
    };
  }

  /**
   * For-In 이터러블 파싱 (구조체 리터럴 제외: { 앞에서 멈춤)
   * for x in arr { ... } 에서 arr만 파싱
   * for x in range(n) { ... } 에서 range(n)만 파싱
   */
  private parseForIterable(): AST.Expression {
    let expr = this.parsePrimary();

    // 함수 호출만 허용 (구조체 리터럴 { 는 루프 본문이므로 제외)
    while (this.peek().type === TokenType.LPAREN || this.peek().type === TokenType.LBRACKET || this.peek().type === TokenType.DOT) {
      if (this.match(TokenType.LPAREN)) {
        const args = this.parseArguments();
        this.consume(TokenType.RPAREN, ') 필요');
        const token = this.previous();
        expr = {
          type: 'Call',
          callee: expr,
          args,
          line: token.line,
          column: token.column,
          mode: token.mode,
        };
      } else if (this.match(TokenType.LBRACKET)) {
        const index = this.parseExpression();
        const token = this.consume(TokenType.RBRACKET, '] 필요');
        expr = {
          type: 'ArrayAccess',
          object: expr,
          index,
          line: token.line,
          column: token.column,
          mode: token.mode,
        };
      } else if (this.match(TokenType.DOT)) {
        const propToken = this.consume(TokenType.IDENTIFIER, '프로퍼티명 필요');
        const token = this.previous();
        expr = {
          type: 'MemberAccess',
          object: expr,
          property: propToken.value,
          line: token.line,
          column: token.column,
          mode: token.mode,
        } as any;
      } else {
        break;
      }
    }

    return expr;
  }

  /**
   * For-In 루프 파싱
   * for <variable> in <iterable> { <body> }
   */
  private parseForStatement(): AST.ForStatement {
    const startToken = this.consume(TokenType.FOR, 'for 키워드 필요');
    const varToken = this.consume(TokenType.IDENTIFIER, '루프 변수명 필요');
    this.consume(TokenType.IN, 'in 키워드 필요');
    const iterable = this.parseForIterable();
    this.consume(TokenType.LBRACE, '{ 필요');
    const body = this.parseVBlock();
    this.consume(TokenType.RBRACE, '} 필요');

    return {
      type: 'ForStatement',
      variable: varToken.value,
      iterable,
      body,
      line: startToken.line,
      column: startToken.column,
      mode: startToken.mode,
    };
  }

  /**
   * 표현식 파싱
   * 간단한 구현: 곱셈/나눗셈 → 덧셈/뺄셈 → 비교/논리
   */
  private parseExpression(): AST.Expression {
    return this.parseLogicalOr();
  }

  /**
   * 논리 OR 파싱: ||
   */
  private parseLogicalOr(): AST.Expression {
    let expr = this.parseLogicalAnd();

    while (this.match(TokenType.OR)) {
      const operator = this.previous().value;
      const right = this.parseLogicalAnd();
      const token = this.previous();
      expr = {
        type: 'BinaryExpr',
        left: expr,
        operator,
        right,
        line: token.line,
        column: token.column,
        mode: token.mode,
      };
    }

    return expr;
  }

  /**
   * 논리 AND 파싱: &&
   */
  private parseLogicalAnd(): AST.Expression {
    let expr = this.parseEquality();

    while (this.match(TokenType.AND)) {
      const operator = this.previous().value;
      const right = this.parseEquality();
      const token = this.previous();
      expr = {
        type: 'BinaryExpr',
        left: expr,
        operator,
        right,
        line: token.line,
        column: token.column,
        mode: token.mode,
      };
    }

    return expr;
  }

  /**
   * 등호/부등호 파싱: ==, !=
   */
  private parseEquality(): AST.Expression {
    let expr = this.parseComparison();

    while (this.match(TokenType.EQ, TokenType.NE)) {
      const operator = this.previous().value;
      const right = this.parseComparison();
      const token = this.previous();
      expr = {
        type: 'BinaryExpr',
        left: expr,
        operator,
        right,
        line: token.line,
        column: token.column,
        mode: token.mode,
      };
    }

    return expr;
  }

  /**
   * 비교 파싱: <, >, <=, >=
   */
  private parseComparison(): AST.Expression {
    let expr = this.parseAddition();

    while (this.match(TokenType.LT, TokenType.GT, TokenType.LE, TokenType.GE)) {
      const operator = this.previous().value;
      const right = this.parseAddition();
      const token = this.previous();
      expr = {
        type: 'BinaryExpr',
        left: expr,
        operator,
        right,
        line: token.line,
        column: token.column,
        mode: token.mode,
      };
    }

    return expr;
  }

  /**
   * 덧셈/뺄셈 파싱
   */
  private parseAddition(): AST.Expression {
    let expr = this.parseMultiplication();

    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.previous().value;
      const right = this.parseMultiplication();
      const token = this.previous();
      expr = {
        type: 'BinaryExpr',
        left: expr,
        operator,
        right,
        line: token.line,
        column: token.column,
        mode: token.mode,
      };
    }

    return expr;
  }

  /**
   * 곱셈/나눗셈 파싱
   */
  private parseMultiplication(): AST.Expression {
    let expr = this.parseUnary();

    while (this.match(TokenType.STAR, TokenType.SLASH)) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      const token = this.previous();
      expr = {
        type: 'BinaryExpr',
        left: expr,
        operator,
        right,
        line: token.line,
        column: token.column,
        mode: token.mode,
      };
    }

    return expr;
  }

  /**
   * 단항 연산 파싱 (-, !)
   */
  private parseUnary(): AST.Expression {
    // 단항 음수: -expr
    if (this.check(TokenType.MINUS)) {
      const opToken = this.advance();
      const operand = this.parseUnary();
      // 숫자 리터럴이면 바로 음수로 접힘
      if (operand.type === 'Number') {
        const n = operand as AST.NumberLiteral;
        return {
          type: 'Number',
          value: `-${n.value}`,
          line: opToken.line,
          column: opToken.column,
          mode: opToken.mode,
        };
      }
      // 그 외: 0 - expr 로 변환
      return {
        type: 'BinaryExpr',
        left: { type: 'Number', value: 0, line: opToken.line, column: opToken.column, mode: opToken.mode },
        operator: '-',
        right: operand,
        line: opToken.line,
        column: opToken.column,
        mode: opToken.mode,
      };
    }

    // 논리 부정: !expr
    if (this.check(TokenType.NOT)) {
      const opToken = this.advance();
      const operand = this.parseUnary();
      return {
        type: 'BinaryExpr',
        left: { type: 'Number', value: 0, line: opToken.line, column: opToken.column, mode: opToken.mode },
        operator: '==',
        right: operand,
        line: opToken.line,
        column: opToken.column,
        mode: opToken.mode,
      };
    }

    return this.parsePostfix();
  }

  /**
   * 후위 연산 파싱 (함수 호출, 배열 접근, 구조체 리터럴)
   */
  private parsePostfix(): AST.Expression {
    let expr = this.parsePrimary();

    while (true) {
      // Identifier 뒤에 { 가 오면 구조체 리터럴 (조건 파싱 중에는 비활성화)
      if (!this.noStructLit && expr.type === 'Identifier' && this.peek().type === TokenType.LBRACE) {
        const structName = (expr as AST.Identifier).name;
        expr = this.parseStructLiteral(structName, expr.line, expr.column);
        continue;
      }

      // 함수 호출: foo()
      if (this.match(TokenType.LPAREN)) {
        const args = this.parseArguments();
        this.consume(TokenType.RPAREN, ') 필요');

        const token = this.previous();
        expr = {
          type: 'Call',
          callee: expr,
          args,
          line: token.line,
          column: token.column,
          mode: token.mode,
        };
      }
      // 배열 인덱싱: arr[0]
      else if (this.match(TokenType.LBRACKET)) {
        const index = this.parseExpression();
        const token = this.consume(TokenType.RBRACKET, '] 필요');

        expr = {
          type: 'ArrayAccess',
          object: expr,
          index,
          line: token.line,
          column: token.column,
          mode: token.mode,
        };
      }
      // 멤버 접근: obj.property
      else if (this.match(TokenType.DOT)) {
        const propToken = this.consume(TokenType.IDENTIFIER, '프로퍼티명 필요');
        const token = this.previous();

        expr = {
          type: 'MemberAccess',
          object: expr,
          property: propToken.value,
          line: token.line,
          column: token.column,
          mode: token.mode,
        };
      } else {
        break;
      }
    }

    return expr;
  }

  /**
   * 기본 표현식 파싱 (리터럴, 식별자 등)
   */
  private parsePrimary(): AST.Expression {
    const token = this.peek();

    // 숫자
    if (token.type === TokenType.NUMBER) {
      this.advance();
      return {
        type: 'Number',
        value: token.value,
        line: token.line,
        column: token.column,
        mode: token.mode,
      };
    }

    // 문자열
    if (token.type === TokenType.STRING) {
      this.advance();
      return {
        type: 'String',
        value: token.value,
        line: token.line,
        column: token.column,
        mode: token.mode,
      };
    }

    // true, false
    if (token.type === TokenType.TRUE || token.type === TokenType.FALSE) {
      this.advance();
      return {
        type: 'Number',
        value: token.type === TokenType.TRUE ? 1 : 0,
        line: token.line,
        column: token.column,
        mode: token.mode,
      };
    }

    // 배열 리터럴: [1, 2, 3]
    if (token.type === TokenType.LBRACKET) {
      return this.parseArrayLiteral();
    }

    // 식별자
    if (token.type === TokenType.IDENTIFIER) {
      this.advance();
      return {
        type: 'Identifier',
        name: token.value,
        line: token.line,
        column: token.column,
        mode: token.mode,
      };
    }

    // 괄호 식
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.consume(TokenType.RPAREN, ') 필요');
      return expr;
    }

    throw this.makeError(`예상치 못한 토큰: '${token.value}'`, token);
  }

  /**
   * 배열 리터럴 파싱
   * [1, 2, 3], [], [a+b, c*d], [1, 2,] (trailing comma 지원)
   */
  private parseArrayLiteral(): AST.ArrayLiteral {
    const startToken = this.consume(TokenType.LBRACKET, '[');
    const elements: AST.Expression[] = [];

    // 빈 배열 또는 요소들
    while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
      elements.push(this.parseExpression());

      // 쉼표가 있으면 계속, 없으면 종료
      if (!this.match(TokenType.COMMA)) {
        break;
      }

      // trailing comma: 쉼표 뒤에 ] 가 있으면 즉시 종료
      if (this.check(TokenType.RBRACKET)) {
        break;
      }
    }

    const endToken = this.consume(TokenType.RBRACKET, '] 필요');

    return {
      type: 'Array',
      elements,
      line: startToken.line,
      column: startToken.column,
      mode: startToken.mode,
    };
  }

  /**
   * 구조체 리터럴 파싱
   * Person { name: "Alice", age: 30 }
   */
  private parseStructLiteral(name: string, startLine: number, startCol: number): AST.StructLiteral {
    this.consume(TokenType.LBRACE, '{ 필요');
    this.skipNewlines();

    const fields: { [key: string]: AST.Expression } = {};

    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      this.skipNewlines();
      if (this.peek().type === TokenType.RBRACE) break;

      const fieldNameToken = this.consume(TokenType.IDENTIFIER, '필드명 필요');
      this.consume(TokenType.COLON, ': 필요');
      fields[fieldNameToken.value] = this.parseExpression();

      if (this.peek().type === TokenType.COMMA) {
        this.advance();
      }
      this.skipNewlines();
    }

    this.consume(TokenType.RBRACE, '} 필요');

    return {
      type: 'StructLiteral',
      name,
      fields,
      line: startLine,
      column: startCol,
      mode: 'v',
    };
  }

  /**
   * 함수 호출 인자 파싱
   */
  private parseArguments(): AST.Expression[] {
    const args: AST.Expression[] = [];

    if (!this.check(TokenType.RPAREN)) {
      do {
        args.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
    }

    return args;
  }

  // ========== 헬퍼 메서드 ==========

  private peek(): Token {
    if (this.pos >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1]; // EOF 토큰
    }
    return this.tokens[this.pos];
  }

  private peekAt(offset: number): Token {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1]; // EOF 토큰
    }
    return this.tokens[idx];
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.pos++;
    }
    return this.previous();
  }

  private previous(): Token {
    return this.tokens[this.pos - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    const token = this.peek();
    throw this.makeError(`${message}, got '${token.value}'`, token);
  }

  private skipNewlines(): void {
    while (this.match(TokenType.NEWLINE)) {
      // 계속
    }
  }
}
