import type * as peggy from "peggy";

import * as AST from "../common/AST";
import { CompilerError, type SourceLocation } from "../common/CompilerError";
import * as generatedParser from "./generated/BplParser.js";
import {
  isParserStackOverflow,
  syntaxDepthError,
  validateSyntaxDepth,
} from "./SyntaxDepth";

let cachedParser: peggy.Parser | null = null;

function loadParser(): peggy.Parser {
  if (cachedParser) return cachedParser;
  cachedParser = generatedParser as unknown as peggy.Parser;
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

export function parseWithPeggy(
  source: string,
  filePath: string,
  options: { hasCommentMarker?: boolean } = {},
): AST.Program {
  const parser: peggy.Parser = loadParser();

  const parseOnce = (bplCollectExpected: boolean): AST.Program => {
    const comments: AST.Token[] = [];
    const errors: Array<{ message: string; location: SourceLocation }> = [];
    const program = parser.parse(source, {
      filePath,
      comments,
      errors,
      bplCollectExpected,
      bplHasCommentMarker: options.hasCommentMarker,
    }) as AST.Program;
    validateSyntaxDepth(program);
    // Peggy actions may run more than once while alternatives backtrack.
    // Preserve distinct source comments, not repeated visits to the same one.
    if (comments.length > 1) {
      const seen = new Set<string>();
      program.comments = comments.filter((comment) => {
        const key = `${comment.line}:${comment.column}:${comment.lexeme}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else {
      program.comments = comments;
    }
    if (errors.length > 0) {
      program.errors = errors.map(
        (e: { message: string; location: SourceLocation }) =>
          new CompilerError(e.message, "Fix the syntax error.", e.location),
      );
    }
    return program;
  };

  try {
    return parseOnce(false);
  } catch (error: unknown) {
    if (isPeggySyntaxError(error)) {
      try {
        return parseOnce(true);
      } catch (retryError: unknown) {
        throw toCompilerError(filePath, retryError);
      }
    }
    throw toCompilerError(filePath, error);
  }
}

function toCompilerError(filePath: string, error: unknown): CompilerError {
  if (isParserStackOverflow(error)) {
    return syntaxDepthError({
      file: filePath,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    });
  }
  const err = error as (Error & { location?: SourceLocation }) | unknown;
  if (!isPeggySyntaxError(err)) {
    throw error;
  }

  const loc = err.location as {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  const baseMsg: string =
    typeof err.message === "string" ? err.message : "Syntax error";
  const parts = baseMsg.split("\n");
  const msg: string = parts[0] ?? baseMsg;
  return new CompilerError(
    msg,
    "Syntax error",
    toSourceLocation(filePath, loc),
  );
}

function isPeggySyntaxError(e: unknown): e is {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
} {
  if (!e || typeof e !== "object") return false;
  const obj = e as Record<string, unknown>;
  return (
    "message" in obj &&
    typeof obj.message === "string" &&
    "location" in obj &&
    obj.location !== null &&
    typeof obj.location === "object" &&
    "start" in (obj.location as Record<string, unknown>) &&
    "end" in (obj.location as Record<string, unknown>)
  );
}
