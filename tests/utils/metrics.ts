import * as fs from 'fs';
import * as path from 'path';

export interface BaseMetric {
  testName: string;
  timestamp: string;
  runs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  deviationPercent: number;
}

export function appendMetric<T extends BaseMetric>(
  baselineFile: string,
  metric: T
): void {
  const baselineDir = path.dirname(baselineFile);
  fs.mkdirSync(baselineDir, { recursive: true });

  const existingData = fs.existsSync(baselineFile)
    ? JSON.parse(fs.readFileSync(baselineFile, 'utf-8'))
    : [];

  existingData.push(metric);
  fs.writeFileSync(baselineFile, JSON.stringify(existingData, null, 2));
}

export function calcStats(times: number[]) {
  const avg = times.reduce((a, b) => a + b) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const deviation = ((max - min) / avg * 100).toFixed(1);

  return {
    avgMs: Math.round(avg),
    minMs: min,
    maxMs: max,
    deviationPercent: parseFloat(deviation),
  };
}
