/**
 * FreeLang Nexus — P5 Day 1.5 실제 재현성 검증
 *
 * 목표: 시뮬레이션이 아닌 실제 빌드·실행으로 재현성 증명
 * 검증: 동일 입력 5회 → 동일한 바이너리 해시 + 동일한 출력
 *
 * 이 테스트는 simulation 기반 P5 Day 1을 실제 실행으로 확장
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import { NexusRunner } from '../src/nexus/runtime/nexus-runner';

function sha256(data: string | Buffer): string {
  if (typeof data === 'string') {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  return crypto.createHash('sha256').update(data).digest('hex');
}

interface RealRun {
  runIndex: number;
  binaryHash: string;    // 실제 빌드된 바이너리 해시
  stdout: string;        // 실제 stdout
  stdoutHash: string;    // stdout 해시
  exitCode: number;
  timeMs: number;
}

function recordRealMetrics(testName: string, runs: RealRun[]): void {
  const times = runs.map(r => r.timeMs);
  const avg = times.reduce((a, b) => a + b) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const deviation = ((max - min) / avg * 100).toFixed(1);

  // 모든 바이너리 해시 동일 확인
  const uniqueBinaryHashes = new Set(runs.map(r => r.binaryHash));
  const allBinariesIdentical = uniqueBinaryHashes.size === 1;

  // 모든 stdout 해시 동일 확인
  const uniqueStdoutHashes = new Set(runs.map(r => r.stdoutHash));
  const allOutputsIdentical = uniqueStdoutHashes.size === 1;

  const report = `
[${testName}]
  Runs: ${runs.length}
  Binary Hash Unique: ${uniqueBinaryHashes.size}/${runs.length} (${allBinariesIdentical ? '✓ 모두 동일' : '✗ 차이 발견'})
  Output Hash Unique: ${uniqueStdoutHashes.size}/${runs.length} (${allOutputsIdentical ? '✓ 모두 동일' : '✗ 차이 발견'})
  Time:
    Average: ${avg.toFixed(0)}ms
    Min: ${min}ms
    Max: ${max}ms
    Deviation: ${deviation}%
  `;

  console.log(report);

  // baseline 확장 (실제 데이터)
  const baselineDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(baselineDir)) {
    fs.mkdirSync(baselineDir, { recursive: true });
  }

  const realMetric = {
    testName,
    mode: 'real-runner',      // ← simulation과 구분
    timestamp: new Date().toISOString(),
    runs: runs.length,
    binaryHashUnique: uniqueBinaryHashes.size,
    allBinariesIdentical,
    outputHashUnique: uniqueStdoutHashes.size,
    allOutputsIdentical,
    avgMs: Math.round(avg),
    minMs: min,
    maxMs: max,
    deviationPercent: parseFloat(deviation),
    sampleBinaryHash: runs[0].binaryHash,
    sampleStdoutHash: runs[0].stdoutHash,
    sampleOutput: runs[0].stdout.substring(0, 100),
  };

  const baselineFile = path.join(baselineDir, 'p5-baseline-real.json');
  const existingData = fs.existsSync(baselineFile)
    ? JSON.parse(fs.readFileSync(baselineFile, 'utf-8'))
    : [];

  existingData.push(realMetric);
  fs.writeFileSync(baselineFile, JSON.stringify(existingData, null, 2));
}

describe('P5 Day 1.5 — 실제 재현성 검증 (Real Runner)', () => {

  describe('Real Compilation & Execution', () => {

    test('RT1: Rust 단일 언어 5회 동일 바이너리 + 출력', () => {
      const rustCode = `
fn add(x: i32, y: i32) -> i32 {
  x + y
}

fn main() {
  let result = add(2, 3);
  println!("Result: {}", result);
}
`;

      const runs: RealRun[] = [];
      const tempDirs: string[] = [];

      try {
        // 5회 반복: 독립적인 임시 디렉토리에서 각각 컴파일
        for (let i = 0; i < 5; i++) {
          const workDir = path.join(__dirname, '..', '.tmp', `p5_rust_run_${i}_${Date.now()}`);
          tempDirs.push(workDir);

          const start = Date.now();

          // 소스 코드 저장
          const sourceFile = path.join(workDir, 'main.rs');
          fs.mkdirSync(workDir, { recursive: true });
          fs.writeFileSync(sourceFile, rustCode, 'utf-8');

          // rustc로 컴파일
          const binaryPath = path.join(workDir, 'main');
          const buildCmd = `rustc -O ${sourceFile} -o ${binaryPath}`;

          execSync(buildCmd, { cwd: workDir, stdio: 'pipe' });

          // 바이너리 해시
          const binaryContent = fs.readFileSync(binaryPath);
          const binaryHash = sha256(binaryContent);

          // 실행
          const execResult = spawnSync(binaryPath, [], { encoding: 'utf-8' });
          const stdout = execResult.stdout || '';
          const stdoutHash = sha256(stdout);
          const exitCode = execResult.status || 0;

          const timeMs = Date.now() - start;

          runs.push({
            runIndex: i,
            binaryHash,
            stdout,
            stdoutHash,
            exitCode,
            timeMs,
          });

          console.log(`  Run ${i + 1}: binary=${binaryHash.substring(0, 12)}... stdout=${stdoutHash.substring(0, 12)}... time=${timeMs}ms`);
        }

        // 검증
        const uniqueBinaries = new Set(runs.map(r => r.binaryHash));
        const uniqueOutputs = new Set(runs.map(r => r.stdoutHash));

        console.log(`\n✓ RT1: 5회 실행 완료`);
        console.log(`  바이너리 해시: ${uniqueBinaries.size}/5 유니크 (${uniqueBinaries.size === 1 ? '✓ 동일' : '✗ 차이'})`);
        console.log(`  출력 해시: ${uniqueOutputs.size}/5 유니크 (${uniqueOutputs.size === 1 ? '✓ 동일' : '✗ 차이'})`);

        // 모든 바이너리와 출력이 동일해야 함
        expect(uniqueBinaries.size).toBe(1);
        expect(uniqueOutputs.size).toBe(1);
        expect(runs[0].stdout).toContain('Result: 5');
        expect(runs[0].exitCode).toBe(0);

        recordRealMetrics('Rust 단일 (RT1)', runs);
      } finally {
        // 임시 디렉토리 정리
        tempDirs.forEach(dir => {
          try {
            fs.rmSync(dir, { recursive: true, force: true });
          } catch (e) {
            // 무시
          }
        });
      }
    });

    test('RT2: Rust + 간단한 함수 호출 5회 동일 결과', () => {
      const rustCode = `
fn multiply(x: i32, y: i32) -> i32 {
  x * y
}

fn main() {
  let a = multiply(3, 4);
  let b = a * 2;
  println!("Result: {}", b);
}
`;

      const runs: RealRun[] = [];
      const tempDirs: string[] = [];

      try {
        for (let i = 0; i < 5; i++) {
          const workDir = path.join(__dirname, '..', '.tmp', `p5_rust_multiply_${i}_${Date.now()}`);
          tempDirs.push(workDir);

          const start = Date.now();

          const sourceFile = path.join(workDir, 'main.rs');
          fs.mkdirSync(workDir, { recursive: true });
          fs.writeFileSync(sourceFile, rustCode, 'utf-8');

          const binaryPath = path.join(workDir, 'main');
          const buildCmd = `rustc -O ${sourceFile} -o ${binaryPath}`;

          execSync(buildCmd, { cwd: workDir, stdio: 'pipe' });

          const binaryContent = fs.readFileSync(binaryPath);
          const binaryHash = sha256(binaryContent);

          const execResult = spawnSync(binaryPath, [], { encoding: 'utf-8' });
          const stdout = execResult.stdout || '';
          const stdoutHash = sha256(stdout);
          const exitCode = execResult.status || 0;

          const timeMs = Date.now() - start;

          runs.push({
            runIndex: i,
            binaryHash,
            stdout,
            stdoutHash,
            exitCode,
            timeMs,
          });
        }

        const uniqueBinaries = new Set(runs.map(r => r.binaryHash));
        const uniqueOutputs = new Set(runs.map(r => r.stdoutHash));

        console.log(`\n✓ RT2: 5회 실행 완료 (결과: 3*4*2=24)`);
        console.log(`  바이너리 해시: ${uniqueBinaries.size}/5 유니크`);
        console.log(`  출력 해시: ${uniqueOutputs.size}/5 유니크`);

        expect(uniqueBinaries.size).toBe(1);
        expect(uniqueOutputs.size).toBe(1);
        expect(runs[0].stdout).toContain('Result: 24');

        recordRealMetrics('Rust 계산 (RT2)', runs);
      } finally {
        tempDirs.forEach(dir => {
          try {
            fs.rmSync(dir, { recursive: true, force: true });
          } catch (e) {
            // 무시
          }
        });
      }
    });

    test('RT3: 실제 stdout/stderr 재현성 3회 확인', () => {
      const rustCode = `
fn main() {
  eprintln!("Debug: starting");
  println!("Output line 1");
  println!("Output line 2");
  eprintln!("Debug: done");
}
`;

      const results: { stdout: string; stderr: string }[] = [];
      const tempDirs: string[] = [];

      try {
        for (let i = 0; i < 3; i++) {
          const workDir = path.join(__dirname, '..', '.tmp', `p5_rust_stderr_${i}_${Date.now()}`);
          tempDirs.push(workDir);

          const sourceFile = path.join(workDir, 'main.rs');
          fs.mkdirSync(workDir, { recursive: true });
          fs.writeFileSync(sourceFile, rustCode, 'utf-8');

          const binaryPath = path.join(workDir, 'main');
          const buildCmd = `rustc -O ${sourceFile} -o ${binaryPath}`;

          execSync(buildCmd, { cwd: workDir, stdio: 'pipe' });

          const execResult = spawnSync(binaryPath, [], { encoding: 'utf-8' });
          results.push({
            stdout: execResult.stdout || '',
            stderr: execResult.stderr || '',
          });
        }

        // 모든 결과 동일 확인
        for (let i = 1; i < results.length; i++) {
          expect(results[i].stdout).toBe(results[0].stdout);
          expect(results[i].stderr).toBe(results[0].stderr);
        }

        console.log(`\n✓ RT3: 3회 stdout/stderr 완전 동일`);
        console.log(`  stdout: "${results[0].stdout.trim()}"`);
        console.log(`  stderr: "${results[0].stderr.trim()}"`);
      } finally {
        tempDirs.forEach(dir => {
          try {
            fs.rmSync(dir, { recursive: true, force: true });
          } catch (e) {
            // 무시
          }
        });
      }
    });
  });

  describe('Reproducibility Closure', () => {

    test('✓ 실제 재현성 증명 완료', () => {
      const baselineFile = path.join(__dirname, '..', 'reports', 'p5-baseline-real.json');
      expect(fs.existsSync(baselineFile)).toBe(true);

      const data = JSON.parse(fs.readFileSync(baselineFile, 'utf-8'));
      expect(data.length).toBeGreaterThan(0);

      // 실제 데이터 검증
      for (const metric of data) {
        expect(metric.mode).toBe('real-runner');
        expect(metric.allBinariesIdentical).toBe(true);
        expect(metric.allOutputsIdentical).toBe(true);
      }

      console.log(`\n✓ P5 Day 1.5 완료: ${data.length}개 실제 재현성 메트릭 기록됨`);
    });

  });
});
