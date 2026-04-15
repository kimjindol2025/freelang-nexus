/**
 * Go → FreeLang v9 트랜스파일러
 */

import { ExportedFunction, mapType } from './base';

/**
 * Go 코드에서 export된 함수 추출 및 트랜스파일
 */
export function transpileGoFunctions(code: string): ExportedFunction[] {
  const functions: ExportedFunction[] = [];

  // //export funcName\nfunc name(params) returnType { body }
  const pattern = /\/\/export\s+(\w+)\s*\n\s*func\s+(\w+)\s*\(([^)]*)\)\s*(\w+(?:\.\w+)?)\s*{([^}]+)}/g;

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [, exportName, funcName, paramStr, returnType, body] = match;

    const params = parseGoParams(paramStr);
    const returnTypeMapped = mapType('go', returnType);
    const bodyTranspiled = transpileGoBody(body);

    functions.push({
      name: funcName,
      params,
      returnType: returnTypeMapped,
      body: bodyTranspiled,
      lang: 'go',
    });
  }

  return functions;
}

/**
 * Go 파라미터 파싱: "a C.int, b C.int" → [{name: 'a', type: 'i64'}, ...]
 */
function parseGoParams(paramStr: string): Array<{ name: string; type: string }> {
  if (!paramStr.trim()) return [];

  const params: Array<{ name: string; type: string }> = [];
  const parts = paramStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const tokens = trimmed.split(/\s+/);
    if (tokens.length >= 2) {
      const name = tokens[0];
      const type = tokens.slice(1).join('.');
      params.push({
        name,
        type: mapType('go', type),
      });
    }
  }

  return params;
}

/**
 * Go body 변환:
 * - C.int → i64
 * - := → let
 * - fmt.Println → println
 */
function transpileGoBody(body: string): string {
  let result = body.trim();

  // return 문 유지, 만약 없으면 마지막 표현식도 return으로
  if (!result.includes('return')) {
    result = `return ${result}`;
  }

  // C.int → i64 (간단한 변환)
  result = result.replace(/C\.int/g, 'i64');
  result = result.replace(/C\.double/g, 'f64');

  // := → =
  result = result.replace(/:=/g, '=');

  // fmt.Println → println
  result = result.replace(/fmt\.Println/g, 'println');

  // 세미콜론 제거
  result = result.replace(/;/g, '');

  return result;
}

export default transpileGoFunctions;
