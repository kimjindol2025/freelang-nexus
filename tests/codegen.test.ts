/**
 * FreeLang Nexus 2 — 코드 생성기 테스트
 */

import { generateUnifiedCode } from '../src/codegen/unified';
import { ExportedFunction } from '../src/transpiler/base';
import { TranspiledResult } from '../src/transpiler/main';

describe('Code Generation', () => {
  test('Generate S-expression function block from Rust', () => {
    const transpiledResult: TranspiledResult = {
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

    const code = generateUnifiedCode({}, transpiledResult);

    expect(code).toContain('[FUNC double_it');
    expect(code).toContain(':params [$x]');
    expect(code).toContain(':return number');
    expect(code).toContain(':body (* $x 2)');
    expect(code).toContain('; [RUST] double_it');
  });

  test('Generate S-expression with multiple functions', () => {
    const transpiledResult: TranspiledResult = {
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

    const code = generateUnifiedCode({}, transpiledResult);

    expect(code).toContain('[FUNC add');
    expect(code).toContain('[FUNC greet');
    expect(code).toContain(':params [$a $b]');
    expect(code).toContain(':params [$name]');
    // greet은 void 함수이므로 greet 블록에 :return이 없어야 함
    const greetBlock = code.substring(code.indexOf('[FUNC greet'), code.indexOf(']', code.indexOf('[FUNC greet')) + 1);
    expect(greetBlock).not.toContain(':return');
  });

  test('Include V orchestrator code', () => {
    const transpiledResult: TranspiledResult = {
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
      ],
      vCode: '(let $result (add 5 7))\n(println $result)',
    };

    const code = generateUnifiedCode({}, transpiledResult);

    expect(code).toContain('(let $result (add 5 7))');
    expect(code).toContain('(println $result)');
  });

  test('Handle void return type correctly', () => {
    const transpiledResult: TranspiledResult = {
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

    const code = generateUnifiedCode({}, transpiledResult);

    // void 함수는 :return을 포함하면 안 됨
    const funcBlock = code.substring(code.indexOf('[FUNC'), code.indexOf(']') + 1);
    expect(funcBlock).not.toContain(':return');
  });
});
