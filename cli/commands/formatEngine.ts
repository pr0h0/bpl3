/**
 * Focused source-formatting engine.
 * Keeps the full compiler barrel out of format command execution.
 */

import { Formatter } from "../../compiler/formatter/Formatter";
import { Parser } from "../../compiler/frontend/Parser";

export function formatSource(content: string, filePath: string): string {
  const parser = new Parser(content, filePath);
  const ast = parser.parse(false);
  return new Formatter().format(ast);
}
