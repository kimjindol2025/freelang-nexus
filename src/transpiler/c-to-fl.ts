import { ExportedFunction, extractCFunctions } from './base';

export function transpileseFunctions(c: string): ExportedFunction[] {
  return extractCFunctions(c);
}

export default transpileseFunctions;
