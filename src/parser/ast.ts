/**
 * FreeLang Nexus - AST 노드 정의
 * V 모드 함수와 Python 모드 함수 통합 AST
 */

/**
 * 모든 AST 노드의 기본 인터페이스
 */
export interface ASTNode {
  type: string;
  line: number;
  column: number;
  mode: 'v' | 'python' | 'auto';
}

/**
 * 파라미터 정의
 */
export interface Parameter {
  name: string;
  typeAnnotation?: string; // i64, string 등 (선택)
  line: number;
  column: number;
}

/**
 * V 모드 함수
 * 예: fn add(x: i64, y: i64) -> i64 { return x + y }
 */
export interface VFunction extends ASTNode {
  type: 'VFunction';
  name: string;
  params: Parameter[];
  returnType?: string; // -> 타입
  body: Statement[];
  mode: 'v';
}

/**
 * Python 모드 함수
 * 예: def add(a, b): return a + b
 */
export interface PyFunction extends ASTNode {
  type: 'PyFunction';
  name: string;
  params: Parameter[];
  returnType?: string; // -> 타입 (선택)
  body: Statement[];
  mode: 'python';
}

/**
 * Return 문장
 */
export interface ReturnStatement extends ASTNode {
  type: 'Return';
  value?: Expression;
}

/**
 * 할당 문장
 */
export interface AssignStatement extends ASTNode {
  type: 'Assign';
  name: string;
  typeAnnotation?: string; // let x: i64[] = ... 형식 타입 힌트
  value: Expression;
}

/**
 * 표현식 문장
 */
export interface ExprStatement extends ASTNode {
  type: 'ExprStatement';
  expression: Expression;
}

/**
 * If 문장
 */
export interface IfStatement extends ASTNode {
  type: 'IfStatement';
  condition: Expression;
  thenBranch: Statement[];
  elseBranch?: Statement[];
}

/**
 * While 루프
 */
export interface WhileStatement extends ASTNode {
  type: 'WhileStatement';
  condition: Expression;
  body: Statement[];
}

/**
 * Break 문장
 */
export interface BreakStatement extends ASTNode {
  type: 'Break';
}

/**
 * Continue 문장
 */
export interface ContinueStatement extends ASTNode {
  type: 'Continue';
}

/**
 * For-In 루프
 * for i in range(10) { body }
 * for item in arr { body }
 */
export interface ForStatement extends ASTNode {
  type: 'ForStatement';
  variable: string;     // 루프 변수명
  iterable: Expression; // range(10) CallExpr 또는 arr Identifier
  body: Statement[];
}

/**
 * match/case 패턴 매칭 arm
 * case 1 => { ... }  또는  case _ => { ... }
 */
export interface MatchArm {
  pattern: Expression | null;  // null = wildcard (_)
  body: Statement[];
  line: number;
  column: number;
}

/**
 * match 문장
 * match x { case 1 => { ... } case _ => { ... } }
 */
export interface MatchStatement extends ASTNode {
  type: 'MatchStatement';
  subject: Expression;
  arms: MatchArm[];
}

/**
 * 문장 타입
 */
export type Statement = ReturnStatement | AssignStatement | ExprStatement | IfStatement | WhileStatement | ForStatement | BreakStatement | ContinueStatement | MatchStatement;

/**
 * 숫자 리터럴
 */
export interface NumberLiteral extends ASTNode {
  type: 'Number';
  value: number | string; // 16진수, 이진수 표현 가능
}

/**
 * 문자열 리터럴
 */
export interface StringLiteral extends ASTNode {
  type: 'String';
  value: string;
}

/**
 * 식별자 (변수명, 함수명 등)
 */
export interface Identifier extends ASTNode {
  type: 'Identifier';
  name: string;
}

/**
 * 이항 연산식
 * 예: x + y, a * b
 */
export interface BinaryExpr extends ASTNode {
  type: 'BinaryExpr';
  left: Expression;
  operator: string; // +, -, *, /, &&, ||, ==, !=, <, >, <=, >=
  right: Expression;
}

/**
 * 함수 호출 표현식
 * 예: foo(), Module::func()
 */
export interface CallExpr extends ASTNode {
  type: 'Call';
  callee: Expression | string; // Identifier 또는 Module::func 형식 문자열
  args: Expression[];
}

/**
 * 배열 리터럴
 * 예: [1, 2, 3], []
 */
export interface ArrayLiteral extends ASTNode {
  type: 'Array';
  elements: Expression[];
}

/**
 * 배열 접근
 * 예: arr[0], items[i]
 */
export interface ArrayAccess extends ASTNode {
  type: 'ArrayAccess';
  object: Expression;
  index: Expression;
}

/**
 * 멤버 접근
 * 예: arr.length, obj.property
 */
export interface MemberAccess extends ASTNode {
  type: 'MemberAccess';
  object: Expression;
  property: string;
}

/**
 * 구조체 필드 정의
 */
export interface StructField {
  name: string;
  typeAnnotation: string;
  line: number;
  column: number;
}

/**
 * 구조체 정의
 * 예: struct Person { name: string, age: i64 }
 */
export interface StructDef extends ASTNode {
  type: 'StructDef';
  name: string;
  fields: StructField[];
  mode: 'v';
}

/**
 * 구조체 리터럴
 * 예: Person { name: "Alice", age: 30 }
 */
export interface StructLiteral extends ASTNode {
  type: 'StructLiteral';
  name: string;
  fields: { [key: string]: Expression };
}

/**
 * 표현식 타입
 */
export type Expression = NumberLiteral | StringLiteral | Identifier | BinaryExpr | CallExpr | ArrayLiteral | ArrayAccess | MemberAccess | StructLiteral;

/**
 * @call 지시문 - 외부 언어 라이브러리 호출 (버스 터미널)
 * @call python:numpy 1.24
 * @call rust:rand 0.8
 * @call go:github.com/gin-gonic/gin
 */
export interface ExternCall extends ASTNode {
  type: 'ExternCall';
  lang: 'python' | 'rust' | 'go' | 'julia' | 'js' | 'c' | 'cpp' | 'ruby' | 'node' | 'zig' | 'mojo' | 'v';
  package: string;   // 패키지명 (numpy, rand, github.com/... 등)
  version?: string;  // 선택적 버전 (1.24, 0.8 등)
  alias?: string;    // as alias (선택)
}

/**
 * 다중언어 코드 블록
 * @lang("rust")
 * @artifact("librustcore.so")
 * @compile("rustc --crate-type cdylib ...")
 * ---
 * 실제 소스 코드
 * ---
 */
export interface LangBlock extends ASTNode {
  type: 'LangBlock';
  lang: string;          // "rust", "zig", "julia", "go", "c", "cpp", "python"
  artifact?: string;     // 생성될 아티팩트 파일명 (예: librustcore.so)
  compileCmd?: string;   // 컴파일 명령어 (예: rustc --crate-type cdylib ...)
  sourceCode: string;    // --- ... --- 사이의 실제 원본 소스 코드
  cgo?: boolean;         // @cgo 지시문 여부 (Go cgo 직접 호출)
  dependsOn?: string[];  // @depends_on 의존성 리스트
}

/**
 * 공유 메모리 디렉티브
 * @shared_mem("result_buf", size=64, type="i64")
 * POSIX shm_open() + mmap()으로 명명된 공유 메모리 생성
 */
export interface SharedMemDirective extends ASTNode {
  type: 'SharedMemDirective';
  name: string;      // shm 이름 (예: "result_buf")
  size: number;      // 원소 수 (예: 64)
  dataType: string;  // 데이터 타입 (예: "i64", "f64")
}

/**
 * 프로그램 (최상위 노드)
 */
export interface Program {
  type: 'Program';
  body: Array<VFunction | PyFunction | StructDef | Statement | ExternCall | LangBlock | SharedMemDirective>;
}
