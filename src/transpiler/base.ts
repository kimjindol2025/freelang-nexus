/**
 * 균형잡힌 { ... } 블록을 추출한다.
 * 정규식 {([^}]+)} 의 중첩 실패를 해결하는 핵심 유틸리티.
 * @param src  소스 전체
 * @param openBrace  { 의 시작 인덱스 (이미 { 를 가리켜야 함)
 * @returns  { 와 대응하는 } 사이의 내용 (중괄호 제외), 또는 null
 */
function extractBalancedBraces(src: string, openBrace: number): { content: string; end: number } | null {
  let depth = 0;
  let i = openBrace;
  let inStr = false;
  let strChar = '';

  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === strChar) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strChar = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { content: src.slice(openBrace + 1, i), end: i };
    }
  }
  return null;
}

export function mapType(l: string, t: string): string {
  const ts = t.trim().toLowerCase();

  switch (l.toLowerCase()) {
    case 'rust':
      return mrT(ts);
    case 'go':
      return mgT(ts);
    case 'c':
    case 'cpp':
      return mcT(ts);
    case 'python':
      return mpT(ts);
    default:
      return 'number';
  }
}

function mrT(t: string): string {
  t = t.replace(/&.*?(?=\s|$)/, '').trim();
  // 제네릭 제거: Vec<T>, Option<T> 등 → 기본 컨테이너 이름만
  t = t.replace(/<[^>]*>/, '');

  const m: { [key: string]: string } = {
    'i32': 'number',
    'i64': 'number',
    'u32': 'number',
    'u64': 'number',
    'f32': 'number',
    'f64': 'number',
    'bool': 'bool',
    'string': 'string',
    'str': 'string',
    '()': 'void',
    'void': 'void',
  };

  // 제네릭: Vec<T>, Option<T>, Result<T,E>, HashMap<K,V>
  if (/^vec/.test(t)) return 'list';
  if (/^option/.test(t)) return 'option';
  if (/^result/.test(t)) return 'result';
  if (/^hashmap/.test(t)) return 'map';
  if (/^slice/.test(t) || /^\[/.test(t)) return 'list';

  return m[t] || 'number';
}

function mgT(t: string): string {
  const m: { [key: string]: string } = {
    'int': 'number',
    'int32': 'number',
    'int64': 'number',
    'uint': 'number',
    'uint32': 'number',
    'uint64': 'number',
    'float32': 'number',
    'float64': 'number',
    'bool': 'bool',
    'string': 'string',
    'rune': 'number',
    'byte': 'number',
    'error': 'string',
  };

  // Go 슬라이스: []int, []string
  if (/^\[\]/.test(t)) return 'list';
  // Go map: map[K]V
  if (/^map\[/.test(t)) return 'map';

  return m[t] || 'number';
}

function mcT(t: string): string {
  const m: { [key: string]: string } = {
    'int': 'number',
    'int32_t': 'number',
    'int64_t': 'number',
    'uint': 'number',
    'uint32_t': 'number',
    'uint64_t': 'number',
    'float': 'number',
    'double': 'number',
    'bool': 'bool',
    '_bool': 'bool',
    'char': 'number',
    'char*': 'string',
    'void': 'void',
  };

  // 포인터: int*, void*, char** 등
  if (t.endsWith('*')) {
    const base = t.slice(0, -1).trim();
    if (base === 'char') return 'string';  // char* → string
    if (base === 'void') return 'ptr';      // void* → ptr
    return 'ptr';  // 일반 포인터
  }

  return m[t] || 'number';
}

function mpT(t: string): string {
  const m: { [key: string]: string } = {
    'int': 'number',
    'float': 'number',
    'str': 'string',
    'bool': 'bool',
    'none': 'void',
    'any': 'number',
  };

  if (/^list\[/.test(t) || t === 'list') return 'list';
  if (/^dict\[/.test(t) || t === 'dict') return 'map';
  if (/^optional\[/.test(t)) return 'option';
  if (/^tuple\[/.test(t)) return 'list';
  if (t === 'bytes') return 'string';

  return m[t] || 'number';
}

export interface ExportedFunction {
  name: string;
  params: Array<{ name: string; type: string }>;
  returnType: string;
  body: string;
  lang: string;
}

export function generateFlvSignature(f: ExportedFunction): string {
  const ps = f.params
    .map(p => `${p.name}: ${mapType(f.lang, p.type)}`)
    .join(', ');

  const rt = f.returnType === 'void' ? '' : ` -> ${mapType(f.lang, f.returnType)}`;

  return `fn ${f.name}(${ps})${rt}`;
}

export function transpileBody(l: string, b: string): string {
  let r = b;

  switch (l.toLowerCase()) {
    case 'rust':
      r = trB(r);
      break;
    case 'go':
      r = tgB(r);
      break;
    case 'c':
    case 'cpp':
      r = tcB(r);
      break;
    case 'python':
      r = tpB(r);
      break;
  }

  return r;
}

function trB(b: string): string {
  let r = b;
  r = r.replace(/\s+as\s+\w+/g, '');
  return r;
}

function tgB(b: string): string {
  let r = b;
  r = r.replace(/panic\([^)]*\)/g, 'null');
  r = r.replace(/:=/g, '=');
  return r;
}

function tcB(b: string): string {
  let r = b;

  r = r.replace(/int\s+(\w+)\s*=/g, 'let $1 =');
  r = r.replace(/double\s+(\w+)\s*=/g, 'let $1 =');
  r = r.replace(/float\s+(\w+)\s*=/g, 'let $1 =');
  r = r.replace(/bool\s+(\w+)\s*=/g, 'let $1 =');
  r = r.replace(/char\*\s+(\w+)\s*=/g, 'let $1 =');

  r = r.replace(
    /for\s*\(\s*int\s+(\w+)\s*=\s*(\d+);\s*(\w+)\s*<\s*(\w+);\s*\w+\+\+\s*\)\s*{/g,
    (m, vn, iv, cv, cvl) => {
      return `let ${vn}: i64 = ${iv}\nwhile ${cv} < ${cvl} {`;
    }
  );

  r = r.replace(/(\w+)\+\+/g, '$1 = $1 + 1');
  r = r.replace(/(\w+)--/g, '$1 = $1 - 1');

  r = r.replace(/printf\s*\(\s*"([^"]*)"\s*\)/g, 'println("$1")');

  return r;
}

function tpB(b: string): string {
  let r = b;

  r = r.replace(/print\s*\(/g, 'println(');

  r = r.replace(/import\s+\w+\n/g, '');
  r = r.replace(/from\s+\w+\s+import\s+\w+\n/g, '');

  r = r.replace(/def\s+\w+\s*\([^)]*\):\n/g, '');

  r = r
    .split('\n')
    .map(ln => ln.replace(/^\s+/, ''))
    .join('\n');

  return r;
}

export function extractRustFunctions(c: string): ExportedFunction[] {
  // 시그니처만 정규식으로 잡고, body는 extractBalancedBraces() 로 추출
  const sigPat = /#\[no_mangle\]\s*pub\s+extern\s+"C"\s+fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([\w<>, *[\]]+))?\s*\{/g;
  const fs: ExportedFunction[] = [];

  let m;
  while ((m = sigPat.exec(c)) !== null) {
    const [fullMatch, nm, pm, rt = '()'] = m;
    const braceStart = m.index + fullMatch.length - 1; // { 의 위치
    const extracted = extractBalancedBraces(c, braceStart);
    if (!extracted) continue;

    // sigPat.lastIndex 를 extracted.end+1 로 앞당겨 다음 함수부터 재탐색
    sigPat.lastIndex = extracted.end + 1;
    const pp = ppRust(pm);

    fs.push({
      name: nm,
      params: pp,
      returnType: (rt || '()').trim(),
      body: extracted.content.trim(),
      lang: 'rust',
    });
  }

  return fs;
}

export function extractGoFunctions(c: string): ExportedFunction[] {
  // 시그니처만 정규식으로 잡고, body는 extractBalancedBraces() 로 추출
  const sigPat = /\/\/export\s+(\w+)\s*\n\s*func\s+(\w+)\s*\(([^)]*)\)\s*(\w+)\s*\{/g;
  const fs: ExportedFunction[] = [];

  let m;
  while ((m = sigPat.exec(c)) !== null) {
    const [fullMatch, en, fn, pm, rt] = m;
    const braceStart = m.index + fullMatch.length - 1; // { 의 위치
    const extracted = extractBalancedBraces(c, braceStart);
    if (!extracted) continue;

    // sigPat.lastIndex 를 extracted.end+1 로 앞당겨 다음 함수부터 재탐색
    sigPat.lastIndex = extracted.end + 1;
    const pp = ppGo(pm);

    fs.push({
      name: fn,
      params: pp,
      returnType: rt.trim(),
      body: extracted.content.trim(),
      lang: 'go',
    });
  }

  return fs;
}

export function extractCFunctions(c: string): ExportedFunction[] {
  // 시그니처만 정규식으로 잡고, body는 extractBalancedBraces() 로 추출
  const sigPat = /(\w+)\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
  const fs: ExportedFunction[] = [];

  let m;
  while ((m = sigPat.exec(c)) !== null) {
    const [fullMatch, rt, nm, pm] = m;
    const braceStart = m.index + fullMatch.length - 1; // { 의 위치
    const extracted = extractBalancedBraces(c, braceStart);
    if (!extracted) continue;

    // sigPat.lastIndex 를 extracted.end+1 로 앞당겨 다음 함수부터 재탐색
    sigPat.lastIndex = extracted.end + 1;
    const pp = ppC(pm);

    fs.push({
      name: nm,
      params: pp,
      returnType: rt.trim(),
      body: extracted.content.trim(),
      lang: 'c',
    });
  }

  return fs;
}

export function extractPythonFunctions(c: string): ExportedFunction[] {
  const p = /def\s+(\w+)\s*\(([^)]*)\):\n((?:\s+[^\n]+\n?)*)/g;
  const fs: ExportedFunction[] = [];

  let m;
  while ((m = p.exec(c)) !== null) {
    const [, nm, pm, bd] = m;
    const pp = ppPy(pm);

    fs.push({
      name: nm,
      params: pp,
      returnType: 'any',
      body: bd.trim(),
      lang: 'python',
    });
  }

  return fs;
}

function ppRust(ps: string): Array<{ name: string; type: string }> {
  if (!ps.trim()) return [];

  return ps.split(',').map(p => {
    const [nm, t] = p.trim().split(':').map(s => s.trim());
    return { name: nm, type: t };
  });
}

function ppGo(ps: string): Array<{ name: string; type: string }> {
  if (!ps.trim()) return [];

  const pts = ps.split(',').map(p => p.trim());
  const r: Array<{ name: string; type: string }> = [];

  for (const p of pts) {
    const ts = p.split(/\s+/);
    if (ts.length >= 2) {
      r.push({
        name: ts[0],
        type: ts.slice(1).join(' '),
      });
    }
  }
  return r;
}

function ppC(ps: string): Array<{ name: string; type: string }> {
  if (!ps.trim()) return [];

  const pts = ps.split(',').map(p => p.trim());
  const r: Array<{ name: string; type: string }> = [];

  for (const p of pts) {
    const ts = p.split(/\s+/);
    if (ts.length >= 2) {
      r.push({
        name: ts[ts.length - 1],
        type: ts.slice(0, -1).join(' '),
      });
    }
  }
  return r;
}

function ppPy(ps: string): Array<{ name: string; type: string }> {
  if (!ps.trim()) return [];

  return ps.split(',').map(p => {
    const colonIdx = p.indexOf(':');
    if (colonIdx !== -1) {
      // x: int 형식 타입 힌트
      const name = p.slice(0, colonIdx).trim();
      const rawType = p.slice(colonIdx + 1).trim();
      return { name, type: rawType || 'any' };
    }
    // name=default 기본값 파라미터
    const eqIdx = p.indexOf('=');
    if (eqIdx !== -1) {
      return { name: p.slice(0, eqIdx).trim(), type: 'any' };
    }
    return { name: p.trim(), type: 'any' };
  });
}
