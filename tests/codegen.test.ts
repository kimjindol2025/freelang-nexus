import { generateUnifiedCode } from '../src/codegen/unified';
import { ExportedFunction } from '../src/transpiler/base';
import { TranspiledResult } from '../src/transpiler/main';

describe('Code Generation', () => {
  test('Generate S-expression function block from Rust', () => {
    const tr: TranspiledResult = {
      functions: [
        {
          name: 'double_it',
          params: [{ name: 'x', type: 'i32' }],
          returnType: 'i32',
          body: 'x * 2',
          lang: 'rust',
        } as ExportedFunction,
      ],
      vCode: '',
    };

    const c = generateUnifiedCode({}, tr);

    expect(c).toContain('[FUNC double_it');
    expect(c).toContain(':params [$x]');
    expect(c).toContain(':return number');
    expect(c).toContain(':body (* $x 2)');
  });

  test('Generate S-expression with multiple functions', () => {
    const tr: TranspiledResult = {
      functions: [
        {
          name: 'add',
          params: [
            { name: 'a', type: 'i32' },
            { name: 'b', type: 'i32' },
          ],
          returnType: 'i32',
          body: 'a + b',
          lang: 'rust',
        } as ExportedFunction,
        {
          name: 'greet',
          params: [{ name: 'name', type: 'str' }],
          returnType: 'void',
          body: 'println("Hello")',
          lang: 'python',
        } as ExportedFunction,
      ],
      vCode: '',
    };

    const c = generateUnifiedCode({}, tr);

    expect(c).toContain('[FUNC add');
    expect(c).toContain('[FUNC greet');
    expect(c).toContain(':params [$a $b]');
    expect(c).toContain(':params [$name]');
    const gb = c.substring(c.indexOf('[FUNC greet'), c.indexOf(']', c.indexOf('[FUNC greet')) + 1);
    expect(gb).not.toContain(':return');
  });

  test('Handle void return type correctly', () => {
    const tr: TranspiledResult = {
      functions: [
        {
          name: 'print_msg',
          params: [{ name: 'msg', type: 'str' }],
          returnType: 'void',
          body: 'println(msg)',
          lang: 'c',
        } as ExportedFunction,
      ],
      vCode: '',
    };

    const c = generateUnifiedCode({}, tr);

    const fb = c.substring(c.indexOf('[FUNC'), c.indexOf(']') + 1);
    expect(fb).not.toContain(':return');
  });
});
