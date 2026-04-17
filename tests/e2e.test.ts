import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { NexusLexer } from '../src/parser/nexus-lexer';
import { NexusParser } from '../src/parser/nexus-parser';
import { transpilePolyglot } from '../src/transpiler/main';
import { generateUnifiedCode } from '../src/codegen/unified';

describe('E2E', () => {
  test('hello-nexus2.fl generates valid S-expression', () => {
    const f = path.join(__dirname, '../examples/hello-nexus2.fl');
    const src = fs.readFileSync(f, 'utf-8');
    const tok = new NexusLexer(src).tokenize();
    const ast = new NexusParser(tok).parse();
    const tr = transpilePolyglot(ast);
    const uc = generateUnifiedCode(ast, tr);

    expect(uc).toContain('[FUNC double_it');
    expect(uc).toContain(':params [$x]');
    expect(uc).toContain(':return number');
    expect(uc).toContain(':body (* $x 2)');
    expect(uc).toContain('[FUNC main');
  });

  test('multi-lang.fl generates all language functions', () => {
    const f = path.join(__dirname, '../examples/multi-lang.fl');
    const src = fs.readFileSync(f, 'utf-8');
    const tok = new NexusLexer(src).tokenize();
    const ast = new NexusParser(tok).parse();
    const tr = transpilePolyglot(ast);
    const uc = generateUnifiedCode(ast, tr);

    expect(uc).toContain('[FUNC add');
    expect(uc).toContain('[FUNC multiply');
    expect(uc).toContain('[FUNC greet');
    expect(uc).toContain('[FUNC test');
  });

  test('generated unified.fl syntax is valid S-expression format', () => {
    const f = path.join(__dirname, '../examples/hello-nexus2.fl');
    const src = fs.readFileSync(f, 'utf-8');
    const tok = new NexusLexer(src).tokenize();
    const ast = new NexusParser(tok).parse();
    const tr = transpilePolyglot(ast);
    const uc = generateUnifiedCode(ast, tr);

    expect(uc).toMatch(/\[FUNC \w+/);
    expect(uc).toMatch(/:params \[\$?\w*\]/);
    expect(uc).toMatch(/:body \(/);
    expect(uc).toMatch(/\]/);
  });
});
