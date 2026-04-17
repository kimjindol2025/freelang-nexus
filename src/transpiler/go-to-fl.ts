import { ExportedFunction, extractGoFunctions } from './base';

export function transpileGoFunctions(c: string): ExportedFunction[] {
  return extractGoFunctions(c);
}

export default transpileGoFunctions;
