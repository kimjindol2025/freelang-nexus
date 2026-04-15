/**
 * FreeLang Nexus 2 — 메인 트랜스파일러
 *
 * AST에서 언어 블록을 추출하고 각각을 FreeLang v9로 변환
 */

import {
  ExportedFunction,
  extractRustFunctions,
  extractGoFunctions,
  extractCFunctions,
  extractPythonFunctions,
  generateFlvSignature,
  transpileBody,
} from './base';

export interface TranspiledResult {
  functions: ExportedFunction[];
  vCode: string; // V 오케스트레이터 코드
}

/**
 * AST에서 모든 언어 블록을 추출하고 트랜스파일
 */
export function transpilePolyglot(ast: any): TranspiledResult {
  const functions: ExportedFunction[] = [];
  let vCode = '';

  // AST body에서 각 노드 순회
  for (const node of (ast.body || [])) {
    if (node.type === 'LangBlock') {
      // 언어별로 함수 추출
      const lang = node.lang?.toLowerCase() || '';
      const sourceCode = node.sourceCode || '';

      let extracted: ExportedFunction[] = [];
      switch (lang) {
        case 'rust':
          extracted = extractRustFunctions(sourceCode);
          break;
        case 'go':
          extracted = extractGoFunctions(sourceCode);
          break;
        case 'c':
        case 'cpp':
          extracted = extractCFunctions(sourceCode);
          break;
        case 'python':
          extracted = extractPythonFunctions(sourceCode);
          break;
      }

      functions.push(...extracted);
      console.error(`[Nexus 2] Found ${extracted.length} exportable ${lang} function(s)`);
    } else if (node.type === 'FunctionDef' || node.type === 'PyFunction') {
      // V 모드의 함수는 그대로 유지
      vCode += nodeToFlv9(node) + '\n';
    } else if (node.type === 'VBlock') {
      vCode += node.sourceCode + '\n';
    }
  }

  // 트랜스파일된 함수들을 FL v9 형식으로 변환
  const transpiledFunctions = functions.map(fn => ({
    ...fn,
    flv9Sig: generateFlvSignature(fn),
    flv9Body: transpileBody(fn.lang, fn.body),
  }));

  return {
    functions: transpiledFunctions as any,
    vCode,
  };
}

/**
 * 간단한 AST 노드 → FL v9 변환 (V 코드)
 */
function nodeToFlv9(node: any): string {
  // 간단히: 노드의 sourceCode를 그대로 반환
  return node.sourceCode || '';
}

export default transpilePolyglot;
