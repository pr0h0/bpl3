/**
 * Focused frontend-only build action.
 * Keeps module resolution, type checking, code generation, and linking out of
 * common token, AST, and formatted-output requests.
 */

import * as fs from "fs";
import type { CompileOptions } from "../types";
import { diagnosticFormatter } from "../DiagnosticFormatter";
import {
  assertWritableInputFilePath,
  getInputFilePathError,
  writeFileAtomically,
} from "../utils";
import { CompilerError } from "../../compiler/common/CompilerError";
import { updateConfig } from "../../compiler/common/Config";
import { Logger, LogLevel, setLogLevel } from "../../compiler/common/Logger";
import { Formatter } from "../../compiler/formatter/Formatter";
import { lexWithGrammar } from "../../compiler/frontend/GrammarLexer";
import { Parser } from "../../compiler/frontend/Parser";

const log = new Logger("CompilationRunner");

class BuildValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildValidationError";
  }
}

export function processFrontendBuildFile(
  filePath: string,
  options: CompileOptions,
): void {
  try {
    applyFrontendOptions(options);

    const inputError = getInputFilePathError(filePath);
    if (inputError) {
      throw new BuildValidationError(`${inputError}: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    emitFrontendOutput(content, filePath, options);
  } catch (error) {
    if (error instanceof CompilerError) {
      console.error(diagnosticFormatter.formatError(error));
    } else {
      log.error(`${error}`);
    }
    process.exit(1);
  }
}

function applyFrontendOptions(options: CompileOptions): void {
  if (options.json || options.quiet) {
    setLogLevel(LogLevel.SILENT);
  } else if (options.verbose) {
    setLogLevel(LogLevel.DEBUG);
  }

  if (options.color !== undefined) {
    updateConfig({
      features: { colorize: options.color },
    });
    diagnosticFormatter.setConfig({ colorize: options.color });
  }
}

function emitFrontendOutput(
  content: string,
  filePath: string,
  options: CompileOptions,
): void {
  if (options.emit === "tokens") {
    let tokens: ReturnType<typeof lexWithGrammar> = [];
    try {
      tokens = lexWithGrammar(content, filePath);
    } catch {
      // Preserve the existing best-effort token output for incomplete syntax.
    }
    console.log(JSON.stringify(tokens, null, 2));
    return;
  }

  const parser = new Parser(content, filePath, []);
  const ast = parser.parse(true);
  if (options.emit === "ast") {
    console.log(JSON.stringify(ast, null, 2));
    return;
  }

  const formatted = new Formatter().format(ast);
  if (options.write) {
    assertWritableInputFilePath(filePath);
    writeFileAtomically(filePath, formatted);
    if (options.verbose) log.info(`Formatted ${filePath}`);
  } else {
    console.log(formatted);
  }
}
