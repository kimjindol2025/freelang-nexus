import { NexusLexer } from '../../src/nexus/lexer/nexus-lexer';
import { NexusParser } from '../../src/nexus/parser/nexus-parser';
import { NexusCodegen } from '../../src/nexus/codegen/nexus-codegen';

export function compile(source: string) {
  const tokens = new NexusLexer(source).tokenize();
  const ast = new NexusParser(tokens).parse();
  return new NexusCodegen().generateProgram(ast);
}
