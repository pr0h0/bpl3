/**
 * Focused source-formatting engine.
 * Keeps the full compiler barrel out of format command execution.
 */

import { Formatter } from "../../compiler/formatter/Formatter";
import type { FormatterOptions } from "../../compiler/formatter/FormatterOptions";
import { Parser } from "../../compiler/frontend/Parser";

export function formatSource(
  content: string,
  filePath: string,
  options: FormatterOptions = {},
): string {
  const parser = new Parser(content, filePath);
  const ast = parser.parse(false);
  return new Formatter(options).format(ast, content);
}
