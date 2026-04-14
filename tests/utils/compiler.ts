import { Lexer } from '../lexer/nexus-lexer';
import { Parser } from '../parser/nexus-parser';
import { NexusCodegen } from '../codegen/nexus-codegen';

export function compile(source: string): string {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const codegen = new NexusCodegen(ast);
  return codegen.generate();
}
