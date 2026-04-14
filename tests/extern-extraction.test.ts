/**
 * FreeLang Nexus — Extern Extraction P3 검증
 *
 * P3: Extern Extraction Completeness
 * 목표: Mojo/V extern 추출 완성 + 미지원 언어 정직화
 */

import { NexusCodegen } from '../src/nexus/codegen/nexus-codegen';
import * as AST from '../src/nexus/parser/ast';

describe('P3 — Extern Extraction Completeness', () => {

  function createProgram(...blocks: AST.LangBlock[]): AST.Program {
    return { body: blocks, type: 'Program' };
  }

  function createMojoBlock(sourceCode: string): AST.LangBlock {
    return {
      type: 'LangBlock',
      lang: 'mojo',
      sourceCode,
      compileCmd: 'mojo build',
      artifact: 'libmojo.so',
      mode: 'v',
      line: 1,
      column: 1,
    };
  }

  function createVBlock(sourceCode: string): AST.LangBlock {
    return {
      type: 'LangBlock',
      lang: 'v',
      sourceCode,
      compileCmd: 'v build',
      artifact: 'libv.so',
      mode: 'v',
      line: 1,
      column: 1,
    };
  }

  function createLangBlock(lang: string, sourceCode: string): AST.LangBlock {
    return {
      type: 'LangBlock',
      lang,
      sourceCode,
      compileCmd: `${lang} build`,
      mode: 'v',
      line: 1,
      column: 1,
    };
  }

  describe('Mojo extern 자동 추출', () => {

    test('E1: Mojo @export 함수 추출 (기본)', () => {
      const block = createMojoBlock(`
        @export
        fn add(x: Int32, y: Int32) -> Int32 {
          return x + y
        }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern int add(int x, int y);');
    });

    test('E2: Mojo Float32/Float64 타입 매핑', () => {
      const block = createMojoBlock(`
        @export
        fn multiply(x: Float32, y: Float64) -> Float64 {
          return x * y
        }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern double multiply(float x, double y);');
    });

    test('E3: Mojo UInt64/Int64 타입', () => {
      const block = createMojoBlock(`
        @export
        fn big_num(val: UInt64) -> Int64 {
          return val as Int64
        }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern long long big_num(unsigned long long val);');
    });

    test('E4: Mojo 여러 @export 함수', () => {
      const block = createMojoBlock(`
        @export
        fn foo(x: Int32) -> Int32 { return x }

        @export
        fn bar(x: Float32) -> Float32 { return x }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern int foo(int x);');
      expect(result.c).toContain('extern float bar(float x);');
    });

    test('E5: Mojo Bool 타입 → int', () => {
      const block = createMojoBlock(`
        @export
        fn is_valid() -> Bool {
          return True
        }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern int is_valid(void);');
    });
  });

  describe('V 언어 extern 자동 추출', () => {

    test('E6: V pub fn 함수 추출 (기본)', () => {
      const block = createVBlock(`
        pub fn add(x i32, y i32) i32 {
          return x + y
        }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern int add(int x, int y);');
    });

    test('E7: V u64 타입 매핑', () => {
      const block = createVBlock(`
        pub fn get_id() u64 {
          return 12345
        }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern unsigned long long get_id(void);');
    });

    test('E8: V f64 타입 매핑', () => {
      const block = createVBlock(`
        pub fn sqrt_calc(x f64) f64 {
          return x * x
        }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern double sqrt_calc(double x);');
    });

    test('E9: V bool 타입 → int', () => {
      const block = createVBlock(`
        pub fn is_alive() bool {
          return true
        }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern int is_alive(void);');
    });

    test('E10: V 여러 pub fn 함수', () => {
      const block = createVBlock(`
        pub fn first(x i32) i32 { return x }
        pub fn second(y u32) u32 { return y }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern int first(int x);');
      expect(result.c).toContain('extern unsigned int second(unsigned int y);');
    });
  });

  describe('미지원 언어 경고', () => {

    test('E11: Julia 블록은 경고만 발생', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const block = createLangBlock('julia', 'function add(x, y) return x + y end');
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      codegen.generate(program);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('julia extern 자동 추출 미지원')
      );
      consoleWarnSpy.mockRestore();
    });

    test('E12: Haskell 블록은 경고만 발생', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const block = createLangBlock('haskell', 'add x y = x + y');
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      codegen.generate(program);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('haskell extern 자동 추출 미지원')
      );
      consoleWarnSpy.mockRestore();
    });

    test('E13: Kotlin 블록은 경고만 발생', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const block = createLangBlock('kotlin', 'fun add(x: Int, y: Int): Int = x + y');
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      codegen.generate(program);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('kotlin extern 자동 추출 미지원')
      );
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Type 매핑 일관성', () => {

    test('E14: Mojo 모든 기본 타입 매핑', () => {
      const types: Array<[string, string]> = [
        ['UInt8', 'unsigned char'],
        ['Int32', 'int'],
        ['Int64', 'long long'],
        ['Float64', 'double'],
      ];

      for (const [mojoType, cType] of types) {
        const block = createMojoBlock(`
          @export
          fn test() -> ${mojoType} { return 0 }
        `);
        const program = createProgram(block);
        const codegen = new NexusCodegen();
        const result = codegen.generate(program);
        expect(result.c).toContain(`${cType} test(void)`);
      }
    });

    test('E15: V 모든 기본 타입 매핑', () => {
      const types: Array<[string, string]> = [
        ['u8', 'unsigned char'],
        ['i32', 'int'],
        ['u64', 'unsigned long long'],
        ['f64', 'double'],
      ];

      for (const [vType, cType] of types) {
        const block = createVBlock(`
          pub fn test() ${vType} {
            return 0
          }
        `);
        const program = createProgram(block);
        const codegen = new NexusCodegen();
        const result = codegen.generate(program);
        expect(result.c).toContain(`${cType} test(void)`);
      }
    });
  });

  describe('P3 완료 기준', () => {

    test('✓ Mojo 자동 extern 지원', () => {
      const block = createMojoBlock(`
        @export
        fn complex_op(a: Int32, b: Float64) -> Float32 {
          return (a + b) as Float32
        }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern float complex_op(int a, double b);');
    });

    test('✓ V 자동 extern 지원', () => {
      const block = createVBlock(`
        pub fn complex_op(a i32, b f64) f32 {
          return (a + b) as f32
        }
      `);
      const program = createProgram(block);
      const codegen = new NexusCodegen();
      const result = codegen.generate(program);
      expect(result.c).toContain('extern float complex_op(int a, double b);');
    });

    test('✓ 지원 범위 명확화', () => {
      const supported = ['mojo', 'v'];
      const unsupported = ['julia', 'haskell', 'clojure', 'kotlin'];

      for (const lang of supported) {
        const block = createLangBlock(lang, 'test code');
        const program = createProgram(block);
        const codegen = new NexusCodegen();
        const result = codegen.generate(program);
        expect(result).toBeDefined();
      }

      for (const lang of unsupported) {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const block = createLangBlock(lang, 'test code');
        const program = createProgram(block);
        const codegen = new NexusCodegen();
        codegen.generate(program);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('미지원')
        );
        consoleWarnSpy.mockRestore();
      }
    });

    test('✓ Mojo/V 타입 체인 일관성', () => {
      const mojoBlock = createMojoBlock(`
        @export
        fn process(x: Int32) -> Int32 { return x }
      `);
      const vBlock = createVBlock(`
        pub fn process(x i32) i32 { return x }
      `);

      const mojoProgram = createProgram(mojoBlock);
      const vProgram = createProgram(vBlock);

      const mojoCodgen = new NexusCodegen();
      const mojoResult = mojoCodgen.generate(mojoProgram);

      const vCodegen = new NexusCodegen();
      const vResult = vCodegen.generate(vProgram);

      expect(mojoResult.c).toContain('int process(int x)');
      expect(vResult.c).toContain('int process(int x)');
    });
  });
});
