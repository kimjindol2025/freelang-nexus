/**
 * FreeLang Nexus - 빌드 에러 분류 및 진단
 *
 * P1: Error Message Enhancement
 * 빌드 실패를 분류하고, 사용자가 이해할 수 있는 제안을 생성
 */

/**
 * 빌드 에러의 분류 타입
 */
export type ErrorClassification = 'syntax' | 'toolchain_missing' | 'linker' | 'symbol' | 'unsupported' | 'unknown';

/**
 * 빌드 에러 정보 (상세)
 */
export interface BuildError {
  lang: string;                          // 언어 (rust, go, zig, etc)
  command: string;                       // 실행한 빌드 명령어
  exitCode: number;                      // exit code
  stderr: string;                        // stderr 전체
  classification: ErrorClassification;   // 에러 분류
  suggestion: string;                    // 해결 제안 한 줄
}

/**
 * 빌드 에러 분류 및 제안 생성
 *
 * @param lang 언어
 * @param stderr stderr 전체 출력
 * @param exitCode exit code
 * @returns { classification, suggestion }
 */
export function classifyError(
  lang: string,
  stderr: string,
  exitCode: number
): { classification: ErrorClassification; suggestion: string } {
  const lowerStderr = stderr.toLowerCase();
  const lowerLang = lang.toLowerCase();

  // 1. Toolchain Missing (우선순위: 높음, 모든 언어 공통)
  if (
    lowerStderr.includes('command not found') ||
    lowerStderr.includes('not found in path') ||
    lowerStderr.includes(`${lowerLang}: command not found`) ||
    lowerStderr.includes(`cannot find '${lowerLang}'`)
  ) {
    return {
      classification: 'toolchain_missing',
      suggestion: `${lang} 컴파일러가 설치되지 않았거나 PATH에 없습니다. 설치 후 재시도하세요.`
    };
  }

  // 2. Rust 특화
  if (lowerLang === 'rust') {
    // Syntax error: error[E...]
    if (/error\[E\d+\]/.test(stderr)) {
      return {
        classification: 'syntax',
        suggestion: '러스트 구문 오류입니다. 위의 stderr를 참고하여 구문을 수정하세요.'
      };
    }

    // Linker error: ld: cannot find, unresolved reference
    if (
      lowerStderr.includes('ld: cannot find') ||
      lowerStderr.includes('error: linking with') ||
      lowerStderr.includes('unresolved reference')
    ) {
      return {
        classification: 'linker',
        suggestion: '링크 에러입니다. @artifact 이름과 실제 아티팩트명이 일치하는지, 필요한 링크 플래그(-lm, -lpthread 등)가 포함되었는지 확인하세요.'
      };
    }

    // Symbol error: undefined reference, unresolved symbol
    if (lowerStderr.includes('undefined reference') || lowerStderr.includes('unresolved symbol')) {
      return {
        classification: 'symbol',
        suggestion: '심볼이 정의되지 않았습니다. 의존성 모듈이 정상적으로 빌드되었는지, 링크 순서가 올바른지 확인하세요.'
      };
    }
  }

  // 3. Go 특화
  if (lowerLang === 'go') {
    // Syntax error: compilation errors
    if (lowerStderr.includes('expected') || lowerStderr.includes('undefined:') || lowerStderr.includes('syntax error')) {
      return {
        classification: 'syntax',
        suggestion: 'Go 구문 또는 타입 오류입니다. 위의 stderr를 참고하여 코드를 수정하세요.'
      };
    }

    // Linker error: ld: cannot find
    if (lowerStderr.includes('ld: cannot find') || lowerStderr.includes('undefined reference')) {
      return {
        classification: 'linker',
        suggestion: 'Go cgo 링크 에러입니다. -buildmode=c-shared 플래그를 확인하고, 필요한 C 라이브러리가 설치되었는지 확인하세요.'
      };
    }

    // Symbol error: undefined symbol in C code
    if (lowerStderr.includes('undefined symbol')) {
      return {
        classification: 'symbol',
        suggestion: 'C 심볼이 누락되었습니다. //export 함수가 올바르게 정의되었는지, 필요한 헤더 파일이 포함되었는지 확인하세요.'
      };
    }
  }

  // 4. Zig 특화
  if (lowerLang === 'zig') {
    // Syntax error: error:
    if (lowerStderr.includes('error:')) {
      return {
        classification: 'syntax',
        suggestion: 'Zig 구문 오류입니다. 위의 에러 메시지를 참고하여 코드를 수정하세요.'
      };
    }

    // Linker error
    if (lowerStderr.includes('ld:') || lowerStderr.includes('link')) {
      return {
        classification: 'linker',
        suggestion: 'Zig 링크 에러입니다. 빌드 명령어의 링크 플래그를 확인하세요.'
      };
    }
  }

  // 5. C/C++ 특화
  if (lowerLang === 'c' || lowerLang === 'cpp' || lowerLang === 'c++') {
    // Compilation error
    if (lowerStderr.includes('error:') || lowerStderr.includes('undefined reference to')) {
      if (lowerStderr.includes('undefined reference')) {
        return {
          classification: 'linker',
          suggestion: 'C/C++ 링크 에러입니다. 필요한 라이브러리(-lm, -lpthread 등)가 링크 플래그에 포함되었는지 확인하세요.'
        };
      }
      return {
        classification: 'syntax',
        suggestion: 'C/C++ 컴파일 에러입니다. 위의 에러 메시지를 참고하여 코드를 수정하세요.'
      };
    }
  }

  // 6. 공통: Linker error (ld, linker, link, undefined reference)
  if (
    lowerStderr.includes('ld:') ||
    lowerStderr.includes('linker') ||
    lowerStderr.includes('undefined reference') ||
    lowerStderr.includes('cannot find -l')
  ) {
    return {
      classification: 'linker',
      suggestion: '링크 에러입니다. 필요한 라이브러리 및 링크 플래그(-lm, -lpthread 등)를 확인하세요.'
    };
  }

  // 7. 공통: Symbol error (undefined symbol, unresolved, symbol mismatch)
  if (
    lowerStderr.includes('undefined symbol') ||
    lowerStderr.includes('unresolved symbol') ||
    lowerStderr.includes('symbol mismatch')
  ) {
    return {
      classification: 'symbol',
      suggestion: '심볼 해석 오류입니다. 의존성이 정상적으로 빌드되었는지, 함수 서명이 일치하는지 확인하세요.'
    };
  }

  // 8. 공통: Syntax error patterns
  if (
    lowerStderr.includes('syntax error') ||
    lowerStderr.includes('parse error') ||
    lowerStderr.includes('expected')
  ) {
    return {
      classification: 'syntax',
      suggestion: '구문 오류입니다. 위의 에러 메시지를 참고하여 코드를 수정하세요.'
    };
  }

  // Default: Unknown
  return {
    classification: 'unknown',
    suggestion: '알려지지 않은 빌드 에러입니다. 위의 stderr를 자세히 확인하고, 필요시 빌드 명령어를 수동으로 실행해보세요.'
  };
}

/**
 * BuildError를 사용자 친화적 메시지로 포맷
 */
export function formatBuildError(error: BuildError): string {
  const lines: string[] = [];

  lines.push(`[FreeLang Nexus] ${error.lang.toUpperCase()} 빌드 실패`);
  lines.push(`  원인: [${error.classification.toUpperCase()}] ${error.suggestion}`);
  lines.push(`  명령: ${error.command}`);
  lines.push(`  종료 코드: ${error.exitCode}`);

  // stderr 첫 5줄만 표시 (너무 길면 잘림)
  const stderrLines = error.stderr.trim().split('\n').slice(0, 5);
  if (stderrLines.length > 0) {
    lines.push(`  stderr:`);
    for (const line of stderrLines) {
      lines.push(`    ${line}`);
    }
    if (error.stderr.trim().split('\n').length > 5) {
      lines.push(`    ... (더 많은 출력)`);
    }
  }

  return lines.join('\n');
}
