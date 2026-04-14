/**
 * FreeLang Nexus - 코드 생성기
 * AST → C 코드 (V 모드) + Python 코드 (Python 모드)
 */

import * as AST from '../parser/ast';

export interface CodegenResult {
  c: string;          // V 모드 함수들 → C 코드
  python: string;     // Python 모드 함수들 → Python 코드
  mixed: string;      // 두 코드 주석으로 구분 (디버그용)
  linkFlags: string[]; // gcc 링크 플래그 (@call 에서 수집) e.g. ['-lsqlite3', '-lm']
  externLibs: ExternLibInfo[]; // @call 지시문 요약
}

/** @call 지시문 또는 @lang 블록 하나의 요약 정보 */
export interface ExternLibInfo {
  lang: string;
  package: string;
  version?: string;
  alias?: string;
  linkFlags: string[];  // 이 언어/패키지에 필요한 링크 플래그
  buildCmd?: string;    // 사전 빌드 명령 (Rust/Go/LangBlock 전용)
  artifact?: string;    // 생성될 아티팩트 파일명 (LangBlock 전용, 예: librust.so)
  sourceCode?: string;  // @lang 블록의 원본 소스 코드 (workDir에 저장할 내용)
  artifactName?: string; // 소스 파일명 (예: rust_core.rs, zig_bridge.zig)
  dependsOn?: string[]; // @depends_on 의존 artifact 이름들
  cgo?: boolean;        // @cgo 플래그 (Go cgo 직접 호출)
}

// C 예약어 / 런타임 충돌 방지 목록
const C_RESERVED = new Set([
  'auto','break','case','char','const','continue','default','do','double',
  'else','enum','extern','float','for','goto','if','inline','int','long',
  'register','restrict','return','short','signed','sizeof','static','struct',
  'switch','typedef','union','unsigned','void','volatile','while',
  // 런타임 헬퍼 이름과도 충돌 방지
  'printf','malloc','free','exit','strlen','strcmp','strdup',
]);

export class NexusCodegen {
  private cLines: string[] = [];
  private pyLines: string[] = [];
  private indentLevel: number = 0;
  private linkFlagsSet: Set<string> = new Set();
  private externLibs: ExternLibInfo[] = [];
  // 선언된 변수 추적 (스코프 스택) - 중복 선언 방지
  private declaredVars: Set<string>[] = [new Set()];
  // 변수명 → 타입 ('string'|'i64'|'f64'|'bool' 등)
  private varTypeMap: Map<string, string> = new Map();
  // Python alias 맵: alias → { package, cVar }
  // @call python:numpy as np → { 'np': { pkg: 'numpy', cVar: '__fl_py_mod_np' } }
  private pyAliasMap: Map<string, { pkg: string; cVar: string }> = new Map();
  // Python 마샬링 헬퍼 주입 여부
  private pyHelpersInjected: boolean = false;
  // subprocess bridge 헬퍼 주입 여부 (ruby/node/zig 공유)
  private subprocessHelpersInjected: boolean = false;

  /**
   * V 모드 내장 함수 처리
   */
  private readonly V_BUILTINS = new Set([
    'println', 'print', 'len', 'to_string', 'int_cast',
    // 수학
    'abs', 'min', 'max', 'sqrt', 'pow', 'floor', 'ceil',
    // 문자열
    'str_len', 'str_contains', 'str_concat', 'str_eq',
    'trim', 'split', 'lines', 'str_replace', 'char_at',
    'str_slice', 'starts_with', 'ends_with', 'str_concat3',
    'format', 'int_to_str', 'float_to_str',
    // 파일 I/O
    'read_file', 'write_file', 'append_file',
    // 타입 변환
    'float_cast', 'bool_cast',
    // 배열
    'push', 'array_len', 'array_get', 'int_array_new', 'str_array_new',
    // 시스템 명령
    'system',
  ]);

  /**
   * 프로그램 전체 코드 생성
   */
  generate(program: AST.Program): CodegenResult {
    // 1-pass: Python 모드 사용 여부 선판단
    const hasPythonMode = program.body.some((item: any) =>
      item.type === 'PyFunction' ||
      (item.type === 'ExternCall' && item.lang === 'python')
    );

    // 2-pass: 코드 생성
    for (const item of program.body) {
      const fnItem = item as any;
      if (fnItem.type === 'ExternCall') {
        this.genExternCall(fnItem as AST.ExternCall);
      } else if (fnItem.type === 'SharedMemDirective') {
        this.genSharedMem(fnItem as AST.SharedMemDirective);
      } else if (fnItem.type === 'LangBlock') {
        this.genLangBlock(fnItem as AST.LangBlock);
      } else if (fnItem.type === 'VFunction') {
        this.genVFunction(fnItem as AST.VFunction);
      } else if (fnItem.type === 'PyFunction') {
        this.genPyFunction(fnItem as AST.PyFunction);
      } else if (fnItem.type === 'StructDef') {
        this.genVStructDef(fnItem as AST.StructDef);
        // struct 정의는 항상 Python class도 함께 생성
        this.genPyStructDef(fnItem as AST.StructDef);
      } else if (fnItem.type === 'Return' || fnItem.type === 'Assign' || fnItem.type === 'ExprStatement' || fnItem.type === 'MatchStatement') {
        // 탑레벨 문장: Python 모드면 pyLines, V 모드(C)면 cLines
        if ((fnItem as any).mode === 'python') {
          this.genPyStatement(fnItem as AST.Statement);
        } else {
          this.genVStatement(fnItem as AST.Statement);
        }
      }
    }

    const c = this.cLines.join('\n');
    const python = this.pyLines.join('\n');

    // mixed: 두 언어 코드를 주석으로 구분해서 출력 (확인용)
    const mixed =
      c && python
        ? `/* ===== V (C) ===== */\n${c}\n\n/* ===== Python ===== */\n# (Not valid C, just for reference)\n${python}`
        : c || python;

    return {
      c,
      python,
      mixed,
      linkFlags: Array.from(this.linkFlagsSet),
      externLibs: this.externLibs,
    };
  }

  /**
   * 실행 가능한 프로그램 생성
   * C에는 #include + main() 추가, Python에는 if __name__ 추가
   */
  generateProgram(program: AST.Program): CodegenResult {
    const base = this.generate(program);

    // fn main()이 이미 있으면 int main() 추가하지 않음
    const hasMain = program.body.some(
      (n: any) => n.type === 'VFunction' && n.name === 'main'
    );

    // Python 모듈 자동 초기화 코드 삽입 (fn main 앞에 __attribute__((constructor)) 사용)
    const pyInits = Array.from(this.pyAliasMap.keys())
      .map(alias => `    __fl_py_init_${alias}();`)
      .join('\n');
    const pyFinalize = this.pyAliasMap.size > 0 ? '\n    Py_Finalize();' : '';

    // main 래퍼: fn main()이 없을 때만 기본 main 추가
    // fn main()이 있으면, Python init을 __attribute__((constructor))로 main 전에 실행
    let mainWrapper = '';
    if (!hasMain) {
      // fn main()이 없으면, 매개변수 없는 VFunction만 순서대로 호출
      const allFunctions = program.body.filter((n: any) => n.type === 'VFunction');
      const functionCalls = allFunctions
        .filter((fn: any) => !fn.params || fn.params.length === 0) // 매개변수 없는 함수만
        .map((fn: any) => `    ${fn.name}();`)
        .join('\n');
      const pyInitBlock = pyInits ? `\n${pyInits}` : '';
      mainWrapper = `\nint main() {${pyInitBlock}${functionCalls ? '\n' + functionCalls : ''}${pyFinalize}\n    return 0;\n}\n`;
    } else if (pyInits) {
      // fn main()이 있는 경우 constructor attribute로 자동 초기화
      const initFn = Array.from(this.pyAliasMap.keys())
        .map(alias => `__fl_py_init_${alias}();`)
        .join(' ');
      mainWrapper = `\n__attribute__((constructor))\nstatic void __fl_py_auto_init(void) { ${initFn} }\n` +
        `__attribute__((destructor))\nstatic void __fl_py_auto_fini(void) { Py_Finalize(); }\n`;
    }

    const flHelpers = `
/* ── FreeLang 런타임 헬퍼 ── */
#include <stdio.h>
#include <stdbool.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include <ctype.h>

/* 동적 문자열 배열 */
typedef struct { char **data; int len; int cap; } StrArray;
static StrArray fl_str_array_new() { StrArray a; a.data=(char**)malloc(8*sizeof(char*)); a.len=0; a.cap=8; return a; }
static void fl_str_array_push(StrArray *a, const char *s) {
  if(a->len>=a->cap){a->cap*=2;a->data=(char**)realloc(a->data,a->cap*sizeof(char*));}
  a->data[a->len++]=strdup(s);
}
static char* fl_str_array_get(StrArray *a, long long i) {
  if(i<0||i>=a->len){fprintf(stderr,"[FreeLang] array_get: index %lld out of bounds (len=%d)\\n",i,a->len);exit(1);}
  return a->data[i];
}

/* read_file(path) → 파일 전체 문자열 */
static char* fl_read_file(const char *path) {
  FILE *f=fopen(path,"r"); if(!f){return strdup("");}
  fseek(f,0,SEEK_END); long sz=ftell(f); fseek(f,0,SEEK_SET);
  char *buf=(char*)malloc(sz+1); fread(buf,1,sz,f); buf[sz]=0; fclose(f); return buf;
}

/* write_file(path, content) */
static void fl_write_file(const char *path, const char *content) {
  FILE *f=fopen(path,"w"); if(!f)return; fputs(content,f); fclose(f);
}

/* append_file(path, content) */
static void fl_append_file(const char *path, const char *content) {
  FILE *f=fopen(path,"a"); if(!f)return; fputs(content,f); fclose(f);
}

/* split(s, delim) → StrArray */
static StrArray fl_split(const char *s, const char *delim) {
  StrArray a=fl_str_array_new();
  char *tmp=strdup(s); char *tok=strtok(tmp,delim);
  while(tok){fl_str_array_push(&a,tok);tok=strtok(NULL,delim);}
  free(tmp); return a;
}

/* trim(s) → 앞뒤 공백 제거 */
static char* fl_trim(const char *s) {
  while(isspace((unsigned char)*s))s++;
  if(*s==0)return strdup("");
  const char *e=s+strlen(s)-1;
  while(e>s&&isspace((unsigned char)*e))e--;
  int len=e-s+1; char *r=(char*)malloc(len+1); memcpy(r,s,len); r[len]=0; return r;
}

/* str_split_lines(s) → StrArray (줄 단위) */
static StrArray fl_lines(const char *s) { return fl_split(s,"\\n"); }

/* str_replace(s, from, to) */
static char* fl_str_replace(const char *s, const char *from, const char *to) {
  int flen=strlen(from),tlen=strlen(to),slen=strlen(s);
  char *buf=(char*)malloc(slen*4+1); int bi=0;
  for(int i=0;i<slen;){
    if(strncmp(s+i,from,flen)==0){memcpy(buf+bi,to,tlen);bi+=tlen;i+=flen;}
    else{buf[bi++]=s[i++];}
  } buf[bi]=0; return buf;
}

/* char_at(s, i) → 단일 문자 문자열 */
static char* fl_char_at(const char *s, int i) {
  char *r=(char*)malloc(2); r[0]=s[i]; r[1]=0; return r;
}

/* str_slice(s, start, end) */
static char* fl_str_slice(const char *s, int start, int end) {
  int len=end-start; if(len<=0)return strdup("");
  char *r=(char*)malloc(len+1); memcpy(r,s+start,len); r[len]=0; return r;
}

/* int_to_str(n) */
static char* fl_int_to_str(long long n) {
  char *buf=(char*)malloc(32); snprintf(buf,32,"%lld",n); return buf;
}

/* float_to_str(f, decimals) */
static char* fl_float_to_str(double f, int d) {
  char fmt[16]; snprintf(fmt,16,"%%.%df",d);
  char *buf=(char*)malloc(64); snprintf(buf,64,fmt,f); return buf;
}

/* str_starts_with / str_ends_with */
static int fl_starts_with(const char *s, const char *prefix) { return strncmp(s,prefix,strlen(prefix))==0; }
static int fl_ends_with(const char *s, const char *suffix) {
  int sl=strlen(s),pl=strlen(suffix); if(pl>sl)return 0;
  return strcmp(s+sl-pl,suffix)==0;
}

/* format(template, arg) - 단순 %s/%d 치환 */
static char* fl_format(const char *fmt, ...) {
  char *buf=(char*)malloc(4096);
  va_list ap; va_start(ap,fmt); vsnprintf(buf,4096,fmt,ap); va_end(ap); return buf;
}

/* 동적 int 배열 */
typedef struct { long long *data; int len; int cap; } IntArray;
static IntArray fl_int_array_new() { IntArray a; a.data=(long long*)malloc(8*sizeof(long long)); a.len=0; a.cap=8; return a; }
static void fl_int_array_push(IntArray *a, long long v) {
  if(a->len>=a->cap){a->cap*=2;a->data=(long long*)realloc(a->data,a->cap*sizeof(long long));}
  a->data[a->len++]=v;
}
static long long fl_int_array_get(IntArray *a, long long i) {
  if(i<0||i>=a->len){fprintf(stderr,"[FreeLang] array_get: index %lld out of bounds (len=%d)\\n",i,a->len);exit(1);}
  return a->data[i];
}
static long long fl_int_array_pop(IntArray *a) {
  if(a->len<=0){fprintf(stderr,"[FreeLang] array_pop: array is empty\\n");exit(1);}
  return a->data[--a->len];
}
static IntArray fl_int_array_slice(IntArray *a, int start, int end) {
  IntArray r=fl_int_array_new();
  if(start<0)start=0; if(end>a->len)end=a->len;
  for(int i=start;i<end;i++) fl_int_array_push(&r,a->data[i]);
  return r;
}

/* 동적 str 배열 pop/slice */
static char* fl_str_array_pop(StrArray *a) {
  if(a->len<=0){fprintf(stderr,"[FreeLang] array_pop: array is empty\\n");exit(1);}
  return a->data[--a->len];
}
static StrArray fl_str_array_slice(StrArray *a, int start, int end) {
  StrArray r=fl_str_array_new();
  if(start<0)start=0; if(end>a->len)end=a->len;
  for(int i=start;i<end;i++) fl_str_array_push(&r,a->data[i]);
  return r;
}

/* println 문자열 버전 */
static void fl_println_str(const char *s) { printf("%s\\n",s); }
static void fl_print_str(const char *s) { printf("%s",s); }
/* ── 끝 ── */
`;

    const cWithMain = base.c
      ? `#include <stdarg.h>\n${flHelpers}\n${base.c}${mainWrapper}`
      : '';

    // Python 코드에 main 블록 추가
    const pyWithMain = base.python
      ? `${base.python}\n\nif __name__ == '__main__':\n    pass\n`
      : '';

    return {
      c: cWithMain,
      python: pyWithMain,
      mixed: base.mixed,
      linkFlags: base.linkFlags,
      externLibs: base.externLibs,
    };
  }

  /**
   * V 함수 → C 함수
   * fn add(x: i64, y: i64) -> i64 { return x + y }
   * →
   * long long add(long long x, long long y) { return x + y; }
   */
  private genVFunction(fn: AST.VFunction): void {
    // extern 선언 (body 없는 fn) → C extern 선언만 생성
    if ((fn as any).isExternDecl) {
      const retType = this.mapVType(fn.returnType || 'void');
      const paramList = fn.params.map((p) => `${this.mapVType(p.typeAnnotation || 'void')} ${p.name}`).join(', ');
      this.writeC(`extern ${retType} ${fn.name}(${paramList || 'void'});`);
      return;
    }

    // 반환타입 (main 함수는 항상 int)
    const safeName = fn.name === 'main' ? 'main' : this.safeFnName(fn.name);
    const returnType = fn.name === 'main' ? 'int' : this.mapVType(fn.returnType || 'void');

    // 파라미터 리스트
    const paramList = fn.params.map((p) => `${this.mapVType(p.typeAnnotation || 'void')} ${p.name}`).join(', ');

    // 함수 시그니처
    this.writeC(`${returnType} ${safeName}(${paramList}) {`);

    // 함수 본문 (새 스코프: 파라미터 변수 등록)
    this.indentLevel++;
    this.declaredVars.push(new Set(fn.params.map(p => p.name)));
    for (const stmt of fn.body) {
      this.genVStatement(stmt);
    }
    this.declaredVars.pop();
    this.indentLevel--;

    this.writeC('}');
    this.writeC(''); // 빈 줄
  }

  /**
   * Python 함수 → Python 함수
   * def slow(items): return items
   * →
   * def slow(items):
   *     return items
   */
  private genPyFunction(fn: AST.PyFunction): void {
    // 파라미터 리스트
    const paramList = fn.params.map((p) => p.name).join(', ');

    // 함수 정의
    this.writePy(`def ${fn.name}(${paramList}):`);

    // 함수 본문 (들여쓰기 필요)
    this.indentLevel++;
    for (const stmt of fn.body) {
      this.genPyStatement(stmt);
    }
    this.indentLevel--;

    this.writePy(''); // 빈 줄
  }

  /**
   * @call 지시문 → 언어별 FFI/stub 코드 생성 (버스 터미널)
   *
   * python:pkg  → Python C API embed stub
   * rust:pkg    → Rust cbindgen extern 선언
   * go:pkg      → CGo extern 선언
   * julia:pkg   → Julia C API stub
   * js:pkg      → QuickJS / Node N-API stub
   * c:lib       → #include + extern 선언
   * cpp:lib     → extern "C" { } 래퍼
   */
  /**
   * 알려진 C 라이브러리 → 링크 플래그 맵
   * 추가가 필요하면 여기에만 넣으면 됨
   */
  private static readonly C_LINK_FLAGS: Record<string, string[]> = {
    // 수학
    'm':        ['-lm'],
    'math':     ['-lm'],
    // DB
    'sqlite3':  ['-lsqlite3'],
    // 네트워크
    'curl':     ['-lcurl'],
    'ssl':      ['-lssl', '-lcrypto'],
    'openssl':  ['-lssl', '-lcrypto'],
    // 압축
    'zlib':     ['-lz'],
    'z':        ['-lz'],
    // 스레드
    'pthread':  ['-lpthread'],
    // 정규식
    'pcre':     ['-lpcre'],
    'pcre2':    ['-lpcre2-8'],
    // UI
    'ncurses':  ['-lncurses'],
    // JSON
    'jansson':  ['-ljansson'],
    'cjson':    ['-lcjson'],
    // 기타
    'readline': ['-lreadline'],
    'dl':       ['-ldl'],
    'rt':       ['-lrt'],
  };

  // C 표준 헤더 목록 (링크 플래그 불필요)
  private static readonly C_STDLIB_HEADERS = new Set([
    'stdio', 'stdlib', 'string', 'stddef', 'stdint', 'stdbool',
    'stdarg', 'limits', 'float', 'errno', 'signal', 'assert',
    'ctype', 'wchar', 'locale', 'setjmp', 'inttypes', 'math',
    'time', 'iso646', 'tgmath', 'complex', 'fenv',
  ]);

  private genExternCall(node: AST.ExternCall): void {
    const alias = node.alias || this.safeAlias(node.package);
    const ver = node.version ? ` v${node.version}` : '';

    // 링크 플래그 수집
    const flags = this.collectLinkFlags(node);
    const libInfo: ExternLibInfo = {
      lang: node.lang,
      package: node.package,
      version: node.version,
      alias: node.alias,
      linkFlags: flags,
    };
    flags.forEach(f => this.linkFlagsSet.add(f));
    this.externLibs.push(libInfo);

    this.writeC(`/* ── @call ${node.lang}:${node.package}${ver} ── */`);

    switch (node.lang) {
      case 'python': {
        const cVar = `__fl_py_mod_${alias}`;
        // alias 등록: np → { pkg: 'numpy', cVar: '__fl_py_mod_np' }
        this.pyAliasMap.set(alias, { pkg: node.package, cVar });

        // 마샬링 헬퍼는 첫 번째 python @call 에서만 주입
        if (!this.pyHelpersInjected) {
          this.pyHelpersInjected = true;
          this.writeC(`/* ── FreeLang Python Bridge ── */`);
          this.writeC(`#include <Python.h>`);
          this.writeC(`/* --- 마샬링 헬퍼 --- */`);
          this.writeC(`static long long __fl_py_to_ll(PyObject* o) {`);
          this.writeC(`    if (!o) return 0;`);
          this.writeC(`    long long v;`);
          this.writeC(`    if (PyLong_Check(o)) {`);
          this.writeC(`        v = PyLong_AsLongLong(o);`);
          this.writeC(`    } else {`);
          this.writeC(`        PyObject* asLong = PyNumber_Long(o);`);
          this.writeC(`        v = asLong ? PyLong_AsLongLong(asLong) : 0;`);
          this.writeC(`        Py_XDECREF(asLong);`);
          this.writeC(`    }`);
          this.writeC(`    Py_DECREF(o); return v;`);
          this.writeC(`}`);
          this.writeC(`static double __fl_py_to_dbl(PyObject* o) {`);
          this.writeC(`    if (!o) return 0.0;`);
          this.writeC(`    double v = PyFloat_AsDouble(o);`);
          this.writeC(`    Py_DECREF(o); return v;`);
          this.writeC(`}`);
          this.writeC(`static const char* __fl_py_to_str(PyObject* o) {`);
          this.writeC(`    if (!o) return "";`);
          this.writeC(`    const char* v = PyUnicode_AsUTF8(o);`);
          this.writeC(`    Py_DECREF(o); return v ? v : "";`);
          this.writeC(`}`);
          this.writeC(`static void __fl_py_ensure_init(void) {`);
          this.writeC(`    if (!Py_IsInitialized()) { Py_Initialize(); }`);
          this.writeC(`}`);
          this.writeC('');
        }

        // 모듈 로더
        this.writeC(`/* @call python:${node.package} as ${alias} */`);
        this.writeC(`/* Install: pip install ${node.package}${node.version ? `==${node.version}` : ''} */`);
        this.writeC(`static PyObject* ${cVar} = NULL;`);
        this.writeC(`static void __fl_py_init_${alias}(void) {`);
        this.writeC(`    __fl_py_ensure_init();`);
        this.writeC(`    ${cVar} = PyImport_ImportModule("${node.package}");`);
        this.writeC(`    if (!${cVar}) { PyErr_Print(); fprintf(stderr, "Failed: ${node.package}\\n"); }`);
        this.writeC(`}`);
        this.writeC('');

        // Python 쪽에는 일반 import
        this.writePy(`import ${node.package}${node.alias ? ` as ${node.alias}` : ''}`);
        break;
      }

      case 'rust': {
        // Rust cbindgen: cargo build → libXXX.a → extern C
        this.writeC(`/* Rust FFI: extern crate ${node.package} */`);
        this.writeC(`/* Install: cargo add ${node.package}${node.version ? `@${node.version}` : ''} */`);
        this.writeC(`/* Build:   cargo build --release && cbindgen --output ${alias}_bindings.h */`);
        this.writeC(`/* Link:    gcc ... -L./target/release -l${alias} */`);
        this.writeC(`/* --- Rust FFI stub BEGIN --- */`);
        this.writeC(`#ifdef __has_include`);
        this.writeC(`#  if __has_include("${alias}_bindings.h")`);
        this.writeC(`#    include "${alias}_bindings.h"`);
        this.writeC(`#  endif`);
        this.writeC(`#endif`);
        this.writeC(`/* extern declarations from ${node.package} go here after cbindgen */`);
        this.writeC(`/* --- Rust FFI stub END --- */`);
        this.writeC('');
        break;
      }

      case 'go': {
        // Go cgo: build shared lib → extern
        const libName = alias.replace(/[^a-zA-Z0-9_]/g, '_');
        this.writeC(`/* Go FFI: ${node.package} */`);
        this.writeC(`/* Build:  go build -buildmode=c-shared -o lib${libName}.so . */`);
        this.writeC(`/* Link:   gcc ... -L. -l${libName} */`);
        this.writeC(`/* --- Go FFI stub BEGIN --- */`);
        this.writeC(`#ifdef __has_include`);
        this.writeC(`#  if __has_include("lib${libName}.h")`);
        this.writeC(`#    include "lib${libName}.h"`);
        this.writeC(`#  endif`);
        this.writeC(`#endif`);
        this.writeC(`/* --- Go FFI stub END --- */`);
        this.writeC('');
        break;
      }

      case 'julia': {
        // Julia C API embed
        this.writeC(`/* Julia C API: ${node.package} */`);
        this.writeC(`/* Install: julia -e 'using Pkg; Pkg.add("${node.package}")'`);
        this.writeC(`   Link:    $(julia-config --ldflags --ldlibs) */`);
        this.writeC(`/* --- Julia FFI stub BEGIN --- */`);
        this.writeC(`#include <julia.h>`);
        this.writeC(`static void __fl_jl_init_${alias}(void) {`);
        this.writeC(`    jl_init();`);
        this.writeC(`    jl_eval_string("using ${node.package}");`);
        this.writeC(`}`);
        this.writeC(`/* --- Julia FFI stub END --- */`);
        this.writeC('');
        break;
      }

      case 'js': {
        // QuickJS embed stub
        this.writeC(`/* JS (QuickJS) embed: ${node.package} */`);
        this.writeC(`/* Build: amalgamation compile with quickjs.c */`);
        this.writeC(`/* --- JS FFI stub BEGIN --- */`);
        this.writeC(`#ifdef __has_include`);
        this.writeC(`#  if __has_include("quickjs.h")`);
        this.writeC(`#    include "quickjs.h"`);
        this.writeC(`static JSRuntime* __fl_js_rt = NULL;`);
        this.writeC(`static JSContext* __fl_js_ctx_${alias} = NULL;`);
        this.writeC(`static void __fl_js_init_${alias}(void) {`);
        this.writeC(`    if (!__fl_js_rt) __fl_js_rt = JS_NewRuntime();`);
        this.writeC(`    __fl_js_ctx_${alias} = JS_NewContext(__fl_js_rt);`);
        this.writeC(`}`);
        this.writeC(`#  endif`);
        this.writeC(`#endif`);
        this.writeC(`/* --- JS FFI stub END --- */`);
        this.writeC('');
        break;
      }

      case 'c': {
        // 알려진 헤더 맵: 패키지명 → 실제 헤더파일명
        const C_HEADERS: Record<string, string | null> = {
          'm':        null,          // math.h는 이미 기본 include에 있음
          'math':     null,          // 동일
          'sqlite3':  'sqlite3.h',
          'curl':     'curl/curl.h',
          'ssl':      'openssl/ssl.h',
          'openssl':  'openssl/ssl.h',
          'zlib':     'zlib.h',
          'z':        'zlib.h',
          'pthread':  'pthread.h',
          'pcre':     'pcre.h',
          'pcre2':    'pcre2.h',
          'ncurses':  'ncurses.h',
          'jansson':  'jansson.h',
          'cjson':    'cJSON.h',
          'readline': 'readline/readline.h',
          'dl':       'dlfcn.h',
          'rt':       'time.h',
        };
        const header = node.package in C_HEADERS
          ? C_HEADERS[node.package]
          : `${node.package}.h`;  // 모르는 라이브러리: 추측

        this.writeC(`/* @call c:${node.package} */`);
        if (header) {
          this.writeC(`#include <${header}>`);
        } else {
          this.writeC(`/* math.h already included in standard headers */`);
        }
        this.writeC('');
        break;
      }

      case 'cpp': {
        // C++ → extern "C" 래퍼
        this.writeC(`/* C++ library: ${node.package} */`);
        this.writeC(`#ifdef __cplusplus`);
        this.writeC(`#include <${node.package}>`);
        this.writeC(`extern "C" {`);
        this.writeC(`/* C++ bindings for ${node.package} */`);
        this.writeC(`}`);
        this.writeC(`#endif`);
        this.writeC('');
        break;
      }

      case 'ruby': {
        // Ruby subprocess bridge: popen("ruby script.rb")
        this.writeC(`/* @call ruby:${node.package} - subprocess mode */`);
        this.writeC(`/* Install: gem install ${node.package} */`);
        if (!this.subprocessHelpersInjected) {
          this.subprocessHelpersInjected = true;
          this.writeC(`/* --- subprocess bridge helper --- */`);
          this.writeC(`#include <stdio.h>`);
          this.writeC(`static char __fl_subprocess_buf[65536];`);
          this.writeC(`static const char* __fl_run_subprocess(const char* cmd) {`);
          this.writeC(`    FILE* fp = popen(cmd, "r");`);
          this.writeC(`    if (!fp) return "";`);
          this.writeC(`    size_t n = fread(__fl_subprocess_buf, 1, sizeof(__fl_subprocess_buf)-1, fp);`);
          this.writeC(`    __fl_subprocess_buf[n] = '\\0';`);
          this.writeC(`    pclose(fp);`);
          this.writeC(`    /* trim trailing newline */`);
          this.writeC(`    if (n > 0 && __fl_subprocess_buf[n-1] == '\\n') __fl_subprocess_buf[n-1] = '\\0';`);
          this.writeC(`    return __fl_subprocess_buf;`);
          this.writeC(`}`);
          this.writeC('');
        }
        this.writeC(`/* ruby:${node.package} usage: __fl_run_subprocess("ruby -e \\"require '${node.package}'; ...\\"") */`);
        this.writeC('');
        break;
      }

      case 'node': {
        // Node.js subprocess bridge: popen("node -e '...'")
        this.writeC(`/* @call node:${node.package} - subprocess mode */`);
        this.writeC(`/* Install: npm install ${node.package} */`);
        if (!this.subprocessHelpersInjected) {
          this.subprocessHelpersInjected = true;
          this.writeC(`/* --- subprocess bridge helper --- */`);
          this.writeC(`#include <stdio.h>`);
          this.writeC(`static char __fl_subprocess_buf[65536];`);
          this.writeC(`static const char* __fl_run_subprocess(const char* cmd) {`);
          this.writeC(`    FILE* fp = popen(cmd, "r");`);
          this.writeC(`    if (!fp) return "";`);
          this.writeC(`    size_t n = fread(__fl_subprocess_buf, 1, sizeof(__fl_subprocess_buf)-1, fp);`);
          this.writeC(`    __fl_subprocess_buf[n] = '\\0';`);
          this.writeC(`    pclose(fp);`);
          this.writeC(`    if (n > 0 && __fl_subprocess_buf[n-1] == '\\n') __fl_subprocess_buf[n-1] = '\\0';`);
          this.writeC(`    return __fl_subprocess_buf;`);
          this.writeC(`}`);
          this.writeC('');
        }
        this.writeC(`/* node:${node.package} usage: __fl_run_subprocess("node -e \\"const x=require('${node.package}'); ...\\"") */`);
        this.writeC('');
        break;
      }

      case 'zig': {
        // Zig subprocess: zig run temp.zig
        this.writeC(`/* @call zig:${node.package} - subprocess mode */`);
        if (!this.subprocessHelpersInjected) {
          this.subprocessHelpersInjected = true;
          this.writeC(`/* --- subprocess bridge helper --- */`);
          this.writeC(`#include <stdio.h>`);
          this.writeC(`static char __fl_subprocess_buf[65536];`);
          this.writeC(`static const char* __fl_run_subprocess(const char* cmd) {`);
          this.writeC(`    FILE* fp = popen(cmd, "r");`);
          this.writeC(`    if (!fp) return "";`);
          this.writeC(`    size_t n = fread(__fl_subprocess_buf, 1, sizeof(__fl_subprocess_buf)-1, fp);`);
          this.writeC(`    __fl_subprocess_buf[n] = '\\0';`);
          this.writeC(`    pclose(fp);`);
          this.writeC(`    if (n > 0 && __fl_subprocess_buf[n-1] == '\\n') __fl_subprocess_buf[n-1] = '\\0';`);
          this.writeC(`    return __fl_subprocess_buf;`);
          this.writeC(`}`);
          this.writeC('');
        }
        this.writeC(`/* zig:${node.package} usage: __fl_run_subprocess("zig run temp.zig") */`);
        this.writeC('');
        break;
      }

      default:
        this.writeC(`/* @call ${node.lang}:${node.package} - unsupported language */`);
        this.writeC('');
    }
  }

  /**
   * @call 노드에서 링크 플래그 추출
   */
  private collectLinkFlags(node: AST.ExternCall): string[] {
    switch (node.lang) {
      case 'c': {
        // C 표준 헤더는 링크 플래그 불필요
        if (NexusCodegen.C_STDLIB_HEADERS.has(node.package)) {
          return [];
        }
        const known = NexusCodegen.C_LINK_FLAGS[node.package];
        if (known) return known;
        // 모르는 라이브러리는 -l<package> 로 추측
        return [`-l${node.package}`];
      }
      case 'cpp': {
        const known = NexusCodegen.C_LINK_FLAGS[node.package];
        if (known) return [...known, '-lstdc++'];
        return [`-l${node.package}`, '-lstdc++'];
      }
      case 'python':
        // python3-config 결과는 런타임에 결정되므로 플래그 힌트만
        return ['$(python3-config --ldflags)'];
      case 'rust':
        return [`-L./target/release`, `-l${this.safeAlias(node.package)}`];
      case 'go': {
        const lib = this.safeAlias(node.package);
        return [`-L.`, `-l${lib}`];
      }
      case 'julia':
        return []; // runner에서 getJuliaLdFlags()로 동적 감지
      case 'js':
        return ['-lquickjs'];
      case 'ruby':
      case 'node':
      case 'zig':
        return []; // subprocess - 링크 플래그 불필요
      default:
        return [];
    }
  }

  /**
   * 다중언어 블록 처리
   * @lang("rust") 소스 코드를 외부 파일로 저장하고 extern 선언 생성
   */
  private genLangBlock(block: AST.LangBlock): void {
    const alias = block.lang.toLowerCase();
    const sourceName = this.inferSourceName(block);

    // externLibs에 LangBlock 정보 추가
    const libInfo: ExternLibInfo = {
      lang: block.lang,
      package: block.lang,
      artifact: block.artifact,
      linkFlags: block.artifact ? [`-l${block.artifact.replace(/^lib|\.so$/g, '')}`] : [],
      buildCmd: block.compileCmd,
      sourceCode: block.sourceCode, // 소스 코드 저장
      artifactName: sourceName,     // 소스 파일명 저장
      cgo: block.cgo,               // @cgo 플래그
      dependsOn: block.dependsOn,   // @depends_on 의존성
    };

    if (block.artifact) {
      this.linkFlagsSet.add(`-l${block.artifact.replace(/^lib|\.so$/g, '')}`);
    }
    this.externLibs.push(libInfo);

    // 임시 파일 생성을 위한 주석 (실제 빌드는 runner에서 담당)
    this.writeC(`/* ── 다중언어 블록: ${block.lang} ── */`);
    this.writeC(`/* 소스 코드: ${block.sourceCode.substring(0, 50)}... */`);

    // Rust인 경우, extern "C" 선언 자동 추출
    if (block.lang.toLowerCase() === 'rust') {
      // #[no_mangle] pub extern "C" fn funcName(args) -> RetType 패턴 매칭
      const fnPattern = /#\[no_mangle\]\s*pub\s+extern\s+"C"\s+fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(\S+))?/g;
      let fnMatch;
      while ((fnMatch = fnPattern.exec(block.sourceCode)) !== null) {
        const fnName = fnMatch[1];
        const paramStr = fnMatch[2];
        const retTypeStr = fnMatch[3] || '()';

        // Rust 타입 → C 타입 변환
        const cRetType = this.rustTypeToCType(retTypeStr);
        const cParams = this.rustParamsToCParams(paramStr);

        this.writeC(`extern ${cRetType} ${fnName}(${cParams || 'void'});`);
      }
    }

    // Zig인 경우, export fn 선언 자동 추출
    if (block.lang.toLowerCase() === 'zig') {
      const fnPattern = /export\s+fn\s+(\w+)\s*\(([^)]*)\)\s*(\w+)/g;
      let fnMatch;
      while ((fnMatch = fnPattern.exec(block.sourceCode)) !== null) {
        const fnName = fnMatch[1];
        const paramStr = fnMatch[2];
        const retTypeStr = fnMatch[3];

        const cRetType = this.zigTypeToCType(retTypeStr);
        const cParams = this.zigParamsToCParams(paramStr);

        this.writeC(`extern ${cRetType} ${fnName}(${cParams || 'void'});`);
      }
    }

    // Go cgo인 경우, //export 함수 선언 추출
    if (block.lang.toLowerCase() === 'go' && block.cgo) {
      // Go cgo의 //export 주석으로 C에서 호출 가능한 함수 선언
      // //export go_run
      // func go_run(n int32) int64 { ... }
      const exportPattern = /\/\/export\s+(\w+)/g;
      let exportMatch;
      const exportedFuncs = new Set<string>();
      while ((exportMatch = exportPattern.exec(block.sourceCode)) !== null) {
        exportedFuncs.add(exportMatch[1]);
      }

      // Go 함수 시그니처 추출
      for (const funcName of exportedFuncs) {
        // func funcName(params) retType { ... }
        const funcPattern = new RegExp(`func\\s+${funcName}\\s*\\(([^)]*)\\)\\s*(\\S+)?\\s*\\{`, 'g');
        const funcMatch = funcPattern.exec(block.sourceCode);
        if (funcMatch) {
          const paramStr = funcMatch[1];
          const retTypeStr = funcMatch[2] || 'void';

          // Go 타입 → C 타입 변환
          const cRetType = this.goTypeToCType(retTypeStr);
          const cParams = this.goParamsToCParams(paramStr);

          this.writeC(`extern ${cRetType} ${funcName}(${cParams || 'void'});`);
        }
      }

      // C 헤더 포함 (생성될 lib<alias>.h)
      if (block.artifact) {
        const headerName = block.artifact.replace(/\.so$/, '.h');
        this.writeC(`/* #include "${headerName}" */`);
      }
    }

    // Mojo인 경우, @export 함수 선언 추출
    if (block.lang.toLowerCase() === 'mojo') {
      // @export 어노테이션이 있는 함수 추출
      // @export
      // fn func_name(args) -> RetType { ... }
      const exportPattern = /@export\s*\n\s*fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(\S+))?/g;
      let fnMatch;
      while ((fnMatch = exportPattern.exec(block.sourceCode)) !== null) {
        const fnName = fnMatch[1];
        const paramStr = fnMatch[2];
        const retTypeStr = fnMatch[3] || 'void';
        this.writeC(`extern void ${fnName}(void);`);
      }
    }

    // V언어인 경우, pub fn 함수 선언 추출
    if (block.lang.toLowerCase() === 'v') {
      // pub fn funcName(args) Type { ... }
      const fnPattern = /pub\s+fn\s+(\w+)\s*\(([^)]*)\)\s*(\S+)?\s*\{/g;
      let fnMatch;
      while ((fnMatch = fnPattern.exec(block.sourceCode)) !== null) {
        const fnName = fnMatch[1];
        const paramStr = fnMatch[2];
        const retTypeStr = fnMatch[3] || 'void';
        this.writeC(`extern void ${fnName}(void);`);
      }
    }

    // C/C++인 경우: .so로 빌드하므로 소스 인라인 금지
    // 함수 시그니처만 추출하여 extern 선언 생성
    if (block.lang.toLowerCase() === 'c' || block.lang.toLowerCase() === 'cpp') {
      // C 함수 시그니처 패턴: retType funcName(params) {
      const fnPattern = /^\s*(?:extern\s+"C"\s*\{[^}]*\}|(?:int|long|long long|void|char\*?|float|double)\s+(\w+)\s*\(([^)]*)\)\s*\{)/gm;
      // 간단한 패턴: "retType name(params)" 형태 추출
      const simplePattern = /\b(int|long long|long|void|char\s*\*|float|double)\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
      let m;
      while ((m = simplePattern.exec(block.sourceCode)) !== null) {
        const retType = m[1].trim();
        const fnName  = m[2].trim();
        const params  = m[3].trim();
        this.writeC(`extern ${retType} ${fnName}(${params || 'void'});`);
      }
      // extern "C" 블록 내 함수도 추출 (C++)
      const externCPattern = /extern\s+"C"\s*\{([^}]*)\}/gs;
      let ec;
      while ((ec = externCPattern.exec(block.sourceCode)) !== null) {
        const inner = ec[1];
        const innerFn = /\b(int|long long|long|void|char\s*\*|float|double)\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
        let fm;
        while ((fm = innerFn.exec(inner)) !== null) {
          this.writeC(`extern ${fm[1].trim()} ${fm[2].trim()}(${fm[3].trim() || 'void'});`);
        }
      }
    }
  }

  // Go 타입 → C 타입 매핑
  private goTypeToCType(goType: string): string {
    const mapping: Record<string, string> = {
      'int32': 'int',
      'int64': 'long long',
      'float32': 'float',
      'float64': 'double',
      'uint32': 'unsigned int',
      'uint64': 'unsigned long long',
      'void': 'void',
    };
    return mapping[goType.trim()] || 'void';
  }

  // Go 파라미터 목록 → C 파라미터 목록
  private goParamsToCParams(paramStr: string): string {
    if (!paramStr.trim()) return '';

    // Go 파라미터 형식: name type, name type2
    const params = paramStr.split(',').map(p => {
      const parts = p.trim().split(/\s+/);
      if (parts.length < 2) return '';
      const type = parts[parts.length - 1];
      const name = parts.slice(0, -1).join('');
      if (!name || !type) return '';
      const cType = this.goTypeToCType(type);
      return `${cType} ${name}`;
    }).filter(Boolean);

    return params.join(', ');
  }

  /**
   * @compile 명령에서 소스 파일명 추출
   * "rustc --crate-type cdylib rust_core.rs -O -o librustcore.so" → "rust_core.rs"
   */
  private inferSourceName(block: AST.LangBlock): string | undefined {
    const exts: Record<string, string> = {
      'rust': '.rs',
      'zig': '.zig',
      'c': '.c',
      'cpp': '.cpp',
      'go': '.go',
      'julia': '.jl',
      'mojo': '.mojo',
      'v': '.v',
    };
    const ext = exts[block.lang.toLowerCase()];
    if (!ext || !block.compileCmd) return undefined;

    // 정규표현식으로 .rs/.zig 등 파일명 추출
    const pattern = new RegExp(`(\\S+\\${ext})`);
    const match = block.compileCmd.match(pattern);
    return match?.[1];
  }

  // Rust 타입 → C 타입 매핑
  private rustTypeToCType(rustType: string): string {
    const mapping: Record<string, string> = {
      'i32': 'int',
      'i64': 'long long',
      'f32': 'float',
      'f64': 'double',
      'bool': 'int',
      '()': 'void',
      'u32': 'unsigned int',
      'u64': 'unsigned long long',
    };
    return mapping[rustType.trim()] || 'void';
  }

  // Rust 파라미터 목록 → C 파라미터 목록
  private rustParamsToCParams(paramStr: string): string {
    if (!paramStr.trim()) return '';

    const params = paramStr.split(',').map(p => {
      const [name, type] = p.trim().split(':').map(s => s.trim());
      if (!name || !type) return '';
      const cType = this.rustTypeToCType(type);
      return `${cType} ${name}`;
    }).filter(Boolean);

    return params.join(', ');
  }

  // Zig 타입 → C 타입 매핑
  private zigTypeToCType(zigType: string): string {
    const mapping: Record<string, string> = {
      'i32': 'int',
      'i64': 'long long',
      'f32': 'float',
      'f64': 'double',
      'u32': 'unsigned int',
      'u64': 'unsigned long long',
      'void': 'void',
    };
    return mapping[zigType.trim()] || 'void';
  }

  // Zig 파라미터 목록 → C 파라미터 목록
  private zigParamsToCParams(paramStr: string): string {
    if (!paramStr.trim()) return '';

    const params = paramStr.split(',').map(p => {
      const [name, type] = p.trim().split(':').map(s => s.trim());
      if (!name || !type) return '';
      const cType = this.zigTypeToCType(type);
      return `${cType} ${name}`;
    }).filter(Boolean);

    return params.join(', ');
  }

  /**
   * Phase 10: SHA256 content hash for deterministic namespace
   * Prevents parallel build collisions: same code → same hash
   * Example: @shared_mem("data", size=10, type="i64") → nexus_a1b2c3d4_data
   */
  private computeContentHash(content: string): string {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 8);
  }

  /**
   * Phase 12: Platform detection header
   * Returns Windows or POSIX IPC header based on _WIN32 macro
   */
  private getPlatformShmHeader(): string {
    return `#ifdef _WIN32
#include <windows.h>
#else
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#endif`;
  }

  /**
   * 공유 메모리 디렉티브 처리 (Phase 10-12: Full Support)
   * @shared_mem("result_buf", size=64, type="i64")
   *
   * Phase 10: SHA256 content hash for deterministic namespace
   * Phase 11: atexit() automatic orphan cleanup
   * Phase 12: Windows/POSIX platform detection (future)
   *
   * Optimizations (Future):
   * - Cache line padding (64 bytes) to prevent false sharing
   * - volatile pointers to prevent compiler optimizations
   * - Lock-free algorithms via atomic builtins
   */
  private genSharedMem(directive: AST.SharedMemDirective): void {
    // Phase 10: SHA256 content hash for deterministic namespace
    const contentHash = this.computeContentHash(
      `${directive.name}:${directive.size}:${directive.dataType}`
    );
    const shmName = `nexus_${contentHash}_${directive.name}`;
    const varName = `__fl_shm_${directive.name}`;
    const cType = this.mapVType(directive.dataType);

    // Future optimization: Add cache line padding for performance
    // const alignedSize = Math.ceil(directive.size / 8) * 8;  // 64-byte alignment

    // POSIX shm 초기화 함수
    this.writeC(`static ${cType}* ${varName} = NULL;`);
    this.writeC(`static void __fl_shm_init_${directive.name}(void) {`);
    this.indentLevel++;

    const shmSize = `sizeof(${cType}) * ${directive.size}`;
    this.writeC(`int fd = shm_open("/${shmName}", O_CREAT | O_RDWR, 0666);`);
    this.writeC(`if (fd == -1) {`);
    this.indentLevel++;
    this.writeC(`perror("shm_open");`);
    this.writeC(`return;`);
    this.indentLevel--;
    this.writeC(`}`);

    this.writeC(`if (ftruncate(fd, ${shmSize}) == -1) {`);
    this.indentLevel++;
    this.writeC(`perror("ftruncate");`);
    this.writeC(`close(fd);`);
    this.writeC(`return;`);
    this.indentLevel--;
    this.writeC(`}`);

    this.writeC(`${varName} = (${cType}*)mmap(NULL, ${shmSize}, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);`);
    this.writeC(`if (${varName} == MAP_FAILED) {`);
    this.indentLevel++;
    this.writeC(`perror("mmap");`);
    this.writeC(`close(fd);`);
    this.writeC(`return;`);
    this.indentLevel--;
    this.writeC(`}`);

    this.writeC(`close(fd);`);

    this.indentLevel--;
    this.writeC(`}`);
    this.writeC('');

    // Phase 11: atexit() handler for automatic orphan cleanup
    this.writeC(`static void __fl_shm_cleanup_${directive.name}(void) {`);
    this.indentLevel++;
    this.writeC(`if (${varName} != MAP_FAILED && ${varName} != NULL) {`);
    this.indentLevel++;
    this.writeC(`munmap(${varName}, ${shmSize});`);
    this.indentLevel--;
    this.writeC(`}`);
    this.writeC(`shm_unlink("/${shmName}");`);
    this.indentLevel--;
    this.writeC(`}`);
    this.writeC('');

    // Register cleanup handler at exit
    this.writeC(`static __attribute__((constructor)) void __fl_shm_register_cleanup_${directive.name}(void) {`);
    this.indentLevel++;
    this.writeC(`atexit(__fl_shm_cleanup_${directive.name});`);
    this.indentLevel--;
    this.writeC(`}`);
    this.writeC('');

    // POSIX mmap 링크 플래그 추가
    this.linkFlagsSet.add('-lrt');
  }

  /**
   * 패키지명 → 안전한 C 식별자 alias
   * "github.com/gin-gonic/gin" → "gin"
   * "numpy" → "numpy"
   */
  private getVarType(node: any): string {
    if (node?.type === 'Identifier') {
      return this.varTypeMap.get(node.name) || 'i64';
    }
    return 'i64';
  }

  // BinaryExpr에서 double 전파 여부 판단
  private inferIsDouble(node: any): boolean {
    if (!node) return false;
    if (node.type === 'Number') return String(node.value).includes('.');
    if (node.type === 'Identifier') return this.varTypeMap.get(node.name) === 'double';
    if (node.type === 'BinaryExpr') return this.inferIsDouble(node.left) || this.inferIsDouble(node.right);
    return false;
  }

  // C 예약어 충돌 방지: 사용자 정의 함수명에 fl_ 접두사
  private safeFnName(name: string): string {
    return C_RESERVED.has(name) ? `fl_user_${name}` : name;
  }

  private safeAlias(pkg: string): string {
    // path의 마지막 segment 사용
    const last = pkg.split(/[\/\-\.]/).filter(Boolean).pop() || pkg;
    return last.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * 구조체 정의 → C typedef
   * struct Person { name: string, age: i64 }
   * →
   * typedef struct {
   *   char* name;
   *   long long age;
   * } Person;
   */
  private genVStructDef(def: AST.StructDef): void {
    this.writeC(`typedef struct {`);
    for (const field of def.fields) {
      const cType = this.mapVType(field.typeAnnotation);
      this.writeC(`  ${cType} ${field.name};`);
    }
    this.writeC(`} ${def.name};`);
    this.writeC(''); // 빈 줄
  }

  /**
   * 구조체 정의 → Python class
   * struct Person { name: string, age: i64 }
   * →
   * class Person:
   *     def __init__(self, name, age):
   *         self.name = name
   *         self.age = age
   */
  private genPyStructDef(def: AST.StructDef): void {
    this.writePy(`class ${def.name}:`);
    const params = def.fields.map((f) => f.name).join(', ');
    this.indentLevel++;
    this.writePy(`def __init__(self, ${params}):`);
    this.indentLevel++;
    for (const field of def.fields) {
      this.writePy(`self.${field.name} = ${field.name}`);
    }
    this.indentLevel -= 2;
    this.writePy(''); // 빈 줄
  }

  /**
   * V 문장 생성 (C 코드용)
   */
  private genVStatement(stmt: AST.Statement): void {
    const s = stmt as any;

    if (s.type === 'Return') {
      const returnStmt = s as AST.ReturnStatement;
      if (returnStmt.value) {
        const expr = this.genVExpression(returnStmt.value);
        this.writeC(`${this.indent()}return ${expr};`);
      } else {
        this.writeC(`${this.indent()}return;`);
      }
    } else if (s.type === 'Break') {
      this.writeC(`${this.indent()}break;`);
    } else if (s.type === 'Continue') {
      this.writeC(`${this.indent()}continue;`);
    } else if (s.type === 'Assign') {
      const assignStmt = s as AST.AssignStatement;
      const value = assignStmt.value as any;
      const varName = assignStmt.name;

      // 현재 스코프(또는 상위 스코프)에서 이미 선언된 변수인지 확인
      const alreadyDeclared = this.declaredVars.some(scope => scope.has(varName));

      if (alreadyDeclared) {
        // 재할당: 타입 선언 없이 그냥 대입
        const expr = this.genVExpression(assignStmt.value);
        this.writeC(`${this.indent()}${varName} = ${expr};`);
      } else {
        // 최초 선언: 현재 스코프에 등록
        this.declaredVars[this.declaredVars.length - 1].add(varName);

        // 명시적 타입 어노테이션이 있는 경우
        if (assignStmt.typeAnnotation) {
          const ta = assignStmt.typeAnnotation;
          if (ta.endsWith('[]')) {
            const elemType = this.mapVType(ta.slice(0, -2));
            const expr = this.genVExpression(assignStmt.value);
            if (value.type === 'Array') {
              const len = (value as AST.ArrayLiteral).elements.length;
              this.writeC(`${this.indent()}${elemType} ${varName}[${len}] = ${expr};`);
            } else {
              this.writeC(`${this.indent()}${elemType}* ${varName} = ${expr};`);
            }
          } else {
            const cType = this.mapVType(ta);
            const expr = this.genVExpression(assignStmt.value);
            this.writeC(`${this.indent()}${cType} ${varName} = ${expr};`);
          }
        } else {
          // 타입 추론: 값 기반
          const expr = this.genVExpression(assignStmt.value);
          let cType = 'long long';
          if (value.type === 'String') {
            cType = 'char*';
          } else if (value.type === 'Call') {
            // 문자열 반환 내장 함수 목록
            const STR_RETURNING = new Set([
              'read_file', 'trim', 'str_replace', 'char_at', 'str_slice',
              'int_to_str', 'float_to_str', 'format', 'str_concat', 'str_concat3',
              'to_string',
            ]);
            const callNode = value as any;
            let calleeName: string | null = null;
            if (typeof callNode.callee === 'string') calleeName = callNode.callee;
            else if (callNode.callee?.type === 'Identifier') calleeName = callNode.callee.name;
            // StrArray 반환 함수
            const STR_ARRAY_RETURNING = new Set(['split', 'lines', 'str_array_new']);
            // IntArray 반환 함수
            const INT_ARRAY_RETURNING = new Set(['int_array_new']);
            if (calleeName && STR_RETURNING.has(calleeName)) {
              cType = 'char*';
            } else if (calleeName && STR_ARRAY_RETURNING.has(calleeName)) {
              cType = 'StrArray';
            } else if (calleeName && INT_ARRAY_RETURNING.has(calleeName)) {
              cType = 'IntArray';
            } else if (!calleeName && callNode.callee?.type === 'MemberAccess') {
              // arr.pop() / arr.slice() / arr.len() 메서드 호출 타입 추론
              const ma = callNode.callee as AST.MemberAccess;
              const receiverNode = ma.object as any;
              const receiverName = receiverNode?.name ?? '';
              const receiverType = this.varTypeMap.get(receiverName) ?? '';
              const meth = ma.property;
              if (meth === 'pop') {
                cType = receiverType === 'IntArray' ? 'long long' : 'char*';
              } else if (meth === 'slice') {
                cType = receiverType === 'IntArray' ? 'IntArray' : 'StrArray';
              } else if (meth === 'len') {
                cType = 'long long';
              }
            } else if (calleeName === 'array_get') {
              // 첫 번째 인자 변수의 타입으로 원소 타입 결정
              const firstArg = (callNode.args || [])[0] as any;
              const arrVarName = firstArg?.name ?? '';
              const arrType = this.varTypeMap.get(arrVarName) ?? 'StrArray';
              cType = arrType === 'IntArray' ? 'long long' : 'char*';
            }
          } else if (value.type === 'Array') {
            const arrLit = value as AST.ArrayLiteral;
            const firstElem = arrLit.elements[0] as any;
            let elemType = 'long long';
            if (firstElem?.type === 'String') elemType = 'char*';
            else if (firstElem?.type === 'Number' && String(firstElem.value).includes('.')) elemType = 'double';
            const len = arrLit.elements.length;
            this.writeC(`${this.indent()}${elemType} ${varName}[${len}] = ${expr};`);
            return;
          } else if (value.type === 'Number' && String(value.value).includes('.')) {
            cType = 'double';
          } else if (value.type === 'BinaryExpr') {
            // BinaryExpr에서 피연산자 중 하나라도 double이면 double로 추론
            if (this.inferIsDouble(value as any)) cType = 'double';
          } else if (value.type === 'StructLiteral') {
            // struct 리터럴 → struct 타입명 사용
            cType = (value as AST.StructLiteral).name;
          }
          this.varTypeMap.set(varName, cType);
          this.writeC(`${this.indent()}${cType} ${varName} = ${expr};`);
        }
      }
    } else if (s.type === 'ExprStatement') {
      const exprStmt = s as AST.ExprStatement;
      const expr = this.genVExpression(exprStmt.expression);
      this.writeC(`${this.indent()}${expr};`);
    } else if (s.type === 'IfStatement') {
      const ifStmt = s as AST.IfStatement;
      const cond = this.genVExpression(ifStmt.condition);
      this.writeC(`${this.indent()}if (${cond}) {`);
      this.indentLevel++;
      this.declaredVars.push(new Set());
      for (const stmt of ifStmt.thenBranch) {
        this.genVStatement(stmt);
      }
      this.declaredVars.pop();
      this.indentLevel--;
      this.writeC(`${this.indent()}}`);
      if (ifStmt.elseBranch) {
        this.writeC(`${this.indent()}else {`);
        this.indentLevel++;
        this.declaredVars.push(new Set());
        for (const stmt of ifStmt.elseBranch) {
          this.genVStatement(stmt);
        }
        this.declaredVars.pop();
        this.indentLevel--;
        this.writeC(`${this.indent()}}`);
      }
    } else if (s.type === 'WhileStatement') {
      const whileStmt = s as AST.WhileStatement;
      const cond = this.genVExpression(whileStmt.condition);
      this.writeC(`${this.indent()}while (${cond}) {`);
      this.indentLevel++;
      this.declaredVars.push(new Set());
      for (const stmt of whileStmt.body) {
        this.genVStatement(stmt);
      }
      this.declaredVars.pop();
      this.indentLevel--;
      this.writeC(`${this.indent()}}`);
    } else if (s.type === 'ForStatement') {
      const forStmt = s as AST.ForStatement;
      const iterExpr = forStmt.iterable as any;

      // range(n) CallExpr 케이스
      if (iterExpr.type === 'Call') {
        const callee = iterExpr.callee as any;
        const calleeName = callee.type === 'Identifier' ? callee.name : '';
        if (calleeName === 'range' && iterExpr.args.length === 1) {
          const limit = this.genVExpression(iterExpr.args[0]);
          this.writeC(`${this.indent()}for (long long ${forStmt.variable} = 0; ${forStmt.variable} < ${limit}; ${forStmt.variable}++) {`);
        } else {
          const iterStr = this.genVExpression(forStmt.iterable);
          this.writeC(`${this.indent()}for (long long ${forStmt.variable} = 0; ${forStmt.variable} < ${iterStr}; ${forStmt.variable}++) {`);
        }
      } else {
        const iterStr = this.genVExpression(forStmt.iterable);
        this.writeC(`${this.indent()}for (long long ${forStmt.variable} = 0; ${forStmt.variable} < sizeof(${iterStr})/sizeof(${iterStr}[0]); ${forStmt.variable}++) {`);
      }

      this.indentLevel++;
      this.declaredVars.push(new Set([forStmt.variable]));
      for (const stmt of forStmt.body) {
        this.genVStatement(stmt);
      }
      this.declaredVars.pop();
      this.indentLevel--;
      this.writeC(`${this.indent()}}`);
    } else if (s.type === 'MatchStatement') {
      // match x { case 1 => { ... } case _ => { ... } }
      // → switch (x) { case 1: { ... break; } default: { ... break; } }
      const matchStmt = s as AST.MatchStatement;
      const subj = this.genVExpression(matchStmt.subject);
      this.writeC(`${this.indent()}switch (${subj}) {`);
      this.indentLevel++;
      for (const arm of matchStmt.arms) {
        if (arm.pattern === null) {
          this.writeC(`${this.indent()}default: {`);
        } else {
          const pat = this.genVExpression(arm.pattern);
          this.writeC(`${this.indent()}case ${pat}: {`);
        }
        this.indentLevel++;
        this.declaredVars.push(new Set());
        for (const stmt of arm.body) {
          this.genVStatement(stmt);
        }
        this.writeC(`${this.indent()}break;`);
        this.declaredVars.pop();
        this.indentLevel--;
        this.writeC(`${this.indent()}}`);
      }
      this.indentLevel--;
      this.writeC(`${this.indent()}}`);
    }
  }

  /**
   * Python 문장 생성 (Python 코드용)
   */
  private genPyStatement(stmt: AST.Statement): void {
    const s = stmt as any;
    const indentStr = this.indent();

    if (s.type === 'Return') {
      const returnStmt = s as AST.ReturnStatement;
      if (returnStmt.value) {
        const expr = this.genPyExpression(returnStmt.value);
        this.writePy(`${indentStr}return ${expr}`);
      } else {
        this.writePy(`${indentStr}return`);
      }
    } else if (s.type === 'Assign') {
      const assignStmt = s as AST.AssignStatement;
      const expr = this.genPyExpression(assignStmt.value);
      this.writePy(`${indentStr}${assignStmt.name} = ${expr}`);
    } else if (s.type === 'ExprStatement') {
      const exprStmt = s as AST.ExprStatement;
      const expr = this.genPyExpression(exprStmt.expression);
      this.writePy(`${indentStr}${expr}`);
    } else if (s.type === 'WhileStatement') {
      const whileStmt = s as AST.WhileStatement;
      const cond = this.genPyExpression(whileStmt.condition);
      this.writePy(`${indentStr}while ${cond}:`);
      this.indentLevel++;
      for (const stmt of whileStmt.body) {
        this.genPyStatement(stmt);
      }
      this.indentLevel--;
    } else if (s.type === 'ForStatement') {
      const forStmt = s as AST.ForStatement;
      const iter = this.genPyExpression(forStmt.iterable);
      this.writePy(`${indentStr}for ${forStmt.variable} in ${iter}:`);
      this.indentLevel++;
      for (const stmt of forStmt.body) {
        this.genPyStatement(stmt);
      }
      this.indentLevel--;
    } else if (s.type === 'MatchStatement') {
      // Python 3.10+ match/case 구문 생성
      const matchStmt = s as AST.MatchStatement;
      const subj = this.genPyExpression(matchStmt.subject);
      this.writePy(`${indentStr}match ${subj}:`);
      this.indentLevel++;
      for (const arm of matchStmt.arms) {
        if (arm.pattern === null) {
          this.writePy(`${this.indent()}case _:`);
        } else {
          const pat = this.genPyExpression(arm.pattern);
          this.writePy(`${this.indent()}case ${pat}:`);
        }
        this.indentLevel++;
        for (const stmt of arm.body) {
          this.genPyStatement(stmt);
        }
        this.indentLevel--;
      }
      this.indentLevel--;
    }
  }

  /**
   * V 표현식 생성 (C 코드용)
   */
  private genVExpression(expr: AST.Expression): string {
    const e = expr as any;

    if (e.type === 'Number') {
      return (e as AST.NumberLiteral).value.toString();
    }

    if (e.type === 'String') {
      // StringLiteral.value는 이미 따옴표를 포함 ("text" 형태)
      return (e as AST.StringLiteral).value;
    }

    if (e.type === 'Identifier') {
      return (e as AST.Identifier).name;
    }

    if (e.type === 'BinaryExpr') {
      const binExpr = e as AST.BinaryExpr;
      const left = this.genVExpression(binExpr.left);
      const right = this.genVExpression(binExpr.right);
      return `${left} ${binExpr.operator} ${right}`;
    }

    if (e.type === 'Array') {
      const arrayLit = e as AST.ArrayLiteral;
      const elements = arrayLit.elements.map((el) => this.genVExpression(el)).join(', ');
      return `{${elements}}`;
    }

    if (e.type === 'ArrayAccess') {
      const arrayAccess = e as AST.ArrayAccess;
      const obj = this.genVExpression(arrayAccess.object);
      const idx = this.genVExpression(arrayAccess.index);
      return `${obj}[${idx}]`;
    }

    if (e.type === 'Call') {
      const callExpr = e as AST.CallExpr;

      // Python alias.method(args) → PyObject_CallMethod 변환
      // 예: np.zeros(3) → __fl_py_to_ll(PyObject_CallMethod(__fl_py_mod_np, "zeros", "L", 3))
      const calleeNode = callExpr.callee as any;
      if (calleeNode && calleeNode.type === 'MemberAccess') {
        const maNode = calleeNode as AST.MemberAccess;
        const objNode = maNode.object as any;
        if (objNode && objNode.type === 'Identifier') {
          const alias = objNode.name;
          const method = maNode.property;
          const args = callExpr.args;

          // Python alias 메서드 호출
          if (this.pyAliasMap.has(alias)) {
            const info = this.pyAliasMap.get(alias)!;
            return this.genPyMethodCall(info.cVar, method, args);
          }

          // 배열 메서드 호출: arr.push(v), arr.pop(), arr.slice(s,e), arr.len()
          const arrType = this.varTypeMap.get(alias);
          const isIntArr = arrType === 'IntArray';
          const isStrArr = arrType === 'StrArray';
          if (isIntArr || isStrArr) {
            const prefix = isIntArr ? 'fl_int_array' : 'fl_str_array';
            if (method === 'push' && args.length === 1) {
              return `${prefix}_push(&${alias}, ${this.genVExpression(args[0])})`;
            }
            if (method === 'pop' && args.length === 0) {
              return `${prefix}_pop(&${alias})`;
            }
            if (method === 'slice' && args.length === 2) {
              return `${prefix}_slice(&${alias}, ${this.genVExpression(args[0])}, ${this.genVExpression(args[1])})`;
            }
            if (method === 'len' && args.length === 0) {
              return `${alias}.len`;
            }
          }
        }
      }

      // callee가 Identifier인 경우 함수명 추출
      let calleeStr: string | null = null;
      if (typeof callExpr.callee === 'string') {
        calleeStr = callExpr.callee;
      } else {
        const calleeExpr = callExpr.callee as any;
        if (calleeExpr.type === 'Identifier') {
          calleeStr = calleeExpr.name;
        }
      }

      // V 내장 함수 처리
      if (calleeStr && this.V_BUILTINS.has(calleeStr)) {
        return this.genVBuiltinCall(calleeStr, callExpr.args);
      }

      // 일반 함수 호출 (C 예약어 충돌 방지)
      let callee: string;
      if (typeof callExpr.callee === 'string') {
        callee = this.safeFnName(callExpr.callee);
      } else {
        const calleeExpr2 = callExpr.callee as any;
        if (calleeExpr2.type === 'Identifier') {
          callee = this.safeFnName(calleeExpr2.name);
        } else {
          callee = this.genVExpression(callExpr.callee);
        }
      }
      const args = callExpr.args.map((arg) => this.genVExpression(arg)).join(', ');
      return `${callee}(${args})`;
    }

    if (e.type === 'MemberAccess') {
      const ma = e as AST.MemberAccess;
      const obj = this.genVExpression(ma.object);
      if (ma.property === 'length') {
        // C에는 .length가 없으므로 sizeof 패턴 생성
        return `(sizeof(${obj})/sizeof(${obj}[0]))`;
      }
      if (ma.property === 'len') {
        // IntArray/StrArray의 .len 필드 접근
        return `${obj}.len`;
      }
      return `${obj}.${ma.property}`;
    }

    if (e.type === 'StructLiteral') {
      const sl = e as AST.StructLiteral;
      const entries = Object.entries(sl.fields);
      const fieldsCode = entries.map(([k, v]) => `.${k} = ${this.genVExpression(v)}`).join(', ');
      return `(${sl.name}){${fieldsCode}}`;
    }

    return '';
  }

  /**
   * Python alias.method(args) → PyObject_CallMethod C 호출 생성
   * 예: np.zeros(3) → __fl_py_to_ll(PyObject_CallMethod(__fl_py_mod_np, "zeros", "L", (long long)3))
   * 반환 타입은 컨텍스트로 알 수 없어 기본 __fl_py_to_ll 래퍼 사용
   */
  private genPyMethodCall(cVar: string, method: string, args: AST.Expression[]): string {
    if (args.length === 0) {
      // 인수 없는 경우: PyObject_CallMethod(obj, "method", NULL)
      return `__fl_py_to_ll(PyObject_CallMethod(${cVar}, "${method}", NULL))`;
    }
    // 인수 있는 경우: PyObject_CallMethodObjArgs 또는 format string 방식
    // 간단히 format string "O" per arg, 각 arg를 PyLong_FromLongLong으로 감쌈
    const fmtChars = args.map(a => {
      const ea = a as any;
      if (ea.type === 'String') return 's';
      return 'L';  // long long
    }).join('');

    const argExprs = args.map(a => {
      const ea = a as any;
      if (ea.type === 'String') {
        // 문자열: 따옴표 제거한 raw 값
        return ea.value.slice(1, -1);
      }
      return `(long long)(${this.genVExpression(a)})`;
    }).join(', ');

    return `__fl_py_to_ll(PyObject_CallMethod(${cVar}, "${method}", "${fmtChars}", ${argExprs}))`;
  }

  /**
   * V 모드 내장 함수 호출 생성
   */
  private genVBuiltinCall(name: string, args: AST.Expression[]): string {
    if (name === 'println') {
      if (args.length === 0) return 'printf("\\n")';
      const firstArg = args[0] as any;
      // StringLiteral → 직접 포맷 문자열
      if (firstArg.type === 'String') {
        const str = firstArg.value.slice(1, -1).replace(/"/g, '\\"');
        return `printf("%s\\n", "${str}")`;
      }
      // Number → %lld
      if (firstArg.type === 'Number') {
        const arg = this.genVExpression(firstArg);
        return `printf("%lld\\n", ${arg})`;
      }
      // 변수/표현식 → 타입 추론 후 포맷 선택
      const arg = this.genVExpression(firstArg);
      // 선언된 변수 타입 확인
      const varType = this.getVarType(firstArg);
      if (varType === 'string' || varType === 'char*') {
        return `fl_println_str(${arg})`;
      }
      if (varType === 'double') {
        return `printf("%g\\n", (double)(${arg}))`;
      }
      // 기본: long long (%lld)
      return `printf("%lld\\n", (long long)(${arg}))`;
    }

    if (name === 'print') {
      if (args.length === 0) return 'printf("")';
      const firstArg = args[0] as any;
      if (firstArg.type === 'String') {
        const str = firstArg.value.slice(1, -1).replace(/"/g, '\\"');
        return `printf("%s", "${str}")`;
      }
      if (firstArg.type === 'Number') {
        const arg = this.genVExpression(firstArg);
        return `printf("%lld", ${arg})`;
      }
      const arg = this.genVExpression(firstArg);
      const varType2 = this.getVarType(firstArg);
      if (varType2 === 'string' || varType2 === 'char*') {
        return `fl_print_str(${arg})`;
      }
      if (varType2 === 'double') {
        return `printf("%g", (double)(${arg}))`;
      }
      return `printf("%lld", (long long)(${arg}))`;
    }

    if (name === 'len') {
      const firstArg = args[0] as any;
      if (firstArg.type === 'String') {
        // StringLiteral인 경우 따옴표 제거
        const str = firstArg.value.slice(1, -1);
        return `strlen("${str}")`;
      }
      const arg = this.genVExpression(firstArg);
      return `strlen(${arg})`;
    }

    if (name === 'to_string') {
      const arg = this.genVExpression(args[0]);
      return arg; // 단순 pass-through
    }

    if (name === 'int_cast') {
      const firstArg = args[0] as any;
      if (firstArg.type === 'String') {
        const str = firstArg.value.slice(1, -1);
        return `atoi("${str}")`;
      }
      const arg = this.genVExpression(firstArg);
      return `atoi(${arg})`;
    }

    if (name === 'float_cast') {
      const arg = this.genVExpression(args[0]);
      return `(double)(${arg})`;
    }

    if (name === 'bool_cast') {
      const arg = this.genVExpression(args[0]);
      return `(bool)(${arg})`;
    }

    // ── 수학 함수 ──
    if (name === 'abs') {
      const arg = this.genVExpression(args[0]);
      return `llabs(${arg})`;
    }

    if (name === 'min') {
      const a = this.genVExpression(args[0]);
      const b = this.genVExpression(args[1]);
      return `((${a}) < (${b}) ? (${a}) : (${b}))`;
    }

    if (name === 'max') {
      const a = this.genVExpression(args[0]);
      const b = this.genVExpression(args[1]);
      return `((${a}) > (${b}) ? (${a}) : (${b}))`;
    }

    if (name === 'sqrt') {
      const arg = this.genVExpression(args[0]);
      return `(long long)sqrt((double)(${arg}))`;
    }

    if (name === 'pow') {
      const base = this.genVExpression(args[0]);
      const exp = this.genVExpression(args[1]);
      return `(long long)pow((double)(${base}), (double)(${exp}))`;
    }

    if (name === 'floor') {
      const arg = this.genVExpression(args[0]);
      return `(long long)floor((double)(${arg}))`;
    }

    if (name === 'ceil') {
      const arg = this.genVExpression(args[0]);
      return `(long long)ceil((double)(${arg}))`;
    }

    // ── 문자열 함수 ──
    if (name === 'str_len') {
      const arg = this.genVExpression(args[0]);
      return `(long long)strlen(${arg})`;
    }

    if (name === 'str_contains') {
      const haystack = this.genVExpression(args[0]);
      const needle = this.genVExpression(args[1]);
      return `(strstr(${haystack}, ${needle}) != NULL)`;
    }

    if (name === 'str_eq') {
      const a = this.genVExpression(args[0]);
      const b = this.genVExpression(args[1]);
      return `(strcmp(${a}, ${b}) == 0)`;
    }

    // ── 파일 I/O ──
    if (name === 'read_file') {
      const path = this.genVExpression(args[0]);
      return `fl_read_file(${path})`;
    }

    if (name === 'write_file') {
      const path = this.genVExpression(args[0]);
      const content = this.genVExpression(args[1]);
      return `fl_write_file(${path}, ${content})`;
    }

    if (name === 'append_file') {
      const path = this.genVExpression(args[0]);
      const content = this.genVExpression(args[1]);
      return `fl_append_file(${path}, ${content})`;
    }

    // ── 문자열 확장 ──
    if (name === 'trim') {
      const s = this.genVExpression(args[0]);
      return `fl_trim(${s})`;
    }

    if (name === 'split') {
      const s = this.genVExpression(args[0]);
      const delim = this.genVExpression(args[1]);
      return `fl_split(${s}, ${delim})`;
    }

    if (name === 'lines') {
      const s = this.genVExpression(args[0]);
      return `fl_lines(${s})`;
    }

    if (name === 'str_replace') {
      const s = this.genVExpression(args[0]);
      const from = this.genVExpression(args[1]);
      const to = this.genVExpression(args[2]);
      return `fl_str_replace(${s}, ${from}, ${to})`;
    }

    if (name === 'char_at') {
      const s = this.genVExpression(args[0]);
      const i = this.genVExpression(args[1]);
      return `fl_char_at(${s}, ${i})`;
    }

    if (name === 'str_slice') {
      const s = this.genVExpression(args[0]);
      const start = this.genVExpression(args[1]);
      const end = this.genVExpression(args[2]);
      return `fl_str_slice(${s}, ${start}, ${end})`;
    }

    if (name === 'starts_with') {
      const s = this.genVExpression(args[0]);
      const prefix = this.genVExpression(args[1]);
      return `fl_starts_with(${s}, ${prefix})`;
    }

    if (name === 'ends_with') {
      const s = this.genVExpression(args[0]);
      const suffix = this.genVExpression(args[1]);
      return `fl_ends_with(${s}, ${suffix})`;
    }

    if (name === 'str_concat') {
      const a = this.genVExpression(args[0]);
      const b = this.genVExpression(args[1]);
      return `fl_format("%s%s", ${a}, ${b})`;
    }

    if (name === 'str_concat3') {
      const a = this.genVExpression(args[0]);
      const b = this.genVExpression(args[1]);
      const c = this.genVExpression(args[2]);
      return `fl_format("%s%s%s", ${a}, ${b}, ${c})`;
    }

    if (name === 'format') {
      const fmt = this.genVExpression(args[0]);
      const rest = args.slice(1).map(a => this.genVExpression(a)).join(', ');
      return rest ? `fl_format(${fmt}, ${rest})` : `fl_format(${fmt})`;
    }

    if (name === 'int_to_str') {
      const n = this.genVExpression(args[0]);
      return `fl_int_to_str(${n})`;
    }

    if (name === 'float_to_str') {
      const f = this.genVExpression(args[0]);
      const d = args.length > 1 ? this.genVExpression(args[1]) : '6';
      return `fl_float_to_str(${f}, ${d})`;
    }

    // ── println/print 문자열 오버로드 ──
    if (name === 'println') {
      // 이미 위에서 처리되나, str 변수 출력을 위해 재정의
    }

    // ── 배열 ──
    if (name === 'int_array_new') {
      return `fl_int_array_new()`;
    }

    if (name === 'str_array_new') {
      return `fl_str_array_new()`;
    }

    if (name === 'array_len') {
      const arr = this.genVExpression(args[0]);
      return `(${arr}).len`;
    }

    if (name === 'array_get') {
      const arrExpr = args[0] as any;
      const arrVarName = arrExpr?.name ?? '';
      const arrType = this.varTypeMap.get(arrVarName) ?? 'StrArray';
      const arr = this.genVExpression(args[0]);
      const idx = this.genVExpression(args[1]);
      if (arrType === 'IntArray') {
        return `fl_int_array_get(&${arr}, ${idx})`;
      }
      return `fl_str_array_get(&${arr}, ${idx})`;
    }

    if (name === 'push') {
      const arrExpr = args[0] as any;
      const arrVarName = arrExpr?.name ?? '';
      const arrType = this.varTypeMap.get(arrVarName) ?? 'StrArray';
      const arr = this.genVExpression(args[0]);
      const val = this.genVExpression(args[1]);
      if (arrType === 'IntArray') {
        return `fl_int_array_push(&${arr}, ${val})`;
      }
      return `fl_str_array_push(&${arr}, ${val})`;
    }

    // ── 시스템 명령 ──
    if (name === 'system') {
      if (args.length === 0) return 'system("")';
      const firstArg = args[0] as any;
      if (firstArg.type === 'String') {
        const str = firstArg.value.slice(1, -1).replace(/"/g, '\\"');
        return `system("${str}")`;
      }
      const arg = this.genVExpression(firstArg);
      return `system(${arg})`;
    }

    return '';
  }

  /**
   * Python 표현식 생성 (Python 코드용)
   */
  private genPyExpression(expr: AST.Expression): string {
    const e = expr as any;

    if (e.type === 'Number') {
      return (e as AST.NumberLiteral).value.toString();
    }

    if (e.type === 'String') {
      // StringLiteral.value는 이미 따옴표를 포함 ("text" 형태)
      return (e as AST.StringLiteral).value;
    }

    if (e.type === 'Identifier') {
      return (e as AST.Identifier).name;
    }

    if (e.type === 'BinaryExpr') {
      const binExpr = e as AST.BinaryExpr;
      const left = this.genPyExpression(binExpr.left);
      const right = this.genPyExpression(binExpr.right);
      return `${left} ${binExpr.operator} ${right}`;
    }

    if (e.type === 'Array') {
      const arrayLit = e as AST.ArrayLiteral;
      const elements = arrayLit.elements.map((el) => this.genPyExpression(el)).join(', ');
      return `[${elements}]`;
    }

    if (e.type === 'ArrayAccess') {
      const arrayAccess = e as AST.ArrayAccess;
      const obj = this.genPyExpression(arrayAccess.object);
      const idx = this.genPyExpression(arrayAccess.index);
      return `${obj}[${idx}]`;
    }

    if (e.type === 'Call') {
      const callExpr = e as AST.CallExpr;
      const callee = typeof callExpr.callee === 'string' ? callExpr.callee : this.genPyExpression(callExpr.callee);
      const args = callExpr.args.map((arg) => this.genPyExpression(arg)).join(', ');
      return `${callee}(${args})`;
    }

    if (e.type === 'MemberAccess') {
      const ma = e as AST.MemberAccess;
      const obj = this.genPyExpression(ma.object);
      if (ma.property === 'length') {
        return `len(${obj})`;
      }
      return `${obj}.${ma.property}`;
    }

    if (e.type === 'StructLiteral') {
      const sl = e as AST.StructLiteral;
      const args = Object.entries(sl.fields)
        .map(([k, v]) => `${k}=${this.genPyExpression(v)}`)
        .join(', ');
      return `${sl.name}(${args})`;
    }

    return '';
  }

  /**
   * V 타입 → C 타입 매핑
   */
  private mapVType(type: string): string {
    const mapping: Record<string, string> = {
      i64: 'long long',
      i32: 'int',
      f64: 'double',
      f32: 'float',
      bool: 'bool',
      string: 'char*',
      void: 'void',
    };

    return mapping[type] || type;
  }

  /**
   * Python 타입 → Python 타입 (기본값)
   */
  private mapPyType(type: string): string {
    const mapping: Record<string, string> = {
      i64: 'int',
      i32: 'int',
      f64: 'float',
      f32: 'float',
      bool: 'bool',
      string: 'str',
      void: 'None',
      int: 'int',
      float: 'float',
    };

    return mapping[type] || type;
  }

  /**
   * C 코드에 줄 추가
   */
  private writeC(line: string): void {
    this.cLines.push(line);
  }

  /**
   * Python 코드에 줄 추가
   */
  private writePy(line: string): void {
    this.pyLines.push(line);
  }

  /**
   * 현재 들여쓰기 문자열
   */
  private indent(): string {
    return '    '.repeat(this.indentLevel);
  }
}
