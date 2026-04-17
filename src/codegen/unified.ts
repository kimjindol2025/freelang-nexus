import { TranspiledResult } from '../transpiler/main';
import { ExportedFunction, mapType, transpileBody } from '../transpiler/base';

function toSExpr(l: string, b: string): string {
  let r = b.trim().replace(/^\s*return\s+/, '').replace(/;$/, '');
  r = transpileBody(l, r);
  r = cvtSExpr(r);
  return r;
}

function cvtSExpr(e: string): string {
  let r = e.trim().replace(/;$/, '');

  r = addDol(r);
  r = cvtBinOp(r);
  r = cvtFunc(r);

  return r;
}

function addDol(e: string): string {
  let r = '';
  let inS = false;
  let sC = '';

  for (let i = 0; i < e.length; i++) {
    const ch = e[i];
    if ((ch === '"' || ch === "'") && (i === 0 || e[i - 1] !== '\\')) {
      if (!inS) {
        inS = true;
        sC = ch;
        r += ch;
      } else if (ch === sC) {
        inS = false;
        r += ch;
      } else {
        r += ch;
      }
    } else if (inS) {
      r += ch;
    } else {
      r += ch;
    }
  }

  r = r.replace(/\b([a-zA-Z_]\w*)\b/g, (m) => {
    if (/^\d|^return$|^if$|^while$|^let$|^fn$|^println$|^print$|^true$|^false$/.test(m)) {
      return m;
    }
    if (m.startsWith('$')) {
      return m;
    }
    return '$' + m;
  });

  return r;
}

function cvtBinOp(e: string): string {
  let r = e;

  r = r.replace(/(\$\w+)\s*>=\s*(\$?\w+)/g, '(>= $1 $2)');
  r = r.replace(/(\$\w+)\s*<=\s*(\$?\w+)/g, '(<= $1 $2)');
  r = r.replace(/(\$\w+)\s*==\s*(\$?\w+)/g, '(= $1 $2)');
  r = r.replace(/(\$\w+)\s*!=\s*(\$?\w+)/g, '(!= $1 $2)');
  r = r.replace(/(\$\w+)\s*>\s*(\$?\w+)/g, '(> $1 $2)');
  r = r.replace(/(\$\w+)\s*<\s*(\$?\w+)/g, '(< $1 $2)');

  r = r.replace(/(\$?\w+)\s*\*\s*(\$?\w+)/g, '(* $1 $2)');
  r = r.replace(/(\$?\w+)\s*\/\s*(\$?\w+)/g, '(/ $1 $2)');
  r = r.replace(/(\$?\w+)\s*\+\s*(\$?\w+)/g, '(+ $1 $2)');
  r = r.replace(/(\$?\w+)\s*-\s*(\$?\w+)/g, '(- $1 $2)');

  return r;
}

function cvtFunc(e: string): string {
  let r = e;

  r = r.replace(/println\s*\(\s*([^)]*)\s*\)/g, (m, a) => {
    const ta = a.trim();
    return ta ? `(println ${ta})` : '(println)';
  });

  r = r.replace(/print\s*\(\s*([^)]*)\s*\)/g, (m, a) => {
    const ta = a.trim();
    return ta ? `(println ${ta})` : '(println)';
  });

  return r;
}

function fnBlk(f: ExportedFunction): string[] {
  const l: string[] = [];
  const rt = mapType(f.lang, f.returnType);

  l.push(`[FUNC ${f.name}`);

  const pn = f.params.map(p => `$${p.name}`).join(' ');
  l.push(`  :params [${pn}]`);

  if (f.returnType !== 'void') {
    l.push(`  :return ${rt}`);
  }

  const sb = toSExpr(f.lang, f.body);
  l.push(`  :body ${sb}`);

  l.push(']');

  return l;
}

function stmtToSExpr(s: any): string {
  if (s.type === 'Assign') {
    const v = exprToSExpr(s.value);
    return `(let $${s.name} ${v})`;
  } else if (s.type === 'Return') {
    const v = s.value ? exprToSExpr(s.value) : '';
    return v ? v : '';
  } else if (s.type === 'Call') {
    return exprToSExpr(s);
  }
  return '';
}

function exprToSExpr(e: any): string {
  if (e.type === 'Call') {
    const a = e.args?.map((x: any) => exprToSExpr(x)).join(' ') || '';
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

function nodeToFlv9(n: any): string {
  if (!n) return '';

  if (n.sourceCode) {
    return n.sourceCode;
  }

  if (n.type === 'VFunction') {
    const pm = n.params?.map((p: any) => `$${p.name}`).join(' ') || '';
    let bd = '';
    if (Array.isArray(n.body)) {
      const ss = n.body.map((st: any) => stmtToSExpr(st)).filter((x: string) => x);
      bd = ss.length === 1 ? ss[0] : `(do ${ss.join(' ')})`;
    }

    return `[FUNC ${n.name}\n  :params [${pm}]\n  :body ${bd}\n]`;
  }

  return '';
}

export function generateUnifiedCode(ast: any, tr: TranspiledResult): string {
  const l: string[] = [];

  for (const f of tr.functions) {
    const fl = fnBlk(f as ExportedFunction);
    l.push(...fl);
    l.push('');
  }

  if (tr.vCode.trim()) {
    const vf = ast?.body?.find?.((n: any) => n.type === 'VFunction');
    if (vf) {
      l.push(nodeToFlv9(vf));
    }
  }

  return l.join('\n');
}

export default generateUnifiedCode;
