#!/usr/bin/env node

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
  process.exit(1);
}

if (!fs.existsSync(file)) {
  console.error(`Not found: ${file}`);
  process.exit(1);
}

try {
  const src = fs.readFileSync(file, 'utf-8');
  const tok = new NexusLexer(src).tokenize();
  const ast = new NexusParser(tok).parse();
  const tr = transpilePolyglot(ast);
  const uc = generateUnifiedCode(ast, tr);

  const up = path.join(path.dirname(file), 'unified.fl');
  fs.writeFileSync(up, uc, 'utf-8');

  const { execSync } = require('child_process');
  const fcli = process.env.FREELANG_CLI || path.join(process.env.HOME || '', 'freelang-v9', 'dist', 'cli.js');

  if (!fs.existsSync(fcli)) {
    console.error('FreeLang CLI not found');
    process.exit(1);
  }

  execSync(`node ${fcli} run ${up}`, { stdio: 'inherit' });
} catch (e: any) {
  console.error(e.message || String(e));
  process.exit(1);
}
