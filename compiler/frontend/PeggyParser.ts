import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import * as peggy from "peggy";

import { resolveBplPath, getBplHome } from "../common/PathResolver";
import * as AST from "../common/AST";
import { CompilerError, type SourceLocation } from "../common/CompilerError";

let cachedParser: peggy.Parser | null = null;

function loadParser(): peggy.Parser {
  if (cachedParser) return cachedParser;

  // Use BPL_HOME to locate grammar file
  const grammarPath = resolveBplPath("grammar", "bpl.peggy");

  if (!existsSync(grammarPath)) {
    const bplHome = getBplHome();
    throw new CompilerError(
      `Could not find bpl.peggy grammar file.`,
      `Please ensure BPL_HOME is set correctly or the grammar directory exists.\n` +
        `BPL_HOME: ${bplHome}\n` +
        `Looking for: ${grammarPath}\n` +
        `You can set it with: export BPL_HOME=/path/to/bpl`,
      {
        file: grammarPath,
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
      },
    );
  }

  const source = readFileSync(grammarPath, "utf-8");
  cachedParser = peggy.generate(source, {
    output: "parser",
    format: "commonjs",
    cache: true,
  });
  return cachedParser;
}

function toSourceLocation(
  filePath: string,
  loc: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  },
): SourceLocation {
  return {
    file: filePath,
    startLine: loc.start.line,
    startColumn: loc.start.column,
    endLine: loc.end.line,
    endColumn: loc.end.column,
  };
}

export function parseWithPeggy(source: string, filePath: string): AST.Program {
  try {
    const parser: peggy.Parser = loadParser();
    const comments: any[] = [];
    const errors: any[] = [];
    const program = parser.parse(source, {
      filePath,
      comments,
      errors,
    }) as AST.Program;
    program.comments = comments;
    if (errors.length > 0) {
      (program as any).errors = errors.map(
        (e: any) =>
          new CompilerError(e.message, "Fix the syntax error.", e.location),
      );
    }
    return program;
  } catch (error: unknown) {
    const err = error as (Error & { location?: any }) | unknown;
    if (isPeggySyntaxError(err)) {
      const loc = err.location as {
        start: { line: number; column: number };
        end: { line: number; column: number };
      };
      const baseMsg: string =
        typeof err.message === "string" ? err.message : "Syntax error";
      const parts = baseMsg.split("\n");
      const msg: string = parts[0] ?? baseMsg;
      throw new CompilerError(
        msg,
        "Syntax error",
        toSourceLocation(filePath, loc),
      );
    }
    throw error;
  }
}

function isPeggySyntaxError(e: unknown): e is {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
} {
  return (
    !!e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as any).message === "string" &&
    "location" in e &&
    (e as any).location &&
    typeof (e as any).location === "object" &&
    "start" in (e as any).location &&
    "end" in (e as any).location
  );
}
