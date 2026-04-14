/**
 * FreeLang Nexus - 런타임 실행기
 * 생성된 C/Python 코드를 컴파일하고 실행
 */

import { execSync, spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { CodegenResult } from '../codegen/nexus-codegen';
import { DependencyGraph, BuildNode } from './dependency-graph';
import { classifyError, formatBuildError, BuildError } from './build-error';

export interface RunResult {
  cOutput: string;      // C 실행 결과 (stdout)
  pythonOutput: string; // Python 실행 결과 (stdout)
  errors: string[];     // 컴파일/실행 에러 목록
}

export class NexusRunner {
  private ccCache: string | null = null;
  // 결정적 임시 파일명을 위해 프로세스 시작 시 고정 ID + 카운터 사용
  private readonly processStartId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  private tmpFileCounter = 0;

  /**
   * CodegenResult 전체 실행 (C + Python 모두)
   */
  run(result: CodegenResult): RunResult {
    const errors: string[] = [];
    let cOutput = '';
    let pythonOutput = '';

    // 모든 LangBlock이 공유하는 단일 workDir 생성 (링커가 .so 파일들을 찾을 수 있도록)
    const sharedWorkDir = this.tmpFile('_langblocks_shared');
    fs.mkdirSync(sharedWorkDir, { recursive: true });

    // Rust/Go/Julia/LangBlock externLibs 사전 빌드 → linkFlags에 추가
    const extraFlags: string[] = [];
    for (const lib of (result.externLibs || [])) {
      // buildCmd가 있으면 LangBlock → DependencyGraph에서 처리 (아래에서 일괄 처리)
      if (lib.buildCmd && lib.artifact) continue;

      if (lib.lang === 'rust') {
        const alias = lib.alias || this.safeAlias(lib.package);
        const workDir = this.tmpFile('_rust_' + alias);
        const soPath = NexusRunner.buildRustLib(lib.package, alias, workDir);
        if (soPath) {
          extraFlags.push(`-L${path.dirname(soPath)}`, `-l${alias}`);
        } else {
          errors.push(`Rust 빌드 실패: ${lib.package} (cargo build --release)`);
        }
      } else if (lib.lang === 'go') {
        const alias = lib.alias || this.safeAlias(lib.package);
        const workDir = this.tmpFile('_go_' + alias);
        const soPath = NexusRunner.buildGoLib(lib.package, alias, workDir);
        if (soPath) {
          extraFlags.push(`-L${path.dirname(soPath)}`, `-l${alias}`);
        } else {
          errors.push(`Go 빌드 실패: ${lib.package} (go build -buildmode=c-shared)`);
        }
      } else if (lib.lang === 'julia') {
        const juliaCFlags = NexusRunner.getJuliaCFlags();
        const juliaLdFlags = NexusRunner.getJuliaLdFlags();
        extraFlags.push(...juliaCFlags, ...juliaLdFlags);
      }
    }

    // subprocess 언어 사전 확인 (ruby/node/zig/mojo/v - 설치 여부만 체크)
    for (const lib of (result.externLibs || [])) {
      if (['ruby', 'node', 'zig', 'mojo', 'v'].includes(lib.lang)) {
        let cmd = lib.lang;
        if (lib.lang === 'node') cmd = 'node';
        if (lib.lang === 'mojo') cmd = 'mojo';
        if (lib.lang === 'v') cmd = 'v';
        try {
          execSync(`${cmd} --version`, { stdio: 'pipe' });
        } catch (e) {
          errors.push(`${lib.lang} 미설치: ${cmd} --version 실패`);
        }
      }
    }

    // LangBlock 의존성 그래프 구성 및 빌드 (의존성 순서대로)
    const graph = new DependencyGraph();

    for (const lib of (result.externLibs || [])) {
      if (!lib.buildCmd || !lib.artifact) continue; // buildCmd와 artifact가 모두 필요

      const nodeId = lib.artifact.replace(/^lib/, '').replace(/\.so$/, '');
      const node: BuildNode = {
        id: nodeId,
        lang: lib.lang,
        buildCmd: lib.buildCmd,
        artifact: lib.artifact,
        sourceCode: lib.sourceCode,
        sourceName: lib.artifactName,
        cgo: lib.cgo,
        dependsOn: lib.dependsOn || [],
      };
      graph.addNode(node);
    }

    // Topological sort로 빌드 순서 결정
    const sortResult = graph.topologicalSort();
    if ('error' in sortResult) {
      errors.push(`의존성 그래프 오류: ${sortResult.error}`);
    } else {
      // 빌드 순서대로 LangBlock 컴파일
      for (const node of sortResult) {
        let buildCmd = node.buildCmd;

        // Go cgo인 경우, -buildmode=c-shared 추가
        if (node.lang === 'go' && node.cgo && !buildCmd.includes('-buildmode=c-shared')) {
          buildCmd = buildCmd.replace(/^go build/, 'go build -buildmode=c-shared');
        }

        // 소스코드 해시 기반 결정적 workDir 생성 (같은 코드 → 같은 디렉토리)
        let langBlockWorkDir = sharedWorkDir;
        if (node.sourceCode) {
          const srcHash = crypto.createHash('sha256').update(node.sourceCode).digest('hex').substring(0, 12);
          langBlockWorkDir = path.join(sharedWorkDir, `lang_${node.lang}_${srcHash}`);
        }

        const soPath = NexusRunner.buildLangBlock(
          node.lang,
          buildCmd,
          node.artifact,
          langBlockWorkDir,
          node.sourceCode,
          node.sourceName
        );

        if (soPath) {
          const libDir  = path.dirname(soPath);
          const libName = path.basename(soPath).replace(/^lib/, '').replace(/\.(so|a)$/, '');
          extraFlags.push(`-L${libDir}`, `-l${libName}`);
          // Linux(비-Android)에서는 -Wl,-rpath로 런타임 .so 경로 지정
          const isAndroid = process.platform === 'linux' &&
            (process.env.PREFIX || '').includes('com.termux');
          if (!isAndroid && soPath.endsWith('.so')) {
            extraFlags.push(`-Wl,-rpath,${libDir}`);
          }
          // buildCmd에서 추가 시스템 링크 플래그 추출 (-lm, -lpthread 등)
          for (const token of buildCmd.split(/\s+/)) {
            if (token.startsWith('-l') && token !== `-l${libName}` && !extraFlags.includes(token)) {
              extraFlags.push(token);
            }
          }
        } else {
          // P1: 빌드 실패 메시지 개선 (상세는 buildLangBlock 콘솔 출력 참고)
          errors.push(`[${node.lang.toUpperCase()}] 빌드 실패 — 위의 stderr 메시지를 참고하세요`);
        }
      }
    }

    // C 코드 실행 (linkFlags + extraFlags 자동 전달)
    if (result.c && result.c.trim()) {
      try {
        // 결정적 정렬: 같은 flags → 같은 순서
        const allFlags = [...(result.linkFlags || []), ...extraFlags].sort();
        cOutput = this.runC(result.c, allFlags);
      } catch (e) {
        const errorMsg = (e as Error).message;
        const { classification, suggestion } = classifyError('c', errorMsg, 1);
        errors.push(`[C] 컴파일/실행 에러 (${classification}): ${suggestion}`);
      }
    }

    // Python 코드 실행
    if (result.python && result.python.trim()) {
      try {
        pythonOutput = this.runPython(result.python);
      } catch (e) {
        const errorMsg = (e as Error).message;
        const { classification, suggestion } = classifyError('python', errorMsg, 1);
        errors.push(`[Python] 실행 에러 (${classification}): ${suggestion}`);
      }
    }

    return { cOutput, pythonOutput, errors };
  }

  /**
   * C 코드 실행
   * 임시 파일 → 컴파일 → 실행 → 정리
   *
   * @param linkFlags  추가 링크 플래그 (['-lsqlite3', '-lm'] 등)
   */
  runC(cCode: string, linkFlags: string[] = []): string {
    // 결정적: 같은 C 코드 → 같은 파일명
    const cFile = this.tmpFile('.c', cCode);
    const binFile = this.tmpFile('', cCode);

    try {
      // C 코드를 임시 파일에 저장
      fs.writeFileSync(cFile, cCode, 'utf-8');

      // 컴파일 (gcc 또는 clang)
      const cc = this.detectCC();
      // $(python3-config --ldflags) 등을 실제 플래그로 확장
      const resolvedFlags = this.resolveShellFlags(linkFlags);
      // Python.h 필요 시 include 경로 추가
      const hasPython = linkFlags.some(f => f.includes('python3-config'));
      const cflagsExtra = hasPython ? NexusRunner.getPythonCFlags() : [];
      const flagStr = [...cflagsExtra, ...resolvedFlags].join(' ');
      try {
        execSync(`${cc} -o ${binFile} ${cFile} ${flagStr}`, {
          stdio: 'pipe',
          encoding: 'utf-8',
        });
      } catch (e) {
        throw new Error(`컴파일 실패 (${cc}): ${(e as Error).message}`);
      }

      // 바이너리 실행
      const result: SpawnSyncReturns<string> = spawnSync(binFile, [], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      if (result.error) {
        throw new Error(`실행 실패: ${result.error.message}`);
      }

      return result.stdout || '';
    } finally {
      // 임시 파일 정리
      try {
        if (fs.existsSync(cFile)) fs.unlinkSync(cFile);
        if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
      } catch (e) {
        // 정리 실패는 무시
      }
    }
  }

  /**
   * Python 코드 실행
   * 임시 파일 → python3 실행 → 정리
   */
  runPython(pyCode: string): string {
    // 결정적: 같은 Python 코드 → 같은 파일명
    const pyFile = this.tmpFile('.py', pyCode);

    try {
      // Python 코드를 임시 파일에 저장
      fs.writeFileSync(pyFile, pyCode, 'utf-8');

      // python3 실행
      const result: SpawnSyncReturns<string> = spawnSync('python3', [pyFile], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      if (result.error) {
        throw new Error(`Python 실행 실패: ${result.error.message}`);
      }

      return result.stdout || '';
    } finally {
      // 임시 파일 정리
      try {
        if (fs.existsSync(pyFile)) fs.unlinkSync(pyFile);
      } catch (e) {
        // 정리 실패는 무시
      }
    }
  }

  /**
   * $(python3-config --ldflags) 같은 shell expansion 플래그를 실제 값으로 변환
   * 실패 시 해당 플래그를 제외
   */
  private resolveShellFlags(flags: string[]): string[] {
    const result: string[] = [];
    for (const f of flags) {
      if (f.startsWith('$(') && f.endsWith(')')) {
        const cmd = f.slice(2, -1); // 'python3-config --ldflags'
        try {
          // python3-config --ldflags는 --embed 옵션이 있어야 -lpython3.x 포함
          const embedCmd = cmd.includes('python3-config') && cmd.includes('--ldflags')
            ? cmd + ' --embed'
            : cmd;
          let out: string;
          try {
            out = execSync(embedCmd, { stdio: 'pipe', encoding: 'utf-8' }).trim();
          } catch {
            out = execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' }).trim();
          }
          result.push(...out.split(/\s+/).filter(Boolean));
        } catch (e) {
          // 실행 실패 시 해당 플래그 제외
        }
      } else {
        result.push(f);
      }
    }
    return result;
  }

  /**
   * python3 C include 플래그 반환 (Python.h 포함 경로)
   */
  static getPythonCFlags(): string[] {
    try {
      const out = execSync('python3-config --includes', { stdio: 'pipe', encoding: 'utf-8' }).trim();
      return out.split(/\s+/).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  /**
   * julia C include 플래그 반환 (julia.h 포함 경로)
   */
  static getJuliaCFlags(): string[] {
    // 1) julia-config 시도
    try {
      const out = execSync('julia-config --cflags', { stdio: 'pipe', encoding: 'utf-8' }).trim();
      return out.split(/\s+/).filter(Boolean);
    } catch (e) { /* 없으면 직접 탐색 */ }

    // 2) julia --print-home 으로 prefix 탐색
    try {
      const home = execSync('julia --print-home', { stdio: 'pipe', encoding: 'utf-8' }).trim();
      // home = /opt/julia-1.x.x/bin → prefix = /opt/julia-1.x.x
      const prefix = path.dirname(home);
      const inc = path.join(prefix, 'include', 'julia');
      if (fs.existsSync(path.join(inc, 'julia.h'))) {
        return [`-I${inc}`];
      }
    } catch (e) { /* 없으면 하드코딩 탐색 */ }

    // 3) 일반적인 설치 경로 탐색
    const candidates = [
      '/opt/julia/include/julia',
      '/usr/include/julia',
      '/usr/local/include/julia',
    ];
    // /opt/julia-x.x.x 패턴도 탐색
    try {
      const optDirs = fs.readdirSync('/opt').filter(d => d.startsWith('julia'));
      optDirs.forEach(d => candidates.unshift(`/opt/${d}/include/julia`));
    } catch (e) {}

    for (const inc of candidates) {
      if (fs.existsSync(path.join(inc, 'julia.h'))) {
        return [`-I${inc}`];
      }
    }
    return [];
  }

  static getJuliaLdFlags(): string[] {
    // 1) julia-config 시도
    try {
      const out = execSync('julia-config --ldflags --ldlibs', { stdio: 'pipe', encoding: 'utf-8' }).trim();
      return out.split(/\s+/).filter(Boolean);
    } catch (e) {}

    // 2) julia --print-home 으로 prefix 탐색
    try {
      const home = execSync('julia --print-home', { stdio: 'pipe', encoding: 'utf-8' }).trim();
      const prefix = path.dirname(home);
      const lib = path.join(prefix, 'lib');
      if (fs.existsSync(path.join(lib, 'libjulia.so'))) {
        return [`-L${lib}`, '-ljulia', `-Wl,-rpath,${lib}`];
      }
    } catch (e) {}

    // 3) 일반 경로 탐색
    const candidates = ['/opt/julia/lib', '/usr/lib', '/usr/local/lib'];
    try {
      const optDirs = fs.readdirSync('/opt').filter(d => d.startsWith('julia'));
      optDirs.forEach(d => candidates.unshift(`/opt/${d}/lib`));
    } catch (e) {}

    for (const lib of candidates) {
      if (fs.existsSync(path.join(lib, 'libjulia.so'))) {
        return [`-L${lib}`, '-ljulia', `-Wl,-rpath,${lib}`];
      }
    }
    return ['-ljulia'];
  }

  /**
   * Rust 크레이트를 c-shared 라이브러리로 빌드
   * workDir에 Cargo.toml + src/lib.rs 생성 후 cargo build --release
   * 성공 시 .so 경로 반환, 실패 시 null
   */
  static buildRustLib(pkg: string, alias: string, workDir: string): string | null {
    try {
      const cargoToml = `[package]
name = "${alias}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
${pkg} = "*"
`;
      const libRs = `// Auto-generated by FreeLang Nexus
pub use ${alias.replace(/-/g,'_')}::*;
`;
      fs.mkdirSync(path.join(workDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(workDir, 'Cargo.toml'), cargoToml);
      fs.writeFileSync(path.join(workDir, 'src', 'lib.rs'), libRs);
      execSync('cargo build --release', { cwd: workDir, stdio: 'pipe' });
      const soPath = path.join(workDir, 'target', 'release', `lib${alias}.so`);
      if (fs.existsSync(soPath)) return soPath;
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Go 패키지를 c-shared 라이브러리로 빌드
   * workDir에 go.mod + main.go 생성 후 go build -buildmode=c-shared
   * 성공 시 .so 경로 반환, 실패 시 null
   */
  static buildGoLib(pkg: string, alias: string, workDir: string): string | null {
    try {
      const goMod = `module freelang_${alias}
go 1.21
require ${pkg} v0.0.0-00010101000000-000000000000
`;
      const mainGo = `package main

import "C"
import _ "${pkg}"

func main() {}
`;
      fs.mkdirSync(workDir, { recursive: true });
      fs.writeFileSync(path.join(workDir, 'go.mod'), goMod);
      fs.writeFileSync(path.join(workDir, 'main.go'), mainGo);
      const soPath = path.join(workDir, `lib${alias}.so`);
      const hPath = path.join(workDir, `lib${alias}.h`);
      execSync(
        `go build -buildmode=c-shared -o ${soPath} .`,
        { cwd: workDir, stdio: 'pipe' }
      );
      if (fs.existsSync(soPath)) return soPath;
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 다중언어 블록 빌드
   * 사용자가 제공한 소스 코드를 임시 디렉토리에 저장하고 컴파일 명령 실행
   * 성공 시 .so 경로 반환, 실패 시 null
   */
  static buildLangBlock(
    lang: string,
    buildCmd: string,
    artifact: string,
    workDir: string,
    sourceCode?: string,
    sourceName?: string
  ): string | null {
    try {
      fs.mkdirSync(workDir, { recursive: true });

      // 소스 코드가 제공되고 sourceName이 지정되면 파일로 저장
      if (sourceCode && sourceName) {
        const sourceFile = path.join(workDir, sourceName);
        fs.writeFileSync(sourceFile, sourceCode, 'utf-8');
      }

      // C/C++인 경우 Android에서 동적 링크(.so) 불가 → 정적 아카이브(.a)로 빌드
      const isC = ['c', 'cpp', 'c++'].includes(lang.toLowerCase());
      if (isC && sourceName) {
        const srcFile  = path.join(workDir, sourceName);
        const objFile  = path.join(workDir, sourceName.replace(/\.(c|cpp|cc)$/, '.o'));
        const libName  = artifact.replace(/^lib/, '').replace(/\.so$/, '');
        const aFile    = path.join(workDir, `lib${libName}.a`);
        const cc       = lang.toLowerCase() === 'c' ? 'gcc' : 'clang++';
        execSync(`${cc} -c -o ${objFile} ${srcFile}`, { cwd: workDir, stdio: 'pipe' });
        execSync(`ar rcs ${aFile} ${objFile}`, { cwd: workDir, stdio: 'pipe' });
        if (fs.existsSync(aFile)) return aFile;
        return null;
      }

      // 그 외 언어(Rust, Go, Zig 등): 원래 buildCmd 실행
      execSync(buildCmd, { cwd: workDir, stdio: 'pipe' });

      const soPath = path.join(workDir, artifact);
      if (fs.existsSync(soPath)) return soPath;
      return null;
    } catch (e) {
      // P1: 에러 분류 및 제안 (stderr는 제한적으로만 캡처 가능)
      const error = e as any;
      const stderrMsg = error.message || '';
      const exitCode = error.status || 1;

      const { classification, suggestion } = classifyError(lang, stderrMsg, exitCode);

      const buildErr: BuildError = {
        lang,
        command: buildCmd,
        exitCode,
        stderr: stderrMsg,
        classification,
        suggestion
      };

      // 콘솔에 상세 에러 출력
      console.error('\n' + formatBuildError(buildErr) + '\n');

      return null;
    }
  }

  private safeAlias(pkg: string): string {
    const last = pkg.split(/[\/\-\.]/).filter(Boolean).pop() || pkg;
    return last.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * 컴파일러 감지 (gcc 또는 clang)
   * Termux 환경에서는 clang을 기본으로 사용하는 경우가 많음
   */
  private detectCC(): string {
    if (this.ccCache) {
      return this.ccCache;
    }

    // 먼저 gcc 확인
    try {
      execSync('gcc --version', { stdio: 'pipe' });
      this.ccCache = 'gcc';
      return 'gcc';
    } catch (e) {
      // gcc 실패
    }

    // clang 확인
    try {
      execSync('clang --version', { stdio: 'pipe' });
      this.ccCache = 'clang';
      return 'clang';
    } catch (e) {
      // clang 실패
    }

    // 기본값: gcc (찾기 실패해도 시도)
    this.ccCache = 'gcc';
    return 'gcc';
  }

  /**
   * 임시 파일 경로 생성
   * /tmp/nexus_TIMESTAMP.ext 형식
   */
  /**
   * @cgo Go 블록의 //export 심볼 충돌 검증
   * 여러 @cgo Go 블록에서 동일한 심볼을 정의하면 빌드 전에 감지
   *
   * @param astBody - 파서가 생성한 AST 노드 배열
   * @throws {Error} 심볼 충돌이 감지되면 상세 메시지와 함께 발생
   */
  validateExportSymbols(astBody: any[]): void {
    // 심볼 -> 정의된 블록 ID 매핑
    const symbolMap = new Map<string, { blockId: string; artifact?: string; index: number }>();

    // ast.body의 모든 노드를 순회
    for (let blockIndex = 0; blockIndex < astBody.length; blockIndex++) {
      const node = astBody[blockIndex];

      // LangBlock이고 Go 언어이고 @cgo 플래그가 있는 경우만 검증
      if (node && node.type === 'LangBlock' && node.lang === 'go' && node.cgo === true) {
        const sourceCode = node.sourceCode || '';
        const artifact = node.artifact || `go_block_${blockIndex}`;
        const blockId = artifact;

        // //export 심볼 추출 (정규식: //export <symbol_name>)
        // 예: //export compute, //export foo_bar_123
        // 주의: 주석이나 문자열 리터럴 내부 패턴도 감지될 수 있음
        // (완전한 파싱 필요시 Go AST 분석 권장)
        const exportRegex = /(?:^|\s)\/\/\s*export\s+(\w+)/gm;
        let match;

        while ((match = exportRegex.exec(sourceCode)) !== null) {
          const symbol = match[1];

          // 기존에 이 심볼이 정의되었는가?
          if (symbolMap.has(symbol)) {
            const previous = symbolMap.get(symbol)!;
            throw new Error(
              `중복 심볼 '@cgo' 감지:\n` +
                `  심볼명: '${symbol}'\n` +
                `  첫 번째 정의: ${previous.artifact} (블록 #${previous.index})\n` +
                `  두 번째 정의: ${artifact} (블록 #${blockIndex})\n` +
                `\n해결 방법: 각 @cgo 블록마다 고유한 심볼명을 사용하세요.`
            );
          }

          // 심볼 등록
          symbolMap.set(symbol, { blockId, artifact, index: blockIndex });
        }
      }
    }
  }

  /**
   * 결정적 임시 파일 생성
   * @param ext 파일 확장자 (예: '.c', '.py', '')
   * @param content 파일 내용 (있으면 SHA256 해시 기반, 없으면 counter 기반)
   * @returns 임시 파일 경로
   */
  private tmpFile(ext: string, content?: string): string {
    let filenameBase: string;

    if (content) {
      // content hash 기반: 같은 내용 → 같은 파일명
      const contentHash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 12);
      filenameBase = `nexus_${contentHash}`;
    } else {
      // content 없을 때: 프로세스 ID + 증가 카운터로 결정적 생성
      filenameBase = `nexus_${this.processStartId}_${String(this.tmpFileCounter).padStart(4, '0')}`;
      this.tmpFileCounter++;
    }

    return path.join(os.tmpdir(), `${filenameBase}${ext}`);
  }
}
