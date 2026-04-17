import { ExportedFunction, extractPythonFunctions } from './base';

export function transpilepythonFunctions(c: string): ExportedFunction[] {
  return extractPythonFunctions(c);
}

export default transpilepythonFunctions;
