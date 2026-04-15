/**
 * FreeLang Nexus 2 — 트랜스파일러 공통 모듈
 *
 * 타입 매핑, 함수 시그니처 변환, body 변환 등 공통 기능
 */

/**
 * 언어별 타입을 FreeLang v9 타입으로 매핑
 */
export function mapType(lang: string, type: string): string {
  const typeStr = type.trim().toLowerCase();

  switch (lang.toLowerCase()) {
    case 'rust':
      return mapRustType(typeStr);
    case 'go':
      return mapGoType(typeStr);
    case 'c':
    case 'cpp':
      return mapCType(typeStr);
    case 'python':
      return mapPythonType(typeStr);
    default:
      return 'any';
  }
}

function mapRustType(type: string): string {
  // Remove references/pointers
  type = type.replace(/&.*?(?=\s|$)/, '').trim();

  const mapping: { [key: string]: string } = {
    'i32': 'i64',
    'i64': 'i64',
    'u32': 'i64',
    'u64': 'i64',
    'f32': 'f64',
    'f64': 'f64',
    'bool': 'bool',
    'string': 'str',
    'str': 'str',
    '()': 'void',
    'void': 'void',
  };

  return mapping[type] || 'any';
}

function mapGoType(type: string): string {
  const mapping: { [key: string]: string } = {
    'int': 'i64',
    'int32': 'i64',
    'int64': 'i64',
    'uint': 'i64',
    'uint32': 'i64',
    'uint64': 'i64',
    'float32': 'f64',
    'float64': 'f64',
    'bool': 'bool',
    'string': 'str',
    'rune': 'i64',
    'byte': 'i64',
    'error': 'str', // 간단히 str로 매핑
  };

  return mapping[type] || 'any';
}

function mapCType(type: string): string {
  const mapping: { [key: string]: string } = {
    'int': 'i64',
    'int32_t': 'i64',
    'int64_t': 'i64',
    'uint': 'i64',
    'uint32_t': 'i64',
    'uint64_t': 'i64',
    'float': 'f64',
    'double': 'f64',
    'bool': 'bool',
    '_bool': 'bool',
    'char': 'i64',
    'char*': 'str',
    'void': 'void',
  };

  return mapping[type] || 'any';
}

function mapPythonType(type: string): string {
  const mapping: { [key: string]: string } = {
    'int': 'i64',
    'float': 'f64',
    'str': 'str',
    'bool': 'bool',
    'none': 'void',
    'any': 'any',
  };

  return mapping[type] || 'any';
}

/**
 * 함수 시그니처를 FreeLang v9 형식으로 변환
 */
export interface ExportedFunction {
  name: string;
  params: Array<{ name: string; type: string }>;
  returnType: string;
  body: string;
  lang: string;
}

export function generateFlvSignature(fn: ExportedFunction): string {
  const paramStr = fn.params
    .map(p => `${p.name}: ${mapType(fn.lang, p.type)}`)
    .join(', ');

  const returnType = fn.returnType === 'void' ? '' : ` -> ${mapType(fn.lang, fn.returnType)}`;

  return `fn ${fn.name}(${paramStr})${returnType}`;
}

/**
 * 함수 body를 간단히 정규식으로 변환 (MVP: 기본적인 변환만)
 */
export function transpileBody(lang: string, body: string): string {
  let result = body;

  switch (lang.toLowerCase()) {
    case 'rust':
      result = transpileRustBody(result);
      break;
    case 'go':
      result = transpileGoBody(result);
      break;
    case 'c':
    case 'cpp':
      result = transpileCBody(result);
      break;
    case 'python':
      result = transpilePythonBody(result);
      break;
  }

  return result;
}

function transpileRustBody(body: string): string {
  let result = body;

  // return 문은 그대로
  // as 캐스트 제거
  result = result.replace(/\s+as\s+\w+/g, '');

  // 세미콜론 유지 (FL v9도 필요)
  return result;
}

function transpileGoBody(body: string): string {
  let result = body;

  // return 문은 그대로
  // panic 제거 (에러 처리는 생략)
  result = result.replace(/panic\([^)]*\)/g, 'null');

  // := → = 로 변환
  result = result.replace(/:=/g, '=');

  return result;
}

function transpileCBody(body: string): string {
  let result = body;

  // C 타입 선언을 FL v9 let 선언으로
  result = result.replace(/int\s+(\w+)\s*=/g, 'let $1 =');
  result = result.replace(/double\s+(\w+)\s*=/g, 'let $1 =');
  result = result.replace(/float\s+(\w+)\s*=/g, 'let $1 =');
  result = result.replace(/bool\s+(\w+)\s*=/g, 'let $1 =');
  result = result.replace(/char\*\s+(\w+)\s*=/g, 'let $1 =');

  // for 루프를 while로
  // for (int i = 0; i < 10; i++) { ... } → while i < 10 { ... i = i + 1 }
  result = result.replace(
    /for\s*\(\s*int\s+(\w+)\s*=\s*(\d+);\s*(\w+)\s*<\s*(\w+);\s*\w+\+\+\s*\)\s*{/g,
    (match, varName, initVal, condVar, condVal) => {
      return `let ${varName}: i64 = ${initVal}\nwhile ${condVar} < ${condVal} {`;
    }
  );

  // i++ → i = i + 1
  result = result.replace(/(\w+)\+\+/g, '$1 = $1 + 1');
  result = result.replace(/(\w+)--/g, '$1 = $1 - 1');

  // printf → println (간단히)
  result = result.replace(/printf\s*\(\s*"([^"]*)"\s*\)/g, 'println("$1")');

  return result;
}

function transpilePythonBody(body: string): string {
  let result = body;

  // print → println
  result = result.replace(/print\s*\(/g, 'println(');

  // import 문 제거 (간단히)
  result = result.replace(/import\s+\w+\n/g, '');
  result = result.replace(/from\s+\w+\s+import\s+\w+\n/g, '');

  // def 함수 정의 제거
  result = result.replace(/def\s+\w+\s*\([^)]*\):\n/g, '');

  // 들여쓰기 제거 (Python → FL v9)
  result = result
    .split('\n')
    .map(line => line.replace(/^\s+/, ''))
    .join('\n');

  return result;
}

/**
 * 트랜스파일 함수 추출 (정규식 기반, MVP)
 */
export function extractRustFunctions(code: string): ExportedFunction[] {
  const pattern = /#\[no_mangle\]\s*pub\s+extern\s+"C"\s+fn\s+(\w+)\s*\(([^)]*)\)\s*->\s*(\w+)\s*{([^}]+)}/g;
  const functions: ExportedFunction[] = [];

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [, name, params, returnType, body] = match;
    const parsedParams = parseParams(params, 'rust');

    functions.push({
      name,
      params: parsedParams,
      returnType,
      body: body.trim(),
      lang: 'rust',
    });
  }

  return functions;
}

export function extractGoFunctions(code: string): ExportedFunction[] {
  const pattern = /\/\/export\s+(\w+)\s*\n\s*func\s+(\w+)\s*\(([^)]*)\)\s*(\w+)\s*{([^}]+)}/g;
  const functions: ExportedFunction[] = [];

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [, exportName, funcName, params, returnType, body] = match;
    const parsedParams = parseParams(params, 'go');

    functions.push({
      name: funcName,
      params: parsedParams,
      returnType,
      body: body.trim(),
      lang: 'go',
    });
  }

  return functions;
}

export function extractCFunctions(code: string): ExportedFunction[] {
  const pattern = /(\w+)\s+(\w+)\s*\(([^)]*)\)\s*{([^}]+)}/g;
  const functions: ExportedFunction[] = [];

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [, returnType, name, params, body] = match;
    const parsedParams = parseParams(params, 'c');

    functions.push({
      name,
      params: parsedParams,
      returnType,
      body: body.trim(),
      lang: 'c',
    });
  }

  return functions;
}

export function extractPythonFunctions(code: string): ExportedFunction[] {
  const pattern = /def\s+(\w+)\s*\(([^)]*)\):\n((?:\s+[^\n]+\n?)*)/g;
  const functions: ExportedFunction[] = [];

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [, name, params, body] = match;
    const parsedParams = parseParamsPython(params);

    functions.push({
      name,
      params: parsedParams,
      returnType: 'any',
      body: body.trim(),
      lang: 'python',
    });
  }

  return functions;
}

function parseParams(paramStr: string, lang: string): Array<{ name: string; type: string }> {
  if (!paramStr.trim()) return [];

  if (lang === 'rust') {
    // x: i32, y: i64
    return paramStr.split(',').map(p => {
      const [name, type] = p.trim().split(':').map(s => s.trim());
      return { name, type };
    });
  } else if (lang === 'go') {
    // n int, s string
    const parts = paramStr.split(',').map(p => p.trim());
    const result: Array<{ name: string; type: string }> = [];

    for (const part of parts) {
      const tokens = part.split(/\s+/);
      if (tokens.length >= 2) {
        result.push({
          name: tokens[0],
          type: tokens.slice(1).join(' '),
        });
      }
    }
    return result;
  } else if (lang === 'c') {
    // int x, double y
    const parts = paramStr.split(',').map(p => p.trim());
    const result: Array<{ name: string; type: string }> = [];

    for (const part of parts) {
      const tokens = part.split(/\s+/);
      if (tokens.length >= 2) {
        result.push({
          name: tokens[tokens.length - 1],
          type: tokens.slice(0, -1).join(' '),
        });
      }
    }
    return result;
  }

  return [];
}

function parseParamsPython(paramStr: string): Array<{ name: string; type: string }> {
  if (!paramStr.trim()) return [];

  return paramStr.split(',').map(p => ({
    name: p.trim(),
    type: 'any',
  }));
}
