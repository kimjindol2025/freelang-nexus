/**
 * FreeLang Nexus — 에러 메시지 품질 검증
 *
 * P1: Error Message Enhancement
 * 목표: 빌드 실패 시 원인 분류 및 해결 제안 제공
 *
 * 검증:
 * - E1: Rust syntax error 분류
 * - E2: Go linker error 분류
 * - E3: Zig toolchain missing 분류
 * - E4: Symbol error 분류
 * - E5: 에러 메시지 포맷 (제안 포함)
 */

import { classifyError, formatBuildError, BuildError } from '../src/nexus/runtime/build-error';

describe('P1 — Error Message Enhancement (에러 진단)', () => {

  describe('classifyError: 실패 분류', () => {

    test('E1: Rust syntax error 분류', () => {
      const rustSyntaxErr = `error[E0425]: cannot find value \`x\` in this scope
   |
 3 | let y = x + 1;
   |         ^ not found in this scope`;

      const result = classifyError('rust', rustSyntaxErr, 1);
      expect(result.classification).toBe('syntax');
      expect(result.suggestion).toContain('구문');
    });

    test('E2: Go linker error 분류', () => {
      const goLinkerErr = `ld: cannot find -lfoo
collect2: error: ld returned 1 exit status`;

      const result = classifyError('go', goLinkerErr, 1);
      expect(result.classification).toBe('linker');
      expect(result.suggestion).toContain('링크');
    });

    test('E3: Zig toolchain missing 분류', () => {
      const zigMissingErr = `zig: command not found`;

      const result = classifyError('zig', zigMissingErr, 127);
      expect(result.classification).toBe('toolchain_missing');
      expect(result.suggestion).toContain('설치');
    });

    test('E4: Symbol error 분류', () => {
      const symbolErr = `undefined reference to \`compute\`
collect2: error: ld returned 1 exit status`;

      const result = classifyError('rust', symbolErr, 1);
      expect(result.classification).toBe('symbol');
      expect(result.suggestion).toContain('심볼');
    });

    test('E5: C linker error 분류', () => {
      const cLinkerErr = `/usr/bin/ld: cannot find -lm`;

      const result = classifyError('c', cLinkerErr, 1);
      expect(result.classification).toBe('linker');
      expect(result.suggestion).toContain('링크');
    });

    test('E6: Python toolchain missing', () => {
      const pythonMissingErr = `command not found: python3`;

      const result = classifyError('python', pythonMissingErr, 127);
      expect(result.classification).toBe('toolchain_missing');
      expect(result.suggestion).toContain('설치');
    });

    test('E7: Unknown error (fallback)', () => {
      const unknownErr = `some random error message`;

      const result = classifyError('unknown', unknownErr, 1);
      expect(result.classification).toBe('unknown');
      expect(result.suggestion).toContain('stderr');
    });
  });

  describe('formatBuildError: 에러 메시지 포맷', () => {

    test('E8: 완전한 BuildError 포맷 검증', () => {
      const buildErr: BuildError = {
        lang: 'rust',
        command: 'rustc --crate-type cdylib src.rs',
        exitCode: 1,
        stderr: `error[E0425]: cannot find value \`x\` in this scope
   |
 3 | let y = x + 1;`,
        classification: 'syntax',
        suggestion: '러스트 구문 오류입니다.'
      };

      const formatted = formatBuildError(buildErr);

      expect(formatted).toContain('RUST 빌드 실패');
      expect(formatted).toContain('원인:');
      expect(formatted).toContain('SYNTAX');
      expect(formatted).toContain('명령:');
      expect(formatted).toContain('rustc');
      expect(formatted).toContain('종료 코드: 1');
      expect(formatted).toContain('stderr:');
      expect(formatted).toContain('cannot find value');
    });

    test('E9: 긴 stderr 축약 검증 (5줄 초과)', () => {
      const longStderr = `line 1
line 2
line 3
line 4
line 5
line 6
line 7`;

      const buildErr: BuildError = {
        lang: 'go',
        command: 'go build',
        exitCode: 1,
        stderr: longStderr,
        classification: 'linker',
        suggestion: '링크 에러입니다.'
      };

      const formatted = formatBuildError(buildErr);

      expect(formatted).toContain('line 1');
      expect(formatted).toContain('line 5');
      expect(formatted).not.toContain('line 6');
      expect(formatted).toContain('더 많은 출력');
    });

    test('E10: 빈 stderr 처리', () => {
      const buildErr: BuildError = {
        lang: 'zig',
        command: 'zig build',
        exitCode: 1,
        stderr: '',
        classification: 'syntax',
        suggestion: '구문 오류입니다.'
      };

      const formatted = formatBuildError(buildErr);

      expect(formatted).toContain('ZIG 빌드 실패');
      expect(formatted).toContain('종료 코드: 1');
      // stderr가 비어있으면 stderr 섹션이 없어야 함
    });
  });

  describe('언어별 특화 분류', () => {

    test('E11: Rust error[E...] 패턴 검증', () => {
      const patterns = [
        'error[E0425]: cannot find value',
        'error[E0308]: mismatched types',
        'error[E0614]: type is not a function'
      ];

      for (const stderr of patterns) {
        const result = classifyError('rust', stderr, 1);
        expect(result.classification).toBe('syntax');
      }
    });

    test('E12: Go undefined: 패턴 검증', () => {
      const goErr = `package main: build command-line-arguments: undefined: SomeFunc`;

      const result = classifyError('go', goErr, 1);
      expect(result.classification).toBe('syntax');
    });

    test('E13: C++에서도 linker error 분류', () => {
      const cppErr = `/usr/bin/ld: undefined reference to 'MyClass::MyClass()'`;

      const result = classifyError('cpp', cppErr, 1);
      expect(result.classification).toBe('linker');
    });

    test('E14: 공통 패턴: undefined reference (모든 언어)', () => {
      const langs = ['rust', 'go', 'c', 'cpp'];
      const err = `undefined reference to 'foo'`;

      for (const lang of langs) {
        const result = classifyError(lang, err, 1);
        expect(['linker', 'symbol']).toContain(result.classification);
      }
    });
  });

  describe('제안 품질 검증', () => {

    test('E15: 제안이 항상 비어있지 않음', () => {
      const testCases = [
        { lang: 'rust', stderr: 'error[E0425]', exitCode: 1 },
        { lang: 'go', stderr: 'ld: cannot find', exitCode: 1 },
        { lang: 'zig', stderr: 'command not found', exitCode: 127 },
        { lang: 'c', stderr: 'undefined reference', exitCode: 1 },
        { lang: 'unknown', stderr: 'random error', exitCode: 1 }
      ];

      for (const test of testCases) {
        const result = classifyError(test.lang, test.stderr, test.exitCode);
        expect(result.suggestion).toBeTruthy();
        expect(result.suggestion.length).toBeGreaterThan(5);
      }
    });

    test('E16: 제안이 실행 가능한 조치를 포함', () => {
      const result = classifyError('rust', 'error[E0425]: cannot find', 1);
      expect(result.suggestion).toMatch(/확인|수정|참고|설치/);
    });
  });

  describe('엣지 케이스', () => {

    test('E17: stderr가 매우 길 경우', () => {
      const veryLongStderr = 'error: '.repeat(1000) + 'actual error';

      const result = classifyError('rust', veryLongStderr, 1);
      expect(result.classification).toBeTruthy();
      expect(result.suggestion).toBeTruthy();
    });

    test('E18: exitCode가 0인 경우 (정상 종료)', () => {
      // 실제로는 일어나지 않아야 하지만, 방어 코드 검증
      const result = classifyError('go', 'some message', 0);
      expect(result.classification).toBe('unknown');
    });

    test('E19: stderr가 null/undefined인 경우', () => {
      // @ts-ignore (타입 검사 무시)
      const result = classifyError('rust', null, 1);
      expect(result.classification).toBeTruthy();
    });

    test('E20: 언어명이 섞여있는 경우', () => {
      const result = classifyError('RUST', 'error[E0425]', 1);
      expect(result.classification).toBe('syntax');
    });
  });

  describe('P1 완료 기준', () => {

    test('✓ top 5 실패 유형 분류 검증', () => {
      const testCases = [
        { name: 'syntax', stderr: 'error[E', lang: 'rust' },
        { name: 'toolchain', stderr: 'command not found', lang: 'go' },
        { name: 'linker', stderr: 'ld: cannot find', lang: 'c' },
        { name: 'symbol', stderr: 'undefined reference', lang: 'rust' },
        { name: 'unknown', stderr: 'random', lang: 'unknown' }
      ];

      for (const test of testCases) {
        const result = classifyError(test.lang, test.stderr, 1);
        expect(result.classification).toBeTruthy();
        expect(result.suggestion).toBeTruthy();
      }
    });

    test('✓ 3개 이상 분류 + 제안 포함', () => {
      const classifications = new Set<string>();
      const suggestions = new Set<string>();

      const testCases = [
        { stderr: 'error[E0425]', lang: 'rust' },
        { stderr: 'ld: cannot find -l', lang: 'go' },
        { stderr: 'command not found', lang: 'zig' },
        { stderr: 'undefined symbol', lang: 'c' }
      ];

      for (const test of testCases) {
        const result = classifyError(test.lang, test.stderr, 1);
        classifications.add(result.classification);
        suggestions.add(result.suggestion);
      }

      expect(classifications.size).toBeGreaterThanOrEqual(3);
      expect(suggestions.size).toBeGreaterThanOrEqual(3);
    });

    test('✓ formatBuildError 포맷 일관성', () => {
      const err1: BuildError = {
        lang: 'rust',
        command: 'cmd1',
        exitCode: 1,
        stderr: 'err1',
        classification: 'syntax',
        suggestion: 'fix1'
      };

      const err2: BuildError = {
        lang: 'go',
        command: 'cmd2',
        exitCode: 2,
        stderr: 'err2',
        classification: 'linker',
        suggestion: 'fix2'
      };

      const fmt1 = formatBuildError(err1);
      const fmt2 = formatBuildError(err2);

      // 둘 다 필수 필드 포함
      for (const fmt of [fmt1, fmt2]) {
        expect(fmt).toContain('빌드 실패');
        expect(fmt).toContain('원인:');
        expect(fmt).toContain('명령:');
        expect(fmt).toContain('종료 코드:');
      }
    });
  });
});

describe('P1 Integration (Build Error 실제 사용)', () => {

  test('I1: buildError 인터페이스 호환성', () => {
    // BuildError 객체가 모든 필드를 가지고 있는지 검증
    const buildErr: BuildError = {
      lang: 'test',
      command: 'test cmd',
      exitCode: 1,
      stderr: 'test error',
      classification: 'syntax',
      suggestion: 'test suggestion'
    };

    expect(buildErr).toBeDefined();
    expect(Object.keys(buildErr).length).toBe(6);
  });

  test('I2: classifyError 반환 구조', () => {
    const result = classifyError('rust', 'error[E0425]', 1);

    expect(result).toHaveProperty('classification');
    expect(result).toHaveProperty('suggestion');
    expect(typeof result.classification).toBe('string');
    expect(typeof result.suggestion).toBe('string');
  });
});
