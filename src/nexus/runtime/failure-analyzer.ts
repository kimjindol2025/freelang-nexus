/**
 * FreeLang Nexus - Parallel Failure Isolation
 *
 * P4: 병렬 빌드에서 직접 실패와 전파 실패를 구분하는 분석기
 */

/**
 * 단일 빌드 작업의 상태
 */
export interface BuildJobStatus {
  jobId: string;                           // "rust#libcore.so"
  lang: string;                            // "rust", "go", "link" 등
  artifact?: string;                       // "libcore.so"
  dependsOn: string[];                     // ["go#libhash.so"]

  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  failureType?: 'direct' | 'propagated' | 'timeout' | 'skipped';

  command: string;                         // "rustc --crate-type cdylib ..."
  startTime?: number;
  endTime?: number;

  stdout: string;
  stderr: string;
  exitCode?: number;

  failureCause?: {
    type: 'direct' | 'propagated';
    originalFailure?: string;               // jobId of source failure
    reason: string;
  };
}

/**
 * 빌드 전체 실패 분석 결과
 */
export interface FailureAnalysis {
  directFailures: BuildJobStatus[];        // 최초 직접 실패
  propagatedFailures: BuildJobStatus[];    // 의존성으로 인한 전파 실패
  skipped: BuildJobStatus[];               // 미실행
  successful: BuildJobStatus[];            // 성공

  failureGraph: Record<string, string[]>;  // jobId → 이로 인해 실패한 jobId[]
  hasFailures: boolean;
}

/**
 * 병렬 빌드 실패 분석기
 *
 * 역할:
 * 1. 모든 job status 추적
 * 2. 의존성 기반 실패 전파 분석
 * 3. 사용자 친화적 리포트 생성
 */
export class FailureAnalyzer {
  private jobs: Map<string, BuildJobStatus> = new Map();
  private failureGraph: Map<string, Set<string>> = new Map();

  /**
   * 빌드 작업 등록
   */
  registerJob(jobId: string, lang: string, artifact?: string, dependsOn?: string[]): void {
    const job: BuildJobStatus = {
      jobId,
      lang,
      artifact,
      dependsOn: dependsOn || [],
      status: 'pending',
      command: '',
      stdout: '',
      stderr: '',
    };
    this.jobs.set(jobId, job);

    // failureGraph 초기화
    this.failureGraph.set(jobId, new Set());
  }

  /**
   * Job 상태 업데이트
   */
  updateJobStatus(jobId: string, status: 'running' | 'success' | 'failed', exitCode?: number): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = status === 'failed' ? 'failed' : status;
    job.startTime = job.startTime || Date.now();

    if (status !== 'running') {
      job.endTime = Date.now();
    }

    if (status === 'failed') {
      job.exitCode = exitCode;
    }
  }

  /**
   * Job 상태 직접 설정 (테스트용, skipped 포함)
   */
  setJobStatus(jobId: string, status: 'pending' | 'running' | 'success' | 'failed' | 'skipped', exitCode?: number): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = status;
    if (status === 'skipped') {
      job.failureType = 'skipped';
    }
    if (exitCode !== undefined) {
      job.exitCode = exitCode;
    }
  }

  /**
   * Job 출력 업데이트
   */
  updateJobOutput(jobId: string, stdout: string, stderr: string, command?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.stdout = stdout;
    job.stderr = stderr;
    if (command) {
      job.command = command;
    }
  }

  /**
   * 의존성 기반 실패 전파 분석
   */
  analyzeFailures(): FailureAnalysis {
    // 1단계: 직접 실패 식별
    const directFailures = Array.from(this.jobs.values()).filter(
      (job) => job.status === 'failed'
    );

    // 2단계: 전파 실패 및 skipped 식별
    const propagatedFailures: BuildJobStatus[] = [];
    const skipped: BuildJobStatus[] = [];

    for (const job of this.jobs.values()) {
      if (job.status === 'success' || job.status === 'failed') {
        // 이미 처리됨
        continue;
      }

      // 의존성 중 실패한 것이 있는지 확인
      const failedDep = job.dependsOn.find((dep) => {
        const depJob = this.jobs.get(dep);
        return depJob && (depJob.status === 'failed' || depJob.status === 'skipped');
      });

      if (failedDep) {
        // 이 job은 skipped 처리
        job.status = 'skipped';
        job.failureType = 'skipped';
        job.failureCause = {
          type: 'propagated',
          originalFailure: failedDep,
          reason: `Dependency ${failedDep} failed`,
        };
        skipped.push(job);

        // failureGraph에 기록
        const set = this.failureGraph.get(failedDep);
        if (set) {
          set.add(job.jobId);
        }
      }
    }

    // 3단계: propagated failures 식별 (실제 실패했으나 의존성 때문)
    for (const job of this.jobs.values()) {
      if (job.status === 'failed' && !directFailures.includes(job)) {
        const failedDep = job.dependsOn.find((dep) => {
          const depJob = this.jobs.get(dep);
          return depJob && depJob.status === 'failed';
        });

        if (failedDep) {
          job.failureType = 'propagated';
          job.failureCause = {
            type: 'propagated',
            originalFailure: failedDep,
            reason: `Dependency ${failedDep} failed`,
          };
          propagatedFailures.push(job);

          const set = this.failureGraph.get(failedDep);
          if (set) {
            set.add(job.jobId);
          }
        }
      }
    }

    // 4단계: 성공한 job 필터링
    const successful = Array.from(this.jobs.values()).filter(
      (job) => job.status === 'success'
    );

    // failureGraph를 일반 object로 변환
    const failureGraphObj: Record<string, string[]> = {};
    for (const [key, set] of this.failureGraph) {
      if (set.size > 0) {
        failureGraphObj[key] = Array.from(set).sort();
      }
    }

    return {
      directFailures,
      propagatedFailures,
      skipped,
      successful,
      failureGraph: failureGraphObj,
      hasFailures: directFailures.length > 0,
    };
  }

  /**
   * 사용자 친화적 실패 리포트 생성
   */
  formatFailureReport(): string {
    const analysis = this.analyzeFailures();

    if (!analysis.hasFailures) {
      return '✓ All jobs completed successfully.';
    }

    const lines: string[] = ['✗ Build failed.\n'];

    // 직접 실패
    if (analysis.directFailures.length > 0) {
      lines.push('Direct failure:');
      for (const job of analysis.directFailures) {
        lines.push(`  [${this.formatLang(job.lang)}] ${job.command || 'unknown command'}`);
        lines.push(`  Exit code: ${job.exitCode || 'unknown'}`);

        // stderr에서 첫 번째 의미 있는 줄 추출
        const errorLine = job.stderr
          .split('\n')
          .find((line) => line.trim().length > 0 && !line.includes('warning'));

        if (errorLine) {
          const truncated = errorLine.length > 100 ? errorLine.substring(0, 100) + '...' : errorLine;
          lines.push(`  Error: ${truncated}`);
        }
        lines.push('');
      }
    }

    // 전파 실패
    if (analysis.propagatedFailures.length > 0) {
      lines.push('Propagated failures:');
      for (const job of analysis.propagatedFailures) {
        lines.push(`  [${this.formatLang(job.lang)}] ${job.command || 'unknown command'}`);
        if (job.failureCause) {
          lines.push(`  Because: ${job.failureCause.reason}`);
        }
        lines.push('');
      }
    }

    // Skipped
    if (analysis.skipped.length > 0) {
      lines.push('Skipped jobs:');
      for (const job of analysis.skipped) {
        lines.push(`  [${this.formatLang(job.lang)}] (not reached)`);
        if (job.failureCause) {
          lines.push(`  Reason: ${job.failureCause.reason}`);
        }
      }
      lines.push('');
    }

    // 로그 요약
    if (analysis.directFailures.length > 0 || analysis.propagatedFailures.length > 0) {
      lines.push('Logs:');
      const failures = [...analysis.directFailures, ...analysis.propagatedFailures];
      for (const job of failures) {
        lines.push(`  [${this.formatLang(job.lang)}]`);
        const stderrLines = job.stderr.split('\n').slice(0, 3);
        for (const line of stderrLines) {
          if (line.trim().length > 0) {
            lines.push(`    ${line}`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 언어명 포맷 (대문자)
   */
  private formatLang(lang: string): string {
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  }

  /**
   * 모든 job 상태 조회
   */
  getAllJobs(): BuildJobStatus[] {
    return Array.from(this.jobs.values());
  }

  /**
   * 특정 job 조회
   */
  getJob(jobId: string): BuildJobStatus | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * 실패 그래프 조회
   */
  getFailureGraph(): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    for (const [key, set] of this.failureGraph) {
      if (set.size > 0) {
        graph[key] = Array.from(set).sort();
      }
    }
    return graph;
  }
}
