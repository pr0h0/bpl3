import { fileURLToPath } from "node:url";
import { Formatter } from "../../../compiler/formatter/Formatter";
import { loadFormatterConfig } from "../../../compiler/formatter/FormatterConfig";
import { Parser } from "../../../compiler/frontend/Parser";

export interface DocumentFormattingPreferences {
  tabSize: number;
  insertSpaces: boolean;
}

/** Format the current buffer; project configuration takes precedence over editor preferences. */
export function formatDocumentText(
  text: string,
  uri: string,
  preferences: DocumentFormattingPreferences,
): string {
  const filePath = uri.startsWith("file:") ? fileURLToPath(uri) : undefined;
  const config = filePath ? loadFormatterConfig(filePath) : undefined;
  const options = config?.configPath
    ? config.options
    : { indentWidth: preferences.tabSize, useTabs: !preferences.insertSpaces };
  const program = new Parser(text, filePath ?? uri).parse();
  return new Formatter(options).format(program, text);
}
