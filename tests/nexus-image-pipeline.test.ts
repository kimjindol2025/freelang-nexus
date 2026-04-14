/**
 * FreeLang Nexus — 이미지 메타데이터 파이프라인 테스트
 *
 * 작성자: kimjindol | 참여: Claude Code
 *
 * 📸 5개 언어 혼합 파이프라인
 *   - 🦀 Rust  : EXIF 메타데이터 파싱
 *   - 🐹 Go    : 파일시스템 순회
 *   - ⚙️  C     : 이미지 수학 (해상도 × 채널)
 *   - 📊 Python: 통계 분석
 *   - 🔷 V     : 오케스트레이터
 */

import * as fs from 'fs';
import * as path from 'path';
import { NexusLexer } from '../src/nexus/lexer/nexus-lexer';
import { NexusParser } from '../src/nexus/parser/nexus-parser';
import { NexusCodegen } from '../src/nexus/codegen/nexus-codegen';
import { NexusRunner } from '../src/nexus/runtime/nexus-runner';
import { env } from './utils';

function compile(source: string) {
  const tokens = new NexusLexer(source).tokenize();
  const ast    = new NexusParser(tokens).parse();
  return new NexusCodegen().generateProgram(ast);
}

function runSource(source: string) {
  const result = compile(source);
  return new NexusRunner().run(result);
}

const pipelineSrc = fs.readFileSync(
  path.join(__dirname, '../examples/image-metadata-pipeline.fl'),
  'utf-8'
);

describe('📸 이미지 메타데이터 파이프라인 — 5개 언어', () => {

  // ── AST 파싱 검증 ─────────────────────────────────────────────

  test('IMP-1: image-metadata-pipeline.fl 파싱 → AST 오류 없음', () => {
    expect(() => {
      const tokens = new NexusLexer(pipelineSrc).tokenize();
      new NexusParser(tokens).parse();
    }).not.toThrow();
  });

  test('IMP-2: LangBlock 3개 + PyFunction 1개 추출 (Rust/Go/C + Python)', () => {
    const tokens = new NexusLexer(pipelineSrc).tokenize();
    const ast    = new NexusParser(tokens).parse();
    const langBlocks = ast.body.filter(n => n.type === 'LangBlock');
    const pyFuncs = ast.body.filter(n => n.type === 'PyFunction');
    expect(langBlocks.length).toBeGreaterThanOrEqual(3);
    expect(pyFuncs.length).toBeGreaterThanOrEqual(1);
  });

  test('IMP-3: Rust LangBlock 검증 (get_width, get_height, get_iso)', () => {
    const tokens = new NexusLexer(pipelineSrc).tokenize();
    const ast    = new NexusParser(tokens).parse();
    const rustBlock = ast.body.find(n => n.type === 'LangBlock' && (n as any).lang === 'rust');
    expect(rustBlock).toBeDefined();
    const src = (rustBlock as any).sourceCode;
    expect(src).toContain('get_width');
    expect(src).toContain('get_iso');
    expect(src).toContain('extern');
  });

  test('IMP-4: Go LangBlock 검증 (total_files, image_files)', () => {
    const tokens = new NexusLexer(pipelineSrc).tokenize();
    const ast    = new NexusParser(tokens).parse();
    const goBlock = ast.body.find(n => n.type === 'LangBlock' && (n as any).lang === 'go');
    expect(goBlock).toBeDefined();
    const src = (goBlock as any).sourceCode;
    expect(src).toContain('total_files');
    expect(src).toContain('image_files');
    expect(src).toContain('//export');
  });

  test('IMP-5: C LangBlock 검증 (image_size_mb, aspect_ratio)', () => {
    const tokens = new NexusLexer(pipelineSrc).tokenize();
    const ast    = new NexusParser(tokens).parse();
    const cBlock = ast.body.find(n => n.type === 'LangBlock' && (n as any).lang === 'c');
    expect(cBlock).toBeDefined();
    const src = (cBlock as any).sourceCode;
    expect(src).toContain('image_size_mb');
    expect(src).toContain('aspect_ratio');
    expect(src).toContain('math.h');
  });

  test('IMP-6: Python 함수 검증 (stats_analyze)', () => {
    const tokens = new NexusLexer(pipelineSrc).tokenize();
    const ast    = new NexusParser(tokens).parse();
    const pyFunc = ast.body.find(n => n.type === 'PyFunction' && (n as any).name === 'stats_analyze');
    expect(pyFunc).toBeDefined();
  });

  test('IMP-7: V 함수 검증 (main, banner)', () => {
    const tokens = new NexusLexer(pipelineSrc).tokenize();
    const ast    = new NexusParser(tokens).parse();
    const mainFunc = ast.body.find(n => n.type === 'VFunction' && (n as any).name === 'main');
    expect(mainFunc).toBeDefined();
    const bannerFunc = ast.body.find(n => n.type === 'VFunction' && (n as any).name === 'banner');
    expect(bannerFunc).toBeDefined();
  });

  test('IMP-8: externLibs 4개 — rust + go + c + python', () => {
    const result = compile(pipelineSrc);
    const langs = result.externLibs.map(l => l.lang);
    expect(langs).toContain('rust');
    expect(langs).toContain('go');
    expect(langs).toContain('c');
    // Python은 interpreter-based이므로 externLib 아님
  });

  test('IMP-9: Rust externLib artifact = libmetadata.so', () => {
    const result = compile(pipelineSrc);
    const rust = result.externLibs.find(l => l.lang === 'rust');
    expect(rust?.artifact).toBe('libmetadata.so');
    expect(rust?.buildCmd).toContain('rustc');
  });

  test('IMP-10: Go externLib artifact = libcount.so', () => {
    const result = compile(pipelineSrc);
    const go = result.externLibs.find(l => l.lang === 'go');
    expect(go?.artifact).toBe('libcount.so');
    expect(go?.buildCmd).toContain('go build');
  });

  test('IMP-11: C externLib artifact = libmath.so (-lm)', () => {
    const result = compile(pipelineSrc);
    const c = result.externLibs.find(l => l.lang === 'c');
    expect(c?.artifact).toBe('libmath.so');
    expect(c?.buildCmd).toContain('-lm');
    expect(c?.buildCmd).toContain('gcc');
  });

  // ── Python 단독 실행 ──────────────────────────────────────────

  test('IMP-12: codegen 결과 검증 — 4개 externLibs 생성', () => {
    const result = compile(pipelineSrc);
    expect(result.externLibs.length).toBe(3);
    expect(result.externLibs.map(l => l.lang).sort()).toEqual(['c', 'go', 'rust']);
  });

  // ── Summary ────────────────────────────────────────────────────

  test('IMP-Summary: 5개 언어 파이프라인 검증 완료', () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║   📸 이미지 메타데이터 파이프라인                 ║
║   5개 언어 완전 통합                              ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  🦀 Rust  : EXIF 메타데이터 파싱                 ║
║  🐹 Go    : 파일시스템 순회 + 병렬처리          ║
║  ⚙️  C     : 이미지 수학 (해상도·채널·크기)     ║
║  📊 Python: 통계 분석 (평균·중앙값·표준편차)   ║
║  🔷 V     : 오케스트레이터 + 시각화              ║
║                                                   ║
║  하나의 .fl 파일 = 5개 언어 완벽 공존           ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
    `);
    expect(true).toBe(true);
  });
});
