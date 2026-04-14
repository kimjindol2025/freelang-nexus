/**
 * FreeLang Nexus - 통합 Lexer
 * V 모드 + Python 모드를 동시에 지원
 *
 * PyFree의 INDENT/DEDENT 패턴 + FV의 복합 연산자 처리 + 모드 전환
 */

import {
  Token,
  TokenType,
  getKeywordToken,
  detectMode,
  V_KEYWORDS,
  PYTHON_KEYWORDS,
} from './token';
import { ModeDetector } from './mode-detector';

export class NexusLexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private currentMode: 'v' | 'python' | 'auto' = 'auto';
  private indentStack: number[] = [0]; // Python INDENT/DEDENT 스택 (PyFree 패턴)
  private atLineStart: boolean = true; // Python 들여쓰기 처리용
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  /**
   * 전체 소스 토큰화
   */
  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      const token = this.nextToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    // EOF 토큰 추가
    this.tokens.push(this.makeToken(TokenType.EOF, '', this.currentMode));

    return this.tokens;
  }

  /**
   * 다음 토큰 가져오기
   */
  private nextToken(): Token | null {
    const ch = this.peek();

    if (ch === undefined) {
      return null;
    }

    // 개행
    if (ch === '\n') {
      this.advance();
      this.atLineStart = true;
      this.column = 1;
      return this.makeToken(TokenType.NEWLINE, '\n', this.currentMode);
    }

    // 줄 시작에서 들여쓰기 처리 (Python 모드)
    if (this.atLineStart && this.currentMode === 'python') {
      const indentToken = this.handleIndentation();
      this.atLineStart = false;
      if (indentToken) {
        return indentToken;
      }
    }

    // 공백 (탭, 스페이스) - 이미 라인 시작 처리됨
    if (this.isWhitespace(ch)) {
      this.skipWhitespace();
      return this.nextToken(); // 재귀 호출
    }

    // 주석: V 모드는 //, Python 모드는 #
    if (ch === '/' && this.peek(1) === '/' && this.currentMode === 'v') {
      this.skipLineComment();
      return this.nextToken(); // 재귀 호출
    }

    if (ch === '#' && this.currentMode === 'python') {
      this.skipLineComment();
      return this.nextToken(); // 재귀 호출
    }

    // --- raw 블록 (다중언어 코드) - 줄 시작에만 적용
    if (ch === '-' && this.peek(1) === '-' && this.peek(2) === '-' && this.atLineStart) {
      return this.tokenizeRawBlock();
    }

    // @ 디렉티브 (@mode, @call, @lang)
    if (ch === '@') {
      const modeToken = this.tryParseMode();
      if (modeToken) return modeToken;

      const langToken = this.tryParseLangDirective();
      if (langToken) return langToken;

      const callToken = this.tryParseCall();
      if (callToken) return callToken;

      // 따옴표 없는 @lang(c) / @lang(python) 형식 폴백 처리
      const langSimpleToken = this.tryParseLang();
      if (langSimpleToken) return langSimpleToken;
    }

    // 문자열
    if (ch === '"' || ch === "'" || (ch === 'f' && (this.peek(1) === '"' || this.peek(1) === "'"))) {
      return this.tokenizeString();
    }

    // 숫자
    if (this.isDigit(ch)) {
      return this.tokenizeNumber();
    }

    // 식별자 또는 키워드
    if (this.isIdentifierStart(ch)) {
      return this.tokenizeIdentifierOrKeyword();
    }

    // 연산자
    const operatorToken = this.tokenizeOperator();
    if (operatorToken) {
      return operatorToken;
    }

    // 알 수 없는 문자
    throw new Error(`Unknown character: '${ch}' at line ${this.line}, column ${this.column}`);
  }

  /**
   * 들여쓰기 처리 (Python 모드 전용)
   * PyFree 패턴 재사용
   */
  private handleIndentation(): Token | null {
    let indent = 0;

    // 현재 위치에서 연속된 스페이스/탭 세기 (이미 라인 시작에 있다고 가정)
    const lineStart = this.pos;
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === ' ') {
        indent += 1;
        this.pos++;
      } else if (ch === '\t') {
        indent += 8; // 탭 = 8 스페이스
        this.pos++;
      } else {
        break;
      }
    }

    // 라인이 비어있으면 (주석/개행만) 들여쓰기 무시
    const ch = this.peek();
    if (ch === '\n' || ch === '#' || ch === undefined) {
      this.pos = lineStart;
      return null;
    }

    const currentIndent = this.indentStack[this.indentStack.length - 1] || 0;

    if (indent > currentIndent) {
      // INDENT
      this.indentStack.push(indent);
      return this.makeToken(TokenType.INDENT, '\t', this.currentMode);
    } else if (indent < currentIndent) {
      // DEDENT
      while (this.indentStack.length > 0 && this.indentStack[this.indentStack.length - 1] > indent) {
        this.indentStack.pop();
      }
      return this.makeToken(TokenType.DEDENT, '', this.currentMode);
    }

    return null;
  }

  /**
   * 식별자 또는 키워드 토큰화
   */
  private tokenizeIdentifierOrKeyword(): Token {
    const start = this.pos;
    const startColumn = this.column;

    while (this.pos < this.source.length && this.isIdentifierChar(this.peek())) {
      this.advance();
    }

    const value = this.source.substring(start, this.pos);

    // 키워드 확인
    const keywordType = getKeywordToken(value, this.currentMode);
    if (keywordType) {
      return this.makeToken(keywordType, value, this.currentMode);
    }

    return this.makeToken(TokenType.IDENTIFIER, value, this.currentMode);
  }

  /**
   * 숫자 토큰화
   */
  private tokenizeNumber(): Token {
    const start = this.pos;

    // 16진수 (0x)
    if (this.peek() === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
      this.advance(); // '0'
      this.advance(); // 'x'
      while (this.isHexDigit(this.peek())) {
        this.advance();
      }
    }
    // 2진수 (0b)
    else if (this.peek() === '0' && (this.peek(1) === 'b' || this.peek(1) === 'B')) {
      this.advance(); // '0'
      this.advance(); // 'b'
      while (this.peek() === '0' || this.peek() === '1') {
        this.advance();
      }
    }
    // 8진수 (0o)
    else if (this.peek() === '0' && (this.peek(1) === 'o' || this.peek(1) === 'O')) {
      this.advance(); // '0'
      this.advance(); // 'o'
      while (this.isOctalDigit(this.peek())) {
        this.advance();
      }
    }
    // 10진수 (정수 또는 실수)
    else {
      while (this.isDigit(this.peek())) {
        this.advance();
      }

      // 실수: . 또는 e/E
      if (this.peek() === '.' && this.isDigit(this.peek(1))) {
        this.advance(); // '.'
        while (this.isDigit(this.peek())) {
          this.advance();
        }
      }

      if (this.peek() === 'e' || this.peek() === 'E') {
        this.advance();
        if (this.peek() === '+' || this.peek() === '-') {
          this.advance();
        }
        while (this.isDigit(this.peek())) {
          this.advance();
        }
      }
    }

    const value = this.source.substring(start, this.pos);
    return this.makeToken(TokenType.NUMBER, value, this.currentMode);
  }

  /**
   * 문자열 토큰화
   */
  private tokenizeString(): Token {
    const start = this.pos;
    let isFString = false;

    // f-string 확인
    if (this.peek() === 'f' && (this.peek(1) === '"' || this.peek(1) === "'")) {
      isFString = true;
      this.advance(); // 'f'
    }

    const quote = this.peek();
    this.advance(); // 첫 따옴표

    // 3중 따옴표 확인
    let isTriple = false;
    if (this.peek() === quote && this.peek(1) === quote) {
      isTriple = true;
      this.advance();
      this.advance();
    }

    // 문자열 내용 읽기
    while (this.pos < this.source.length) {
      const ch = this.peek();

      if (isTriple) {
        if (ch === quote && this.peek(1) === quote && this.peek(2) === quote) {
          this.advance();
          this.advance();
          this.advance();
          break;
        }
      } else {
        if (ch === quote) {
          this.advance();
          break;
        }
        if (ch === '\n') {
          throw new Error(`Unterminated string at line ${this.line}`);
        }
      }

      if (ch === '\\') {
        this.advance(); // 이스케이프 문자 다음
        if (this.pos < this.source.length) {
          this.advance();
        }
      } else {
        this.advance();
      }
    }

    const value = this.source.substring(start, this.pos);
    return this.makeToken(TokenType.STRING, value, this.currentMode);
  }

  /**
   * 연산자 토큰화
   */
  /**
   * --- 다중언어 블록 파싱 (raw 코드)
   * ---
   * <raw code - 어떤 문자든 가능>
   * ---
   */
  private tokenizeRawBlock(): Token {
    const startLine = this.line;
    const startColumn = this.column;

    // 시작 --- 스킵
    this.advance(); // -
    this.advance(); // -
    this.advance(); // -

    // 줄 끝까지 스킵 (주석 가능)
    while (this.pos < this.source.length && this.peek() !== '\n') {
      this.advance();
    }
    if (this.peek() === '\n') {
      this.advance(); // 줄 끝 개행
      this.atLineStart = true;
    }

    // 다음 --- 까지의 모든 내용 수집 (반드시 줄 시작에 있어야 함)
    let content = '';
    while (this.pos < this.source.length) {
      const ch = this.peek();
      const next1 = this.peek(1);
      const next2 = this.peek(2);

      // 줄 시작에서 ---를 찾음
      if (this.atLineStart && ch === '-' && next1 === '-' && next2 === '-') {
        // 종료 --- 찾음
        break;
      }

      content += ch;
      if (ch === '\n') {
        this.line++;
        this.column = 1;
        this.atLineStart = true;
      } else {
        this.column++;
        if (!this.isWhitespace(ch)) {
          this.atLineStart = false;
        }
      }
      this.pos++;
    }

    // 종료 --- 스킵
    if (this.peek() === '-' && this.peek(1) === '-' && this.peek(2) === '-') {
      this.advance(); // -
      this.advance(); // -
      this.advance(); // -
      // 줄 끝까지 스킵
      while (this.pos < this.source.length && this.peek() !== '\n') {
        this.advance();
      }
      if (this.peek() === '\n') {
        this.advance();
      }
      this.atLineStart = true;
    }

    return this.makeToken(TokenType.STRING, content, this.currentMode);
  }

  private tokenizeOperator(): Token | null {
    const ch = this.peek();
    const next = this.peek(1);
    const next2 = this.peek(2);

    if (ch === '.' && next === '.' && next2 === '=') {
      this.advance();
      this.advance();
      this.advance();
      return this.makeToken(TokenType.IDENTIFIER, '..=', this.currentMode); // 커스텀
    }

    // 2글자 연산자
    const twoChar = ch && next ? ch + next : '';
    const twoCharMap: Record<string, TokenType> = {
      '->': TokenType.ARROW,
      '=>': TokenType.IDENTIFIER, // FatArrow (커스텀)
      '==': TokenType.EQ,
      '!=': TokenType.NE,
      '<=': TokenType.LE,
      '>=': TokenType.GE,
      '&&': TokenType.AND,
      '||': TokenType.OR,
      '::': TokenType.IDENTIFIER, // DoubleColon (커스텀)
      '..': TokenType.IDENTIFIER, // DotDot (커스텀)
      '//': TokenType.SLASH, // 이미 주석 처리됨
      '**': TokenType.STAR, // Power (커스텀)
    };

    if (twoCharMap[twoChar]) {
      this.advance();
      this.advance();
      return this.makeToken(twoCharMap[twoChar], twoChar, this.currentMode);
    }

    // 1글자 연산자
    const oneCharMap: Record<string, TokenType> = {
      '(': TokenType.LPAREN,
      ')': TokenType.RPAREN,
      '{': TokenType.LBRACE,
      '}': TokenType.RBRACE,
      '[': TokenType.LBRACKET,
      ']': TokenType.RBRACKET,
      ',': TokenType.COMMA,
      '.': TokenType.DOT,
      ';': TokenType.SEMICOLON,
      ':': TokenType.COLON,
      '=': TokenType.EQUAL,
      '+': TokenType.PLUS,
      '-': TokenType.MINUS,
      '*': TokenType.STAR,
      '/': TokenType.SLASH,
      '%': TokenType.PERCENT,
      '<': TokenType.LT,
      '>': TokenType.GT,
      '!': TokenType.NOT,
      '&': TokenType.AMPERSAND,
      '|': TokenType.PIPE,
      '@': TokenType.AT,
    };

    if (ch && oneCharMap[ch]) {
      this.advance();
      return this.makeToken(oneCharMap[ch], ch, this.currentMode);
    }

    return null;
  }

  /**
   * @mode() 디렉티브 파싱
   */
  private tryParseMode(): Token | null {
    const start = this.pos;

    if (this.peek() !== '@') {
      return null;
    }

    this.advance(); // '@'

    // @mode 확인
    if (
      this.peek() === 'm' &&
      this.peek(1) === 'o' &&
      this.peek(2) === 'd' &&
      this.peek(3) === 'e'
    ) {
      this.advance();
      this.advance();
      this.advance();
      this.advance();

      // 공백 및 ( 확인
      while (this.isWhitespace(this.peek()) && this.peek() !== '\n') {
        this.advance();
      }

      if (this.peek() !== '(') {
        // @mode가 아니면 다시 돌아가기
        this.pos = start;
        return null;
      }

      this.advance(); // '('

      // 공백
      while (this.isWhitespace(this.peek()) && this.peek() !== '\n') {
        this.advance();
      }

      // v 또는 python 확인
      let mode: 'v' | 'python' | null = null;

      if (this.peek() === 'v' && (this.peek(1) === ')' || this.isWhitespace(this.peek(1)))) {
        mode = 'v';
        this.advance();
      } else if (
        this.peek() === 'p' &&
        this.peek(1) === 'y' &&
        this.peek(2) === 't' &&
        this.peek(3) === 'h' &&
        this.peek(4) === 'o' &&
        this.peek(5) === 'n'
      ) {
        mode = 'python';
        this.advance();
        this.advance();
        this.advance();
        this.advance();
        this.advance();
        this.advance();
      }

      if (!mode) {
        // 유효한 모드가 아니면 다시 돌아가기
        this.pos = start;
        return null;
      }

      // 공백 및 ) 확인
      while (this.isWhitespace(this.peek()) && this.peek() !== '\n') {
        this.advance();
      }

      if (this.peek() !== ')') {
        this.pos = start;
        return null;
      }

      this.advance(); // ')'

      // 모드 전환!
      this.currentMode = mode;

      const value = this.source.substring(start, this.pos);
      return this.makeToken(TokenType.MODE_MARKER, value, mode);
    }

    this.pos = start;
    return null;
  }

  /**
   * @lang(), @artifact(), @compile(), @cgo, @shared_mem, @depends_on 디렉티브 파싱
   * @lang("rust")
   * @artifact("librustcore.so")
   * @compile("rustc --crate-type cdylib ...")
   * @cgo
   * @shared_mem("name", size=N, type="i64")
   * @depends_on("artifact_name")
   */
  private tryParseLangDirective(): Token | null {
    const start = this.pos;

    if (this.peek() !== '@') return null;
    this.advance(); // '@'

    // 디렉티브 키워드 확인
    let directive: 'lang' | 'artifact' | 'compile' | 'cgo' | 'shared_mem' | 'depends_on' | null = null;
    for (const kw of ['lang', 'artifact', 'compile', 'cgo', 'shared_mem', 'depends_on']) {
      if (this.source.substr(this.pos, kw.length) === kw &&
          !this.isIdentifierChar(this.source[this.pos + kw.length])) {
        directive = kw as 'lang' | 'artifact' | 'compile' | 'cgo' | 'shared_mem' | 'depends_on';
        for (let i = 0; i < kw.length; i++) {
          this.advance();
        }
        break;
      }
    }

    if (!directive) {
      this.pos = start;
      return null;
    }

    // @cgo는 파라미터 없음 (뒤에 newline이나 다른 토큰 와야 함)
    if (directive === 'cgo') {
      return this.makeToken(TokenType.LANG_CGO, '@cgo', this.currentMode);
    }

    // '(' 확인
    while (this.isWhitespace(this.peek()) && this.peek() !== '\n') {
      this.advance();
    }

    if (this.peek() !== '(') {
      this.pos = start;
      return null;
    }
    this.advance(); // '('

    // 문자열/값 파싱 (따옴표 안 또는 파라미터)
    let parameterValue = '';

    // @shared_mem과 @depends_on은 전체 파라미터를 읽음
    // @shared_mem("name", size=N, type="dataType")
    // @depends_on("artifact_name")
    if (directive === 'shared_mem' || directive === 'depends_on') {
      // '('에서 ')' 까지 모든 내용 읽기
      while (this.pos < this.source.length && this.peek() !== ')') {
        parameterValue += this.peek();
        this.advance();
      }
      if (this.peek() !== ')') {
        this.pos = start;
        return null;
      }
      this.advance(); // ')'

      const value = `@${directive}(${parameterValue})`;
      let tokenType: TokenType;
      if (directive === 'shared_mem') {
        tokenType = TokenType.LANG_SHARED_MEM;
      } else {
        tokenType = TokenType.LANG_DEPENDS_ON;
      }
      return this.makeToken(tokenType, value, this.currentMode);
    }

    // 다른 디렉티브는 첫 번째 따옴표 문자열만 읽음
    const quoteChar = this.peek();

    if (quoteChar !== '"' && quoteChar !== "'") {
      this.pos = start;
      return null;
    }
    this.advance(); // 시작 따옴표

    let stringValue = '';
    // 따옴표 종료까지 읽기
    while (this.pos < this.source.length && this.peek() !== quoteChar) {
      if (this.peek() === '\\') {
        stringValue += this.peek();
        this.advance();
        stringValue += this.peek();
        this.advance();
      } else {
        stringValue += this.peek();
        this.advance();
      }
    }

    if (this.peek() !== quoteChar) {
      this.pos = start;
      return null;
    }
    this.advance(); // 종료 따옴표

    // ')' 확인
    if (this.peek() !== ')') {
      this.pos = start;
      return null;
    }
    this.advance(); // ')'

    // 토큰 생성
    let tokenType: TokenType;
    if (directive === 'lang') {
      tokenType = TokenType.LANG_DIRECTIVE;
    } else if (directive === 'artifact') {
      tokenType = TokenType.LANG_ARTIFACT;
    } else if (directive === 'compile') {
      tokenType = TokenType.LANG_COMPILE_CMD;
    } else {
      tokenType = TokenType.LANG_CGO;
    }

    const value = `@${directive}("${stringValue}")`;
    return this.makeToken(tokenType, value, this.currentMode);
  }

  /**
   * @call 디렉티브 파싱
   * @call python:numpy
   * @call python:numpy 1.24
   * @call rust:rand 0.8
   * @call go:github.com/gin-gonic/gin
   * @call python:numpy as np
   *
   * 토큰 value = "@call python:numpy 1.24" (전체 raw 문자열)
   */
  private tryParseCall(): Token | null {
    const start = this.pos;

    if (this.peek() !== '@') return null;
    this.advance(); // '@'

    // "call" 확인
    const keyword = 'call';
    for (let i = 0; i < keyword.length; i++) {
      if (this.peek() !== keyword[i]) {
        this.pos = start;
        return null;
      }
      this.advance();
    }

    // 공백 확인 (필수)
    if (!this.isWhitespace(this.peek()) || this.peek() === '\n') {
      this.pos = start;
      return null;
    }
    while (this.isWhitespace(this.peek()) && this.peek() !== '\n') {
      this.advance();
    }

    // 나머지 줄 끝까지 읽기 (lang:package [version] [as alias])
    const restStart = this.pos;
    while (this.pos < this.source.length && this.peek() !== '\n') {
      this.advance();
    }
    const rest = this.source.substring(restStart, this.pos).trim();

    const value = `@call ${rest}`;
    return this.makeToken(TokenType.CALL_DIRECTIVE, value, this.currentMode);
  }

  /**
   * @lang(python) / @lang(c) / @lang(rust) 등 언어 블록 지시문 파싱
   * → LANG_DIRECTIVE 토큰으로 반환 (value = "@lang(python)")
   */
  private tryParseLang(): Token | null {
    const start = this.pos;
    if (this.peek() !== '@') return null;
    this.advance(); // '@'

    const keyword = 'lang';
    for (let i = 0; i < keyword.length; i++) {
      if (this.peek() !== keyword[i]) { this.pos = start; return null; }
      this.advance();
    }

    if (this.peek() !== '(') { this.pos = start; return null; }
    this.advance(); // '('

    // 언어 이름 읽기
    const langStart = this.pos;
    while (this.pos < this.source.length && this.peek() !== ')' && this.peek() !== '\n') {
      this.advance();
    }
    const lang = this.source.substring(langStart, this.pos).trim();

    if (this.peek() !== ')') { this.pos = start; return null; }
    this.advance(); // ')'

    const value = `@lang(${lang})`;
    return this.makeToken(TokenType.LANG_DIRECTIVE, value, this.currentMode);
  }

  // ==================== 헬퍼 함수 ====================

  private skipWhitespaceOnLineStart(): void {
    // 라인 시작의 공백 스킵
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t') {
        this.advance();
      } else if (ch === '\n') {
        this.advance();
        this.atLineStart = true;
      } else {
        break;
      }
    }
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length && this.isWhitespace(this.peek())) {
      this.advance();
    }
  }

  private skipLineComment(): void {
    while (this.pos < this.source.length && this.peek() !== '\n') {
      this.advance();
    }
  }

  private peek(offset: number = 0): string | undefined {
    return this.source[this.pos + offset];
  }

  private advance(): void {
    const ch = this.peek();
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    this.pos++;
  }

  private isWhitespace(ch: string | undefined): boolean {
    return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
  }

  private isDigit(ch: string | undefined): boolean {
    return ch !== undefined && ch >= '0' && ch <= '9';
  }

  private isHexDigit(ch: string | undefined): boolean {
    return (
      ch !== undefined &&
      ((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F'))
    );
  }

  private isOctalDigit(ch: string | undefined): boolean {
    return ch !== undefined && ch >= '0' && ch <= '7';
  }

  private isIdentifierStart(ch: string | undefined): boolean {
    if (ch === undefined) return false;

    // 영문: a-z, A-Z, _, $
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$') {
      return true;
    }

    // UTF-8 한글 지원 (U+AC00~U+D7A3 = 가~힣)
    // 각 한글 문자는 2~3 바이트, charCodeAt()으로 검사
    const charCode = ch.charCodeAt(0);
    if (charCode >= 0xAC00 && charCode <= 0xD7A3) {
      return true;
    }

    // UTF-8 한글 자모 범위 (U+1100~U+11FF = ᄀ~ᄿ 초성/중성/종성)
    if (charCode >= 0x1100 && charCode <= 0x11FF) {
      return true;
    }

    return false;
  }

  private isIdentifierChar(ch: string | undefined): boolean {
    return this.isIdentifierStart(ch) || this.isDigit(ch);
  }

  private makeToken(
    type: TokenType,
    value: string,
    mode: 'v' | 'python' | 'auto'
  ): Token {
    return {
      type,
      value,
      line: this.line,
      column: this.column - value.length,
      mode,
      startPos: this.pos - value.length,
      endPos: this.pos,
    };
  }
}

export default NexusLexer;
