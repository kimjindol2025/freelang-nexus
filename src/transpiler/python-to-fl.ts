/**
 * Python → FreeLang v9 트랜스파일러
 */

import { ExportedFunction } from './base';

/**
 * Python 코드에서 함수 추출 및 트랜스파일
 */
export function transpilepythonFunctions(code: string): ExportedFunction[] {
  const functions: ExportedFunction[] = [];

  // def name(params):\n    body
  const pattern = /def\s+(\w+)\s*\(([^)]*)\):\s*\n((?:(?:\s{2,}).*(?:\n|$))+)/g;

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [, funcName, paramStr, body] = match;

    const params = parsePythonParams(paramStr);
    const bodyTranspiled = transpilepBody(body);

    functions.push({
      name: funcName,
      params,
      returnType: 'any',
      body: bodyTranspiled,
      lang: 'python',
    });
  }

  return functions;
}

/**
 * Python 파라미터 파싱: "name, count" → [{name: 'name', type: 'any'}, ...]
 */
function parsePythonParams(paramStr: string): Array<{ name: string; type: string }> {
  if (!paramStr.trim()) return [];

  return paramStr.split(',').map(p => ({
    name: p.trim(),
    type: 'any',
  }));
}

/**
 * Python body 변환:
 * - 들여쓰기 제거
 * - print → println
 * - import 제거
 */
function transpilepBody(body: string): string {
  let result = body.trim();

  // 들여쓰기 제거 (Python은 2-4 스페이스)
  const baseIndent = result.match(/^\s*/)?.[0].length || 0;
  result = result
    .split('\n')
    .map(line => {
      if (line.trim()) {
        return line.substring(baseIndent);
      }
      return '';
    })
    .join('\n')
    .trim();

  // import 제거
  result = result.replace(/^import\s+\w+\s*\n/gm, '');
  result = result.replace(/^from\s+\w+\s+import\s+\w+\s*\n/gm, '');

  // print(...) → println(...)
  result = result.replace(/print\s*\(/g, 'println(');

  // len() 호출 유지 (나중에 표준 라이브러리 지원)
  // str_len()로 매핑 가능
  result = result.replace(/len\s*\(/g, 'str_len(');

  return result;
}

export default transpilepythonFunctions;
