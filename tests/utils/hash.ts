import * as crypto from 'crypto';

export function sha256(data: string | Buffer): string {
  if (typeof data === 'string') {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function getHashDisplay(hash: string, len: number = 12): string {
  return hash.substring(0, len);
}
