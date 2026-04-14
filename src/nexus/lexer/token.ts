/**
 * Token definitions for Nexus Lexer
 * Supports V mode and Python mode
 */

export enum TokenType {
  // Literals
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  IDENTIFIER = 'IDENTIFIER',

  // Keywords (V mode)
  FN = 'FN',
  LET = 'LET',
  RETURN = 'RETURN',
  IF = 'IF',
  ELSE = 'ELSE',
  WHILE = 'WHILE',
  FOR = 'FOR',
  BREAK = 'BREAK',
  CONTINUE = 'CONTINUE',
  MATCH = 'MATCH',
  CASE = 'CASE',
  STRUCT = 'STRUCT',
  TRAIT = 'TRAIT',
  IMPL = 'IMPL',
  MOD = 'MOD',
  USE = 'USE',
  PUB = 'PUB',
  MUT = 'MUT',
  CONST = 'CONST',
  IN = 'IN',
  AS = 'AS',
  UNSAFE = 'UNSAFE',
  ASYNC = 'ASYNC',
  AWAIT = 'AWAIT',

  // Keywords (Python mode)
  DEF = 'DEF',
  CLASS = 'CLASS',
  IMPORT = 'IMPORT',
  FROM = 'FROM',
  TRY = 'TRY',
  EXCEPT = 'EXCEPT',
  FINALLY = 'FINALLY',
  WITH = 'WITH',
  RAISE = 'RAISE',
  ASSERT = 'ASSERT',
  PASS = 'PASS',
  LAMBDA = 'LAMBDA',
  YIELD = 'YIELD',
  GLOBAL = 'GLOBAL',
  NONLOCAL = 'NONLOCAL',
  DEL = 'DEL',

  // Type keywords
  I64 = 'I64',
  I32 = 'I32',
  F64 = 'F64',
  F32 = 'F32',
  U32 = 'U32',
  U64 = 'U64',
  BOOL = 'BOOL',
  STRING_TYPE = 'STRING_TYPE',
  CHAR = 'CHAR',
  VOID = 'VOID',

  // Operators
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  STAR = 'STAR',
  SLASH = 'SLASH',
  PERCENT = 'PERCENT',
  EQUAL = 'EQUAL',
  EQ = 'EQ',
  NE = 'NE',
  LT = 'LT',
  GT = 'GT',
  LE = 'LE',
  GE = 'GE',
  PIPE = 'PIPE',
  AMPERSAND = 'AMPERSAND',
  CARET = 'CARET',
  TILDE = 'TILDE',
  LSHIFT = 'LSHIFT',
  RSHIFT = 'RSHIFT',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',

  // Delimiters
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  COMMA = 'COMMA',
  DOT = 'DOT',
  COLON = 'COLON',
  SEMICOLON = 'SEMICOLON',
  ARROW = 'ARROW',
  DOUBLE_ARROW = 'DOUBLE_ARROW',
  AT = 'AT',

  // Lang directives
  MODE_MARKER = 'MODE_MARKER',
  LANG_DIRECTIVE = 'LANG_DIRECTIVE',
  LANG_ARTIFACT = 'LANG_ARTIFACT',
  LANG_COMPILE_CMD = 'LANG_COMPILE_CMD',
  LANG_CGO = 'LANG_CGO',
  LANG_SHARED_MEM = 'LANG_SHARED_MEM',
  LANG_DEPENDS_ON = 'LANG_DEPENDS_ON',
  CALL_DIRECTIVE = 'CALL_DIRECTIVE',

  // Whitespace
  INDENT = 'INDENT',
  DEDENT = 'DEDENT',
  NEWLINE = 'NEWLINE',

  // Special
  EOF = 'EOF',
  COMMENT = 'COMMENT',
  KEYWORD = 'KEYWORD',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  startPos?: number;
  endPos?: number;
  mode?: 'v' | 'python' | 'auto';
}

export const V_KEYWORDS = new Set([
  'fn', 'let', 'mut', 'const', 'if', 'else', 'for', 'while', 'break', 'continue',
  'return', 'struct', 'enum', 'trait', 'impl', 'pub', 'pub(crate)', 'use', 'mod',
  'true', 'false', 'null', 'match', 'in', 'as', 'is', 'type', 'where', 'async',
  'await', 'unsafe', 'loop', 'move', 'dyn', 'static', 'self', 'Self', 'super',
]);

export const PYTHON_KEYWORDS = new Set([
  'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue',
  'return', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'raise',
  'assert', 'pass', 'lambda', 'yield', 'global', 'nonlocal', 'True', 'False', 'None',
  'and', 'or', 'not', 'in', 'is', 'async', 'await', 'del',
]);

export function getKeywordToken(word: string, mode: 'v' | 'python' | 'auto'): TokenType | null {
  if (mode === 'auto') {
    // In auto mode, check both V and Python keywords
    if (V_KEYWORDS.has(word) || PYTHON_KEYWORDS.has(word)) {
      return TokenType.KEYWORD;
    }
    return null;
  }
  const keywords = mode === 'v' ? V_KEYWORDS : PYTHON_KEYWORDS;
  return keywords.has(word) ? TokenType.KEYWORD : null;
}

export function detectMode(source: string): 'v' | 'python' {
  // Simple heuristic: check for Python-specific patterns
  if (/def\s+\w+|class\s+\w+|:\s*\n\s+/.test(source)) {
    return 'python';
  }
  return 'v';
}
