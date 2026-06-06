/**
 * Focused source-formatting engine.
 * Keeps the full compiler barrel out of format command execution.
 */

import { Formatter } from "../../compiler/formatter/Formatter";
import { lexWithGrammar } from "../../compiler/frontend/GrammarLexer";
import { Parser } from "../../compiler/frontend/Parser";

export function formatSource(content: string, filePath: string): string {
  const tokens = lexWithGrammar(content, filePath);
  const parser = new Parser(content, filePath, tokens);
  const ast = parser.parse(false);
  return new Formatter().format(ast);
}
