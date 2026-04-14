/**
 * FreeLang Nexus — Parallel Failure Isolation P4 검증
 *
 * P4: Parallel Failure Isolation
 * 목표: 병렬 빌드에서 직접 실패와 전파 실패를 구분하고, 언어별 로그를 격리
 */

import { FailureAnalyzer } from '../src/nexus/runtime/failure-analyzer';

describe('P4 — Parallel Failure Isolation', () => {

  describe('Basic Failure Tracking', () => {

    test('F1: 단일 직접 실패 (Rust 문법 에러)', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#libcore.so', 'rust', 'libcore.so', []);
      analyzer.updateJobStatus('rust#libcore.so', 'running');
      analyzer.updateJobOutput(
        'rust#libcore.so',
        '',
        'error: expected `;`, found `}`',
        'rustc --crate-type cdylib ...'
      );
      analyzer.updateJobStatus('rust#libcore.so', 'failed', 1);

      const analysis = analyzer.analyzeFailures();
      expect(analysis.directFailures.length).toBe(1);
      expect(analysis.directFailures[0].lang).toBe('rust');
      expect(analysis.propagatedFailures.length).toBe(0);
    });

    test('F2: 성공 (모든 job success)', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#libcore.so', 'rust', 'libcore.so', []);
      analyzer.updateJobStatus('rust#libcore.so', 'running');
      analyzer.updateJobOutput('rust#libcore.so', 'Compiling...', '', 'rustc ...');
      analyzer.updateJobStatus('rust#libcore.so', 'success');

      const analysis = analyzer.analyzeFailures();
      expect(analysis.hasFailures).toBe(false);
      expect(analysis.successful.length).toBe(1);
      expect(analysis.directFailures.length).toBe(0);

      const report = analyzer.formatFailureReport();
      expect(report).toContain('All jobs completed successfully');
    });

    test('F3: 경고 있음 (stderr 있으나 exitCode 0)', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#libcore.so', 'rust', 'libcore.so', []);
      analyzer.updateJobStatus('rust#libcore.so', 'running');
      analyzer.updateJobOutput(
        'rust#libcore.so',
        'Compiling...',
        'warning: unused variable',
        'rustc ...'
      );
      analyzer.updateJobStatus('rust#libcore.so', 'success');

      const analysis = analyzer.analyzeFailures();
      expect(analysis.hasFailures).toBe(false);
      expect(analysis.successful.length).toBe(1);
    });
  });

  describe('Propagated Failure', () => {

    test('F4: 1 direct + 1 propagated (Go 실패 → Link 실패)', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('go#libhash.so', 'go', 'libhash.so', []);
      analyzer.registerJob('link#binary', 'link', 'binary', ['go#libhash.so']);

      analyzer.updateJobStatus('go#libhash.so', 'running');
      analyzer.updateJobOutput(
        'go#libhash.so',
        '',
        'ld: cannot find -lfoo',
        'go build -buildmode=c-shared ...'
      );
      analyzer.updateJobStatus('go#libhash.so', 'failed', 1);

      analyzer.setJobStatus('link#binary', 'skipped');

      const analysis = analyzer.analyzeFailures();
      expect(analysis.directFailures.length).toBe(1);
      expect(analysis.directFailures[0].lang).toBe('go');
      expect(analysis.skipped.length).toBe(1);
      expect(analysis.skipped[0].lang).toBe('link');
    });

    test('F5: Chain 전파 (Rust 실패 → Link 실패 → Python 실패)', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#libcore.so', 'rust', 'libcore.so', []);
      analyzer.registerJob('link#binary', 'link', 'binary', ['rust#libcore.so']);
      analyzer.registerJob('python#analyze', 'python', undefined, ['link#binary']);

      analyzer.updateJobStatus('rust#libcore.so', 'running');
      analyzer.updateJobOutput('rust#libcore.so', '', 'error[E0425]', 'rustc ...');
      analyzer.updateJobStatus('rust#libcore.so', 'failed', 1);

      analyzer.setJobStatus('link#binary', 'skipped');
      analyzer.setJobStatus('python#analyze', 'skipped');

      const analysis = analyzer.analyzeFailures();
      expect(analysis.directFailures.length).toBe(1);
      expect(analysis.skipped.length).toBe(2);
    });

    test('F6: 2개 독립 실패 (Rust + Go 동시)', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#libcore.so', 'rust', 'libcore.so', []);
      analyzer.registerJob('go#libhash.so', 'go', 'libhash.so', []);

      analyzer.updateJobStatus('rust#libcore.so', 'running');
      analyzer.updateJobOutput('rust#libcore.so', '', 'error', 'rustc ...');
      analyzer.updateJobStatus('rust#libcore.so', 'failed', 1);

      analyzer.updateJobStatus('go#libhash.so', 'running');
      analyzer.updateJobOutput('go#libhash.so', '', 'undefined', 'go build ...');
      analyzer.updateJobStatus('go#libhash.so', 'failed', 1);

      const analysis = analyzer.analyzeFailures();
      expect(analysis.directFailures.length).toBe(2);
      expect(analysis.directFailures.map((j) => j.lang).sort()).toEqual(['go', 'rust']);
    });
  });

  describe('Failure Graph Tracking', () => {

    test('F7: 의존성 그래프 구성 (A→B→C)', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#liba.so', 'rust', 'liba.so', []);
      analyzer.registerJob('go#libb.so', 'go', 'libb.so', ['rust#liba.so']);
      analyzer.registerJob('c#libc.so', 'c', 'libc.so', ['go#libb.so']);

      analyzer.updateJobStatus('rust#liba.so', 'running');
      analyzer.updateJobOutput('rust#liba.so', '', 'error', 'rustc ...');
      analyzer.updateJobStatus('rust#liba.so', 'failed', 1);

      analyzer.setJobStatus('go#libb.so', 'skipped');
      analyzer.setJobStatus('c#libc.so', 'skipped');

      const analysis = analyzer.analyzeFailures();
      const graph = analysis.failureGraph;

      expect(graph['rust#liba.so']).toContain('go#libb.so');
      expect(graph['go#libb.so']).toContain('c#libc.so');
    });

    test('F8: 복잡 의존성 (A→B, A→C, B→D)', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('a#liba.so', 'rust', 'liba.so', []);
      analyzer.registerJob('b#libb.so', 'go', 'libb.so', ['a#liba.so']);
      analyzer.registerJob('c#libc.so', 'zig', 'libc.so', ['a#liba.so']);
      analyzer.registerJob('d#libd.so', 'c', 'libd.so', ['b#libb.so']);

      analyzer.updateJobStatus('a#liba.so', 'running');
      analyzer.updateJobOutput('a#liba.so', '', 'error', 'rustc ...');
      analyzer.updateJobStatus('a#liba.so', 'failed', 1);

      analyzer.setJobStatus('b#libb.so', 'skipped');
      analyzer.setJobStatus('c#libc.so', 'skipped');
      analyzer.setJobStatus('d#libd.so', 'skipped');

      const analysis = analyzer.analyzeFailures();
      const graph = analysis.failureGraph;

      expect(graph['a#liba.so']).toContain('b#libb.so');
      expect(graph['a#liba.so']).toContain('c#libc.so');
      expect(graph['b#libb.so']).toContain('d#libd.so');
    });
  });

  describe('Log Isolation', () => {

    test('F9: 언어별 로그 분리 ([Rust], [Go], [Link])', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#libcore.so', 'rust', 'libcore.so', []);
      analyzer.registerJob('go#libhash.so', 'go', 'libhash.so', []);
      analyzer.registerJob('link#binary', 'link', 'binary', ['rust#libcore.so', 'go#libhash.so']);

      analyzer.updateJobStatus('rust#libcore.so', 'running');
      analyzer.updateJobOutput('rust#libcore.so', '', 'rustc error line 1\nrustc error line 2', 'rustc ...');
      analyzer.updateJobStatus('rust#libcore.so', 'failed', 1);

      analyzer.updateJobStatus('go#libhash.so', 'running');
      analyzer.updateJobOutput('go#libhash.so', '', 'go error line 1', 'go build ...');
      analyzer.updateJobStatus('go#libhash.so', 'failed', 1);

      analyzer.setJobStatus('link#binary', 'skipped');

      const report = analyzer.formatFailureReport();
      expect(report).toContain('[Rust]');
      expect(report).toContain('[Go]');
      expect(report).toContain('rustc error line 1');
      expect(report).toContain('go error line 1');
    });

    test('F10: 로그 순서 결정성', () => {
      const makeAnalyzer = () => {
        const analyzer = new FailureAnalyzer();

        analyzer.registerJob('rust#libcore.so', 'rust', 'libcore.so', []);
        analyzer.registerJob('go#libhash.so', 'go', 'libhash.so', []);

        analyzer.updateJobStatus('rust#libcore.so', 'running');
        analyzer.updateJobOutput('rust#libcore.so', '', 'rustc error', 'rustc ...');
        analyzer.updateJobStatus('rust#libcore.so', 'failed', 1);

        analyzer.updateJobStatus('go#libhash.so', 'running');
        analyzer.updateJobOutput('go#libhash.so', '', 'go error', 'go build ...');
        analyzer.updateJobStatus('go#libhash.so', 'failed', 1);

        return analyzer.formatFailureReport();
      };

      const report1 = makeAnalyzer();
      const report2 = makeAnalyzer();
      expect(report1).toBe(report2);
    });
  });

  describe('Failure Message Quality', () => {

    test('F11: 직접 실패 메시지 (Go linker error)', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('go#libhash.so', 'go', 'libhash.so', []);
      analyzer.updateJobStatus('go#libhash.so', 'running');
      analyzer.updateJobOutput(
        'go#libhash.so',
        '',
        'ld: cannot find -lfoo\nld: cannot find -lbar',
        'go build -buildmode=c-shared -o libhash.so .'
      );
      analyzer.updateJobStatus('go#libhash.so', 'failed', 1);

      const report = analyzer.formatFailureReport();
      expect(report).toContain('Direct failure:');
      expect(report).toContain('[Go]');
      expect(report).toContain('go build -buildmode=c-shared');
      expect(report).toContain('ld: cannot find -lfoo');
    });

    test('F12: 전파 실패 메시지', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('go#libhash.so', 'go', 'libhash.so', []);
      analyzer.registerJob('link#binary', 'link', 'binary', ['go#libhash.so']);

      analyzer.updateJobStatus('go#libhash.so', 'running');
      analyzer.updateJobOutput('go#libhash.so', '', 'error', 'go build ...');
      analyzer.updateJobStatus('go#libhash.so', 'failed', 1);

      analyzer.setJobStatus('link#binary', 'skipped');

      const report = analyzer.formatFailureReport();
      expect(report).toContain('Skipped jobs:');
      expect(report).toContain('[Link]');
      expect(report).toContain('not reached');
    });
  });

  describe('Edge Cases', () => {

    test('F13: Timeout/signal 처리', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#libcore.so', 'rust', 'libcore.so', []);
      analyzer.updateJobStatus('rust#libcore.so', 'running');
      analyzer.updateJobOutput('rust#libcore.so', '', 'signal: killed', 'rustc ...');
      analyzer.updateJobStatus('rust#libcore.so', 'failed', 137);

      const analysis = analyzer.analyzeFailures();
      expect(analysis.directFailures[0].exitCode).toBe(137);
    });

    test('F14: 빈 dependency (standalone 언어)', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('python#analyze', 'python', undefined, []);
      analyzer.updateJobStatus('python#analyze', 'running');
      analyzer.updateJobOutput('python#analyze', 'output', '', 'python analyze.py');
      analyzer.updateJobStatus('python#analyze', 'success');

      const analysis = analyzer.analyzeFailures();
      expect(analysis.successful.length).toBe(1);
      expect(analysis.directFailures.length).toBe(0);
    });

    test('F15: 빈 stderr', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#libcore.so', 'rust', 'libcore.so', []);
      analyzer.updateJobStatus('rust#libcore.so', 'running');
      analyzer.updateJobOutput('rust#libcore.so', 'stdout output', '', 'rustc ...');
      analyzer.updateJobStatus('rust#libcore.so', 'failed', 1);

      const report = analyzer.formatFailureReport();
      expect(report).toContain('Direct failure');
    });
  });

  describe('P4 완료 기준', () => {

    test('✓ 모든 상태 추적 가능', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#liba.so', 'rust', 'liba.so', []);
      analyzer.registerJob('go#libb.so', 'go', 'libb.so', ['rust#liba.so']);
      analyzer.registerJob('zig#libc.so', 'zig', 'libc.so', ['rust#liba.so']);

      analyzer.updateJobStatus('rust#liba.so', 'running');
      analyzer.updateJobStatus('rust#liba.so', 'failed', 1);
      analyzer.setJobStatus('go#libb.so', 'skipped');
      analyzer.updateJobStatus('zig#libc.so', 'success');

      const analysis = analyzer.analyzeFailures();
      expect(analysis.directFailures.length).toBe(1);
      expect(analysis.skipped.length).toBe(1);
      expect(analysis.successful.length).toBe(1);
    });

    test('✓ 직접/전파 실패 명확 구분', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('a#liba.so', 'rust', 'liba.so', []);
      analyzer.registerJob('b#libb.so', 'go', 'libb.so', ['a#liba.so']);

      analyzer.updateJobStatus('a#liba.so', 'running');
      analyzer.updateJobOutput('a#liba.so', '', 'error', 'rustc ...');
      analyzer.updateJobStatus('a#liba.so', 'failed', 1);

      analyzer.setJobStatus('b#libb.so', 'skipped');

      const analysis = analyzer.analyzeFailures();
      expect(analysis.directFailures.length).toBe(1);
      expect(analysis.directFailures[0].lang).toBe('rust');

      const report = analyzer.formatFailureReport();
      expect(report).toContain('Direct failure:');
      expect(report).toContain('[Rust]');
    });

    test('✓ 사용자 리포트 형식 명확', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#liba.so', 'rust', 'liba.so', []);
      analyzer.registerJob('link#binary', 'link', 'binary', ['rust#liba.so']);

      analyzer.updateJobStatus('rust#liba.so', 'running');
      analyzer.updateJobOutput('rust#liba.so', '', 'error[E0425]', 'rustc ...');
      analyzer.updateJobStatus('rust#liba.so', 'failed', 1);

      analyzer.setJobStatus('link#binary', 'skipped');

      const report = analyzer.formatFailureReport();

      expect(report).toContain('✗ Build failed.');
      expect(report).toContain('Direct failure:');
      expect(report).toContain('[Rust]');
      expect(report).toContain('Exit code:');
      expect(report).toContain('Logs:');
    });

    test('✓ Job 조회 API 동작', () => {
      const analyzer = new FailureAnalyzer();

      analyzer.registerJob('rust#liba.so', 'rust', 'liba.so', []);
      analyzer.updateJobStatus('rust#liba.so', 'running');
      analyzer.updateJobOutput('rust#liba.so', '', '', 'rustc ...');
      analyzer.updateJobStatus('rust#liba.so', 'success');

      const job = analyzer.getJob('rust#liba.so');
      expect(job).toBeDefined();
      expect(job?.status).toBe('success');

      const allJobs = analyzer.getAllJobs();
      expect(allJobs.length).toBe(1);
    });
  });
});
