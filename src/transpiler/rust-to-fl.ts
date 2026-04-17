import { ExportedFunction, extractRustFunctions } from './base';

export function transpileRustFunctions(c: string): ExportedFunction[] {
  return extractRustFunctions(c);
}

export default transpileRustFunctions;
