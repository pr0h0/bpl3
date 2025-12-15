import { readFileSync } from "fs";
import type { Grammar, GrammarRule } from "./types";

/**
 * Parses `grammar/grammar.bpl` (a light BNF-style definition) into an in-memory
 * structure that other tools can consume. Comments that start with `#` are
 * stripped and multiline rules are flattened until a terminating `;` is found.
 */
export class GrammarParser {
  constructor(private readonly grammarPath: string) {}

  parse(): Grammar {
    const raw = readFileSync(this.grammarPath, "utf-8");
    const withoutComments = this.stripComments(raw);
    const ruleStrings = this.splitIntoRules(withoutComments);

    const rules = new Map<string, GrammarRule>();
    let startRule: string | null = null;

    for (const rule of ruleStrings) {
      const [namePart, ...definitionParts] = rule.split("=");
      if (!definitionParts.length) continue;

      const name = namePart!.trim();
      const definition = definitionParts.join("=").replace(/\s+/g, " ").trim();
      if (!name || !definition) continue;

      rules.set(name, { name, definition });
      if (!startRule) startRule = name;
    }

    if (rules.has("Program")) {
      startRule = "Program";
    }

    if (!startRule) {
      throw new Error(
        "No grammar rules found. Ensure grammar file is not empty.",
      );
    }

    return { rules, startRule };
  }

  private stripComments(content: string): string {
    const lines = content.split(/\r?\n/);
    const cleaned: string[] = [];

    for (const line of lines) {
      let inSingle = false;
      let inDouble = false;
      let inBracket = false;
      let escaped = false;
      let result = "";

      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;

        if (escaped) {
          result += ch;
          escaped = false;
          continue;
        }

        if (ch === "\\") {
          result += ch;
          escaped = true;
          continue;
        }

        if (ch === "'" && !inDouble && !inBracket) inSingle = !inSingle;
        else if (ch === '"' && !inSingle && !inBracket) inDouble = !inDouble;
        else if (ch === "[" && !inSingle && !inDouble) inBracket = true;
        else if (ch === "]" && inBracket && !inSingle && !inDouble)
          inBracket = false;

        if (ch === "#" && !inSingle && !inDouble && !inBracket) {
          break; // comment starts here
        }

        result += ch;
      }

      if (result.trim().length > 0) {
        cleaned.push(result.trimEnd());
      }
    }

    return cleaned.join("\n");
  }

  private splitIntoRules(content: string): string[] {
    const rules: string[] = [];
    let buffer = "";
    let inSingle = false;
    let inDouble = false;
    let inBracket = false;
    let escaped = false;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i]!;

      buffer += ch;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (ch === "'" && !inDouble && !inBracket) inSingle = !inSingle;
      else if (ch === '"' && !inSingle && !inBracket) inDouble = !inDouble;
      else if (ch === "[" && !inSingle && !inDouble) inBracket = true;
      else if (ch === "]" && inBracket && !inSingle && !inDouble)
        inBracket = false;

      if (ch === ";" && !inSingle && !inDouble && !inBracket) {
        const normalized = buffer.slice(0, -1).trim();
        if (normalized.length > 0) rules.push(normalized);
        buffer = "";
      }
    }

    const tail = buffer.trim();
    if (tail.length > 0) rules.push(tail);

    return rules;
  }
}

export default GrammarParser;
