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

describe('Phase 1: Nested Brace Extraction', () => {
  test('Rust multi-statement body with nested braces', () => {
    const code = `
#[no_mangle]
pub extern "C" fn sum_range(from: i32, to: i32) -> i32 {
  let mut total = 0;
  let mut i = from;
  while i <= to {
    total = total + i;
    i = i + 1;
  }
  return total;
}`;
    const funcs = extractRustFunctions(code);
    expect(funcs.length).toBe(1);
    expect(funcs[0].name).toBe('sum_range');
    // body 가 while 블록 전체를 포함하는지 확인
    expect(funcs[0].body).toContain('while i <= to');
    expect(funcs[0].body).toContain('total = total + i');
  });

  test('Go multi-statement body with nested if', () => {
    const code = `
//export fibonacci
func fibonacci(n int) int {
  if n <= 1 {
    return n
  }
  return fibonacci(n - 1) + fibonacci(n - 2)
}`;
    const funcs = extractGoFunctions(code);
    expect(funcs.length).toBe(1);
    expect(funcs[0].name).toBe('fibonacci');
    expect(funcs[0].body).toContain('if n <= 1');
  });

  test('C function with nested for loop', () => {
    const code = `
int power(int x, int n) {
  int result = 1;
  for (int i = 0; i < n; i++) {
    result = result * x;
  }
  return result;
}`;
    const funcs = extractCFunctions(code);
    expect(funcs.length).toBe(1);
    expect(funcs[0].name).toBe('power');
    expect(funcs[0].body).toContain('for (int i = 0');
  });
});

describe('Phase 2: Operators and Control Flow', () => {
  test('&& operator converts to (and)', () => {
    const { generateUnifiedCode } = require('../src/codegen/unified');
    const tr = {
      functions: [{
        name: 'test_logic',
        params: [{ name: 'a', type: 'bool' }, { name: 'b', type: 'bool' }],
        returnType: 'bool',
        body: 'a && b',
        lang: 'rust',
      }],
      vCode: '',
    };
    const c = generateUnifiedCode({}, tr);
    expect(c).toContain('(and');
  });

  test('|| operator converts to (or)', () => {
    const { generateUnifiedCode } = require('../src/codegen/unified');
    const tr = {
      functions: [{
        name: 'test_or',
        params: [{ name: 'a', type: 'bool' }, { name: 'b', type: 'bool' }],
        returnType: 'bool',
        body: 'a || b',
        lang: 'rust',
      }],
      vCode: '',
    };
    const c = generateUnifiedCode({}, tr);
    expect(c).toContain('(or');
  });

  test('% (modulo) operator converts to (mod)', () => {
    const { generateUnifiedCode } = require('../src/codegen/unified');
    const tr = {
      functions: [{
        name: 'is_even',
        params: [{ name: 'n', type: 'i32' }],
        returnType: 'bool',
        body: 'n % 2 == 0',
        lang: 'rust',
      }],
      vCode: '',
    };
    const c = generateUnifiedCode({}, tr);
    expect(c).toContain('(mod');
  });
});

describe('Phase 3: Type System', () => {
  test('Rust Vec<T> maps to list', () => {
    expect(mapType('rust', 'Vec<i32>')).toBe('list');
  });

  test('Rust Option<T> maps to option', () => {
    expect(mapType('rust', 'Option<String>')).toBe('option');
  });

  test('Rust Result<T,E> maps to result', () => {
    expect(mapType('rust', 'Result<i32, Error>')).toBe('result');
  });

  test('C pointer int* maps to ptr', () => {
    expect(mapType('c', 'int*')).toBe('ptr');
  });

  test('C pointer char* maps to string', () => {
    expect(mapType('c', 'char*')).toBe('string');
  });

  test('Go slice []int maps to list', () => {
    expect(mapType('go', '[]int')).toBe('list');
  });

  test('Go map[K]V maps to map', () => {
    expect(mapType('go', 'map[string]int')).toBe('map');
  });

  test('Python list maps to list', () => {
    expect(mapType('python', 'list')).toBe('list');
  });

  test('Python dict maps to map', () => {
    expect(mapType('python', 'dict')).toBe('map');
  });

  test('Python Optional maps to option', () => {
    expect(mapType('python', 'Optional[int]')).toBe('option');
  });
});
