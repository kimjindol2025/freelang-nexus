/**
 * Rust → FreeLang v9 트랜스파일러
 */

import { ExportedFunction, mapType } from './base';

/**
 * Rust 코드에서 export된 함수 추출 및 트랜스파일
 */
export function transpileRustFunctions(code: string): ExportedFunction[] {
  const functions: ExportedFunction[] = [];

  // #[no_mangle]\npub extern "C" fn name(params) -> returnType { body }
  const pattern = /#\[no_mangle\]\s*pub\s+extern\s+"C"\s+fn\s+(\w+)\s*\(([^)]*)\)\s*->\s*(\w+)\s*{([^}]+)}/g;

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [, funcName, paramStr, returnType, body] = match;

    const params = parseRustParams(paramStr);
    const returnTypeMapped = mapType('rust', returnType);
    const bodyTranspiled = transpileRustBody(body);

    functions.push({
      name: funcName,
      params,
      returnType: returnTypeMapped,
      body: bodyTranspiled,
      lang: 'rust',
    });
  }

  return functions;
}

/**
 * Rust 파라미터 파싱: "x: i32, y: i32" → [{name: 'x', type: 'i64'}, ...]
 */
function parseRustParams(paramStr: string): Array<{ name: string; type: string }> {
  if (!paramStr.trim()) return [];

  const params: Array<{ name: string; type: string }> = [];
  const parts = paramStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const [name, type] = trimmed.split(':').map(s => s.trim());
    if (name && type) {
      params.push({
        name,
        type: mapType('rust', type),
      });
    }
  }

  return params;
}

/**
 * Rust body 변환:
 * - as i32/i64 캐스트 제거
 * - 암묵적 반환 → return 추가
 * - println! → println
 */
function transpileRustBody(body: string): string {
  let result = body.trim();

  // as 캐스트 제거
  result = result.replace(/\s+as\s+\w+/g, '');

  // 암묵적 반환: 표현식이 마지막이면 return 추가
  const lines = result.split('\n');
  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1].trim();
    if (lastLine && !lastLine.startsWith('return') && !lastLine.endsWith(';')) {
      lines[lines.length - 1] = `return ${lastLine}`;
      result = lines.join('\n');
    }
  }

  // println! → println
  result = result.replace(/println!\s*\(/g, 'println(');

  return result;
}

export default transpileRustFunctions;
