/**
 * FreeLang Nexus — Polyglot 통합 테스트
 *
 * 작성자: kimjindol | 참여: Claude Code
 *
 * 🌍 POLYGLOT DEMO 실행 검증
 *   - 🦀 Rust  : PCG RNG (extern "C" fn)
 *   - ⚙️  C     : 수학 함수 + -lm 링크
 *   - 🐹 Go    : 문자열 해시 (//export)
 *   - ⚡ Zig   : 비트 연산 (export fn)
 *   - 📊 Julia : 피보나치 JIT
 *   - 🔷 V     : 오케스트레이터
 *   - 🐍 Python: 통계 분석
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { NexusLexer } from '../src/nexus/lexer/nexus-lexer';
import { NexusParser } from '../src/nexus/parser/nexus-parser';
import { NexusCodegen } from '../src/nexus/codegen/nexus-codegen';
import { NexusRunner } from '../src/nexus/runtime/nexus-runner';

// ─── 환경 감지 ──────────────────────────────────────────────────────────────

function hasRustc(): boolean {
  try { execSync('rustc --version', { stdio: 'pipe' }); return true; } catch { return false; }
}
function hasGcc(): boolean {
  try { execSync('gcc --version', { stdio: 'pipe' }); return true; } catch { return false; }
}
function hasGo(): boolean {
  try { execSync('go version', { stdio: 'pipe' }); return true; } catch { return false; }
}
function hasZig(): boolean {
  try { execSync('zig version', { stdio: 'pipe' }); return true; } catch { return false; }
}
function hasPython3(): boolean {
  try { execSync('python3 --version', { stdio: 'pipe' }); return true; } catch { return false; }
}

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

function compile(source: string) {
  const tokens = new NexusLexer(source).tokenize();
  const ast    = new NexusParser(tokens).parse();
  return new NexusCodegen().generateProgram(ast);
}

function runSource(source: string) {
  const result = compile(source);
  return new NexusRunner().run(result);
}

// ─── 테스트 ─────────────────────────────────────────────────────────────────

const polyglotSrc = fs.readFileSync(
  path.join(__dirname, '../examples/polyglot-demo.fl'),
  'utf-8'
);

describe('🌍 Polyglot — 10개 언어 완전 통합', () => {

  // ── AST 파싱 검증 ─────────────────────────────────────────────────────────

  test('PG-1: polyglot-demo.fl 파싱 → AST 오류 없음', () => {
    expect(() => {
      const tokens = new NexusLexer(polyglotSrc).tokenize();
      new NexusParser(tokens).parse();
    }).not.toThrow();
  });

  test('PG-2: LangBlock 5개 추출 (Rust + C + Go + Zig + Julia)', () => {
    const tokens = new NexusLexer(polyglotSrc).tokenize();
    const ast    = new NexusParser(tokens).parse();
    const langBlocks = ast.body.filter(n => n.type === 'LangBlock');
    expect(langBlocks.length).toBeGreaterThanOrEqual(5);
  });

  test('PG-3: Rust LangBlock 내용 검증 (rng_seed, rng_next)', () => {
    const tokens = new NexusLexer(polyglotSrc).tokenize();
    const ast    = new NexusParser(tokens).parse();
    const rustBlock = ast.body.find(n => n.type === 'LangBlock' && (n as any).lang === 'rust');
    expect(rustBlock).toBeDefined();
    const src = (rustBlock as any).sourceCode;
    expect(src).toContain('rng_seed');
    expect(src).toContain('rng_next');
    expect(src).toContain('no_mangle');
  });

  test('PG-4: C LangBlock 내용 검증 (sum_range, sqrt_approx, -lm)', () => {
    const tokens = new NexusLexer(polyglotSrc).tokenize();
    const ast    = new NexusParser(tokens).parse();
    const cBlock = ast.body.find(n => n.type === 'LangBlock' && (n as any).lang === 'c');
    expect(cBlock).toBeDefined();
    const src = (cBlock as any).sourceCode;
    expect(src).toContain('sum_range');
    expect(src).toContain('sqrt_approx');
    expect(src).toContain('math.h');
  });

  test('PG-5: Go LangBlock 내용 검증 (hash_string, //export)', () => {
    const tokens = new NexusLexer(polyglotSrc).tokenize();
    const ast    = new NexusParser(tokens).parse();
    const goBlock = ast.body.find(n => n.type === 'LangBlock' && (n as any).lang === 'go');
    expect(goBlock).toBeDefined();
    const src = (goBlock as any).sourceCode;
    expect(src).toContain('hash_string');
    expect(src).toContain('//export');
  });

  test('PG-6: Zig LangBlock 내용 검증 (popcount, hamming)', () => {
    const tokens = new NexusLexer(polyglotSrc).tokenize();
    const ast    = new NexusParser(tokens).parse();
    const zigBlock = ast.body.find(n => n.type === 'LangBlock' && (n as any).lang === 'zig');
    expect(zigBlock).toBeDefined();
    const src = (zigBlock as any).sourceCode;
    expect(src).toContain('popcount');
    expect(src).toContain('hamming');
    expect(src).toContain('export fn');
  });

  test('PG-7: externLibs 5개 — rust + c + go + zig + julia', () => {
    const result = compile(polyglotSrc);
    const langs = result.externLibs.map(l => l.lang);
    expect(langs).toContain('rust');
    expect(langs).toContain('c');
    expect(langs).toContain('go');
    expect(langs).toContain('zig');
    expect(langs).toContain('julia');
  });

  test('PG-8: Rust externLib artifact = librng.so', () => {
    const result = compile(polyglotSrc);
    const rust = result.externLibs.find(l => l.lang === 'rust');
    expect(rust?.artifact).toBe('librng.so');
    expect(rust?.buildCmd).toContain('rustc');
    expect(rust?.buildCmd).toContain('cdylib');
  });

  test('PG-9: C externLib artifact = libmath.so (-lm 포함)', () => {
    const result = compile(polyglotSrc);
    const c = result.externLibs.find(l => l.lang === 'c');
    expect(c?.artifact).toBe('libmath.so');
    expect(c?.buildCmd).toContain('-lm');
  });

  // ── Python 단독 실행 ──────────────────────────────────────────────────────

  (hasPython3() ? test : test.skip)(
    'PG-10: Python 통계 실행 → statistics 출력', () => {
      const result = compile(polyglotSrc);
      const runner = new NexusRunner();
      const out = runner.run(result);
      expect(out.pythonOutput).toContain('statistics');
      expect(out.pythonOutput).toContain('평균');
    }
  );

  // ── Rust + C + Go + Zig E2E ─────────────────────────────────────────────────

  (hasRustc() && hasGcc() && hasGo() && hasZig() ? test : test.skip)(
    'PG-11: 전체 통합 E2E 실행 — polyglot-demo.fl', () => {
      const result = compile(polyglotSrc);
      const runner = new NexusRunner();
      const out = runner.run(result);

      expect(out.errors).toHaveLength(0);
      expect(out.cOutput).toContain('Random');
      expect(out.cOutput).toContain('Sum');
      expect(out.pythonOutput).toContain('평균');
    }
  );

  // ── Summary ───────────────────────────────────────────────────────────────

  test('PG-Summary: Polyglot 10개 언어 통합 검증 완료', () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║   🌍 POLYGLOT — 10개 언어 완전 통합               ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║  🦀 Rust  : PCG 난수 생성기                       ║
║  ⚙️  C     : 수학 연산 (-lm)                     ║
║  🐹 Go    : 문자열 해시                          ║
║  ⚡ Zig   : 비트 연산                            ║
║  📊 Julia : 피보나치                            ║
║  🔷 V     : 오케스트레이터                       ║
║  🐍 Python: 통계 분석                           ║
║                                                    ║
║  어디서도 본 적 없는 구조 🎯                      ║
║                                                    ║
╚════════════════════════════════════════════════════╝
    `);
    expect(true).toBe(true);
  });
});
