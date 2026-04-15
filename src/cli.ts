#!/usr/bin/env node

/**
 * FreeLang Nexus 2 — 다중언어 → FreeLang v9 트랜스파일러 CLI
 *
 * 사용법:
 *   npm run nexus2 build <file.fl>
 *
 * 예:
 *   npm run nexus2 build examples/hello-nexus2.fl
 */

import * as fs from 'fs';
import * as path from 'path';
import { NexusLexer } from './parser/nexus-lexer';
import { NexusParser } from './parser/nexus-parser';
import { transpilePolyglot } from './transpiler/main';
import { generateUnifiedCode } from './codegen/unified';

const [,, cmd, file] = process.argv;

if (!cmd || !file) {
  console.log('Usage: nexus2 build <file.fl>');
  process.exit(1);
}

if (cmd !== 'build') {
  console.error(`Unknown command: ${cmd}`);
  console.log('Usage: nexus2 build <file.fl>');
  process.exit(1);
}

// 파일 존재 확인
if (!fs.existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

try {
  console.error(`[Nexus 2] Parsing ${path.basename(file)}...`);

  // 1. 소스 파일 읽기
  const source = fs.readFileSync(file, 'utf-8');

  // 2. 렉싱
  const tokens = new NexusLexer(source).tokenize();

  // 3. 파싱
  const ast = new NexusParser(tokens).parse();

  // 4. 다중언어 블록 추출 및 트랜스파일
  console.error('[Nexus 2] Transpiling language blocks...');
  const transpiledFunctions = transpilePolyglot(ast);

  // 5. 통합 FreeLang v9 코드 생성
  console.error('[Nexus 2] Generating unified FreeLang v9 code...');
  const unifiedCode = generateUnifiedCode(ast, transpiledFunctions);

  // 6. unified.fl 파일로 저장
  const unifiedPath = path.join(path.dirname(file), 'unified.fl');
  fs.writeFileSync(unifiedPath, unifiedCode, 'utf-8');
  console.error(`[Nexus 2] Generated: ${unifiedPath}`);

  // 7. FreeLang v9 런타임으로 실행
  const { execSync } = require('child_process');
  const freelangCli = process.env.FREELANG_CLI ||
    path.join(process.env.HOME || '', 'freelang-v9', 'dist', 'cli.js');

  if (!fs.existsSync(freelangCli)) {
    console.error('[Nexus 2] FreeLang v9 CLI not found');
    console.error(`  Set FREELANG_CLI environment variable or install FreeLang v9`);
    process.exit(1);
  }

  console.error(`[Nexus 2] Running with FreeLang v9...`);
  execSync(`node ${freelangCli} run ${unifiedPath}`, { stdio: 'inherit' });

} catch (error: any) {
  console.error('[Nexus 2] Error:');
  console.error(error.message || String(error));
  process.exit(1);
}
