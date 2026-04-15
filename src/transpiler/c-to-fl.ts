/**
 * C → FreeLang v9 트랜스파일러
 */

import { ExportedFunction, mapType } from './base';

/**
 * C 코드에서 export된 함수 추출 및 트랜스파일
 */
export function transpileseFunctions(code: string): ExportedFunction[] {
  const functions: ExportedFunction[] = [];

  // type name(params) { body }
  const pattern = /(\w+(?:\s+\*)?)\s+(\w+)\s*\(([^)]*)\)\s*{([^}]+)}/g;

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [, returnType, funcName, paramStr, body] = match;

    const params = parseCParams(paramStr);
    const returnTypeMapped = mapType('c', returnType);
    const bodyTranspiled = transpilebBody(body);

    functions.push({
      name: funcName,
      params,
      returnType: returnTypeMapped,
      body: bodyTranspiled,
      lang: 'c',
    });
  }

  return functions;
}

/**
 * C 파라미터 파싱: "int a, double b" → [{name: 'a', type: 'i64'}, ...]
 */
function parseCParams(paramStr: string): Array<{ name: string; type: string }> {
  if (!paramStr.trim()) return [];

  const params: Array<{ name: string; type: string }> = [];
  const parts = paramStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const tokens = trimmed.split(/\s+/);
    if (tokens.length >= 2) {
      const name = tokens[tokens.length - 1];
      const type = tokens.slice(0, -1).join(' ');
      params.push({
        name,
        type: mapType('c', type),
      });
    }
  }

  return params;
}

/**
 * C body 변환:
 * - for 루프 → while
 * - int a = 0; → let a = 0
 * - printf → println
 * - 세미콜론 제거
 */
function transpilebBody(body: string): string {
  let result = body.trim();

  // type var = value; → let var = value
  result = result.replace(/int\s+(\w+)\s*=\s*/g, 'let $1 = ');
  result = result.replace(/double\s+(\w+)\s*=\s*/g, 'let $1 = ');
  result = result.replace(/float\s+(\w+)\s*=\s*/g, 'let $1 = ');

  // for (int i = 0; i < 10; i++) { ... } → while i < 10 { ... i = i + 1 }
  result = result.replace(
    /for\s*\(\s*int\s+(\w+)\s*=\s*(\d+);\s*(\w+)\s*<\s*(\d+);\s*\w+\+\+\s*\)\s*{/g,
    (match, varName, initVal, condVar, condVal) => {
      return `let ${varName} = ${initVal}\nwhile ${condVar} < ${condVal} {`;
    }
  );

  // i++ → i = i + 1
  result = result.replace(/(\w+)\+\+/g, '$1 = $1 + 1');

  // printf("...") → println("...")
  result = result.replace(/printf\s*\(\s*"([^"]*)"\s*(?:,[^)]*)?\)/g, 'println("$1")');

  // 세미콜론 제거
  result = result.replace(/;/g, '');

  return result;
}

export default transpileseFunctions;
