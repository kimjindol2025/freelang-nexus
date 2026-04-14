import { execSync } from 'child_process';

function check(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export const env = {
  hasRustc: () => check('rustc --version'),
  hasGo: () => check('go version'),
  hasGcc: () => check('gcc --version'),
  hasZig: () => check('zig version'),
  hasPython3: () => check('python3 --version'),
};
