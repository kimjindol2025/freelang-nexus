import * as fs from 'fs';
import * as path from 'path';

const TMP_ROOT = path.join(__dirname, '..', '.tmp');

export class TempDirManager {
  private dirs: string[] = [];

  create(prefix: string): string {
    const dir = path.join(TMP_ROOT, `${prefix}_${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    this.dirs.push(dir);
    return dir;
  }

  cleanup(): void {
    this.dirs.forEach(dir => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        // cleanup 실패는 경고만
      }
    });
    this.dirs = [];
  }

  getAll(): string[] {
    return [...this.dirs];
  }
}
