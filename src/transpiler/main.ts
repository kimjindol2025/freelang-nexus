/**
 * FreeLang Nexus 2 — 메인 트랜스파일러
 *
 * AST에서 언어 블록을 추출하고 각각을 FreeLang v9로 변환
 */

import { ExportedFunction, generateFlvSignature, transpileBody } from './base';
import { transpileRustFunctions } from './rust-to-fl';
import { transpileGoFunctions } from './go-to-fl';
import { transpileseFunctions } from './c-to-fl';
import { transpilepythonFunctions } from './python-to-fl';

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
          extracted = transpileRustFunctions(sourceCode);
          break;
        case 'go':
          extracted = transpileGoFunctions(sourceCode);
          break;
        case 'c':
        case 'cpp':
          extracted = transpileseFunctions(sourceCode);
          break;
        case 'python':
          extracted = transpilepythonFunctions(sourceCode);
          break;
      }

      functions.push(...extracted);
      console.error(`[Nexus 2] Found ${extracted.length} exportable ${lang} function(s)`);
    } else if (node.type === 'FunctionDef' || node.type === 'PyFunction' || node.type === 'VFunction') {
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
    flv9Body: fn.body, // 이미 트랜스파일된 body
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
  if (node.sourceCode) {
    return node.sourceCode;
  }

  // VFunction 노드를 텍스트로 재구성
  if (node.type === 'VFunction') {
    const params = node.params?.map((p: any) => `${p.name}: ${p.type}`).join(', ') || '';
    const returnType = node.returnType && node.returnType !== 'void' ? ` -> ${node.returnType}` : '';

    // body 배열을 V 코드로 변환 (간단히)
    let bodyCode = '';
    if (Array.isArray(node.body)) {
      bodyCode = node.body.map((stmt: any) => statementToFlv9(stmt)).join('\n  ');
    }

    return `fn ${node.name}(${params})${returnType} {\n  ${bodyCode}\n}`;
  }

  return '';
}

/**
 * Statement를 V 코드로 변환
 */
function statementToFlv9(stmt: any): string {
  if (stmt.type === 'Assign') {
    const value = expressionToFlv9(stmt.value);
    return `let ${stmt.name} = ${value}`;
  } else if (stmt.type === 'Return') {
    const value = stmt.value ? expressionToFlv9(stmt.value) : '';
    return value ? `return ${value}` : 'return';
  } else if (stmt.type === 'Call') {
    return expressionToFlv9(stmt);
  }
  return '';
}

/**
 * Expression을 V 코드로 변환
 */
function expressionToFlv9(expr: any): string {
  if (expr.type === 'Call') {
    const args = expr.args?.map((a: any) => expressionToFlv9(a)).join(', ') || '';
    const callee = expr.callee?.name || 'unknown';
    return `${callee}(${args})`;
  } else if (expr.type === 'Number') {
    return expr.value;
  } else if (expr.type === 'String') {
    return `"${expr.value}"`;
  } else if (expr.type === 'Identifier') {
    return expr.name;
  }
  return '';
}

export default transpilePolyglot;
