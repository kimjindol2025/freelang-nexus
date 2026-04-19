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

  const KEYWORDS = /^\d|^return$|^if$|^else$|^while$|^for$|^in$|^let$|^mut$|^fn$|^match$|^case$|^loop$|^break$|^continue$|^println$|^print$|^true$|^false$|^null$|^None$|^and$|^or$|^not$|^do$|^lambda$/;
  r = r.replace(/\b([a-zA-Z_]\w*)\b/g, (m) => {
    if (KEYWORDS.test(m)) {
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

  // 비교 연산자 (우선순위 높음 — 먼저 처리)
  r = r.replace(/(\$\w+)\s*>=\s*(\$?\w+)/g, '(>= $1 $2)');
  r = r.replace(/(\$\w+)\s*<=\s*(\$?\w+)/g, '(<= $1 $2)');
  r = r.replace(/(\$\w+)\s*==\s*(\$?\w+)/g, '(= $1 $2)');
  r = r.replace(/(\$\w+)\s*!=\s*(\$?\w+)/g, '(!= $1 $2)');
  r = r.replace(/(\$\w+)\s*>\s*(\$?\w+)/g, '(> $1 $2)');
  r = r.replace(/(\$\w+)\s*<\s*(\$?\w+)/g, '(< $1 $2)');

  // 논리 연산자 (&&, ||)
  r = r.replace(/(\$?\w+|\([^)]+\))\s*&&\s*(\$?\w+|\([^)]+\))/g, '(and $1 $2)');
  r = r.replace(/(\$?\w+|\([^)]+\))\s*\|\|\s*(\$?\w+|\([^)]+\))/g, '(or $1 $2)');

  // 산술 (%, **, 먼저)
  r = r.replace(/(\$?\w+)\s*%\s*(\$?\w+)/g, '(mod $1 $2)');
  r = r.replace(/(\$?\w+)\s*\*\*\s*(\$?\w+)/g, '(pow $1 $2)');

  r = r.replace(/(\$?\w+)\s*\*\s*(\$?\w+)/g, '(* $1 $2)');
  r = r.replace(/(\$?\w+)\s*\/\s*(\$?\w+)/g, '(/ $1 $2)');
  r = r.replace(/(\$?\w+)\s*\+\s*(\$?\w+)/g, '(+ $1 $2)');
  r = r.replace(/(\$?\w+)\s*-\s*(\$?\w+)/g, '(- $1 $2)');

  // 비트 연산자
  r = r.replace(/(\$?\w+)\s*&\s*(\$?\w+)/g, '(bit-and $1 $2)');
  r = r.replace(/(\$?\w+)\s*\|\s*(\$?\w+)/g, '(bit-or $1 $2)');
  r = r.replace(/(\$?\w+)\s*\^\s*(\$?\w+)/g, '(bit-xor $1 $2)');
  r = r.replace(/(\$?\w+)\s*<<\s*(\$?\w+)/g, '(shl $1 $2)');
  r = r.replace(/(\$?\w+)\s*>>\s*(\$?\w+)/g, '(shr $1 $2)');

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
    return v || '';
  } else if (s.type === 'Call' || s.type === 'ExprStatement') {
    const expr = s.type === 'ExprStatement' ? s.expression : s;
    return exprToSExpr(expr);
  } else if (s.type === 'IfStatement') {
    const cond = exprToSExpr(s.condition);
    const thenStmts = (s.thenBranch || []).map(stmtToSExpr).filter(Boolean).join(' ');
    const thenBlk = thenStmts.includes(' ') ? `(do ${thenStmts})` : thenStmts;
    if (s.elseBranch && s.elseBranch.length > 0) {
      const elseStmts = s.elseBranch.map(stmtToSExpr).filter(Boolean).join(' ');
      const elseBlk = elseStmts.includes(' ') ? `(do ${elseStmts})` : elseStmts;
      return `(if ${cond} ${thenBlk} ${elseBlk})`;
    }
    return `(if ${cond} ${thenBlk})`;
  } else if (s.type === 'WhileStatement') {
    const cond = exprToSExpr(s.condition);
    const body = (s.body || []).map(stmtToSExpr).filter(Boolean).join(' ');
    return `(while ${cond} (do ${body}))`;
  } else if (s.type === 'ForStatement') {
    const iter = exprToSExpr(s.iterable);
    const body = (s.body || []).map(stmtToSExpr).filter(Boolean).join(' ');
    return `(for $${s.variable} ${iter} (do ${body}))`;
  } else if (s.type === 'MatchStatement') {
    const subj = exprToSExpr(s.subject);
    const arms = (s.arms || []).map((arm: any) => {
      const pat = arm.pattern ? exprToSExpr(arm.pattern) : '_';
      const body = arm.body.map(stmtToSExpr).filter(Boolean).join(' ');
      return `(case ${pat} ${body})`;
    }).join(' ');
    return `(match ${subj} ${arms})`;
  } else if (s.type === 'Break') {
    return '(break)';
  } else if (s.type === 'Continue') {
    return '(continue)';
  }
  return '';
}

function cvtOp(op: string): string {
  const map: Record<string, string> = {
    '+': '+', '-': '-', '*': '*', '/': '/', '%': 'mod',
    '==': '=', '!=': '!=', '<': '<', '>': '>', '<=': '<=', '>=': '>=',
    '&&': 'and', '||': 'or', '**': 'pow',
    '&': 'bit-and', '|': 'bit-or', '^': 'bit-xor', '<<': 'shl', '>>': 'shr',
  };
  return map[op] || op;
}

function exprToSExpr(e: any): string {
  if (!e) return '';
  if (e.type === 'Call') {
    const a = e.args?.map((x: any) => exprToSExpr(x)).join(' ') || '';
    const c = e.callee?.name || 'x';
    return a ? `(${c} ${a})` : `(${c})`;
  } else if (e.type === 'BinaryExpr') {
    const l = exprToSExpr(e.left);
    const r = exprToSExpr(e.right);
    const op = cvtOp(e.operator);
    return `(${op} ${l} ${r})`;
  } else if (e.type === 'Number') {
    return String(e.value);
  } else if (e.type === 'String') {
    return `"${e.value}"`;
  } else if (e.type === 'Identifier') {
    return `$${e.name}`;
  } else if (e.type === 'MemberAccess') {
    return `$${exprToSExpr(e.object).replace(/^\$/, '')}.${e.property}`;
  } else if (e.type === 'ArrayAccess') {
    return `(get ${exprToSExpr(e.object)} ${exprToSExpr(e.index)})`;
  } else if (e.type === 'Array') {
    const elems = (e.elements || []).map((x: any) => exprToSExpr(x)).join(' ');
    return `(list ${elems})`;
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
