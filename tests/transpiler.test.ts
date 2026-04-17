/**
 * FreeLang Nexus 2 — 트랜스파일러 유닛 테스트
 */

import {
  mapType,
  extractRustFunctions,
  extractGoFunctions,
  extractCFunctions,
  extractPythonFunctions,
  generateFlvSignature,
} from '../src/transpiler/base';

describe('Type Mapping', () => {
  test('Rust type mapping', () => {
    expect(mapType('rust', 'i32')).toBe('number');
    expect(mapType('rust', 'i64')).toBe('number');
    expect(mapType('rust', 'f64')).toBe('number');
    expect(mapType('rust', 'bool')).toBe('bool');
    expect(mapType('rust', 'str')).toBe('string');
  });

  test('Go type mapping', () => {
    expect(mapType('go', 'int')).toBe('number');
    expect(mapType('go', 'int64')).toBe('number');
    expect(mapType('go', 'float64')).toBe('number');
    expect(mapType('go', 'bool')).toBe('bool');
    expect(mapType('go', 'string')).toBe('string');
  });

  test('C type mapping', () => {
    expect(mapType('c', 'int')).toBe('number');
    expect(mapType('c', 'double')).toBe('number');
    expect(mapType('c', 'char*')).toBe('string');
    expect(mapType('c', 'void')).toBe('void');
  });

  test('Python type mapping', () => {
    expect(mapType('python', 'int')).toBe('number');
    expect(mapType('python', 'float')).toBe('number');
    expect(mapType('python', 'str')).toBe('string');
  });
});

describe('Function Extraction', () => {
  test('Extract Rust functions', () => {
    const code = `
#[no_mangle]
pub extern "C" fn double_it(x: i32) -> i32 { x * 2 }
    `;
    const funcs = extractRustFunctions(code);
    expect(funcs.length).toBe(1);
    expect(funcs[0].name).toBe('double_it');
    expect(funcs[0].returnType).toBe('i32');
  });

  test('Extract Go functions', () => {
    const code = `
//export hash_value
func hash_value(n int) int { return n * 31 }
    `;
    const funcs = extractGoFunctions(code);
    expect(funcs.length).toBe(1);
    expect(funcs[0].name).toBe('hash_value');
    expect(funcs[0].returnType).toBe('int');
  });

  test('Extract C functions', () => {
    const code = `
int sum_range(int from, int to) {
  int total = 0;
  for (int i = from; i <= to; i++) total += i;
  return total;
}
    `;
    const funcs = extractCFunctions(code);
    expect(funcs.length).toBeGreaterThanOrEqual(1);
  });

  test('Extract Python functions', () => {
    const code = `
def greet(name):
    print("Hello: " + name)
    return len(name)
    `;
    const funcs = extractPythonFunctions(code);
    expect(funcs.length).toBe(1);
    expect(funcs[0].name).toBe('greet');
  });
});

describe('Function Signature Generation', () => {
  test('Generate FL v9 signature from Rust', () => {
    const fn = {
      name: 'add',
      params: [
        { name: 'a', type: 'i32' },
        { name: 'b', type: 'i32' },
      ],
      returnType: 'i32',
      body: 'a + b',
      lang: 'rust',
    };

    const sig = generateFlvSignature(fn);
    expect(sig).toContain('fn add');
    expect(sig).toContain('a: number');
    expect(sig).toContain('b: number');
    expect(sig).toContain('-> number');
  });

  test('Generate FL v9 signature from Go', () => {
    const fn = {
      name: 'hash',
      params: [{ name: 'n', type: 'int' }],
      returnType: 'int',
      body: 'return n * 31',
      lang: 'go',
    };

    const sig = generateFlvSignature(fn);
    expect(sig).toContain('fn hash');
    expect(sig).toContain('n: number');
  });
});
