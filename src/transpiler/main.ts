import { ExportedFunction, generateFlvSignature, transpileBody } from './base';
import { transpileRustFunctions } from './rust-to-fl';
import { transpileGoFunctions } from './go-to-fl';
import { transpileseFunctions } from './c-to-fl';
import { transpilepythonFunctions } from './python-to-fl';

export interface TranspiledResult {
  functions: ExportedFunction[];
  vCode: string;
}

export function transpilePolyglot(ast: any): TranspiledResult {
  const fns: ExportedFunction[] = [];
  let vc = '';

  for (const nd of (ast.body || [])) {
    if (nd.type === 'LangBlock') {
      const lg = nd.lang?.toLowerCase() || '';
      const sc = nd.sourceCode || '';

      let ext: ExportedFunction[] = [];
      switch (lg) {
        case 'rust':
          ext = transpileRustFunctions(sc);
          break;
        case 'go':
          ext = transpileGoFunctions(sc);
          break;
        case 'c':
        case 'cpp':
          ext = transpileseFunctions(sc);
          break;
        case 'python':
          ext = transpilepythonFunctions(sc);
          break;
      }

      fns.push(...ext);
    } else if (nd.type === 'FunctionDef' || nd.type === 'PyFunction' || nd.type === 'VFunction') {
      vc += n2fx(nd) + '\n';
    } else if (nd.type === 'VBlock') {
      vc += nd.sourceCode + '\n';
    }
  }

  return {
    functions: fns as any,
    vCode: vc,
  };
}

function n2fx(n: any): string {
  if (!n) return '';

  if (n.sourceCode) {
    return n.sourceCode;
  }

  if (n.type === 'VFunction') {
    const pm = n.params?.map((p: any) => `$${p.name}`).join(' ') || '';
    let bd = '';
    if (Array.isArray(n.body)) {
      const ss = n.body.map((st: any) => s2x(st)).filter((x: string) => x);
      bd = ss.length === 1 ? ss[0] : `(do ${ss.join(' ')})`;
    }

    return `[FUNC ${n.name}\n  :params [${pm}]\n  :body ${bd}\n]`;
  }

  return '';
}

function s2x(s: any): string {
  if (s.type === 'Assign') {
    const v = e2x(s.value);
    return `(let $${s.name} ${v})`;
  } else if (s.type === 'Return') {
    const v = s.value ? e2x(s.value) : '';
    return v || '';
  } else if (s.type === 'Call') {
    return e2x(s);
  }
  return '';
}

function e2x(e: any): string {
  if (e.type === 'Call') {
    const a = e.args?.map((x: any) => e2x(x)).join(' ') || '';
    const c = e.callee?.name || 'x';
    return a ? `(${c} ${a})` : `(${c})`;
  } else if (e.type === 'Number') {
    return e.value;
  } else if (e.type === 'String') {
    return `"${e.value}"`;
  } else if (e.type === 'Identifier') {
    return `$${e.name}`;
  }
  return '';
}

export default transpilePolyglot;
