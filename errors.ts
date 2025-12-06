import { Logger } from "./utils/Logger";

export class CompilerError extends Error {
  constructor(
    public message: string,
    public line: number,
    public hint?: string,
  ) {
    super(message);
    this.name = "CompilerError";
  }
}

export class CompilerWarning {
  constructor(
    public message: string,
    public line: number,
    public hint?: string,
  ) {}
}

export class ErrorReporter {
  static report(error: any) {
    if (error instanceof CompilerError) {
      Logger.error(
        `\x1b[31mError:\x1b[0m ${error.message} @ line ${error.line}`,
      );
      if (error.hint) {
        Logger.error(`\x1b[36mHint:\x1b[0m ${error.hint}`);
      }
    } else {
      Logger.error(`\x1b[31mUnexpected Error:\x1b[0m ${error.message}`);
      Logger.error(error.stack);
    }
    process.exit(1);
  }

  static warn(warning: CompilerWarning) {
    Logger.warn(
      `\x1b[33mWarning:\x1b[0m ${warning.message} @ line ${warning.line}`,
    );
    if (warning.hint) {
      Logger.warn(`\x1b[36mHint:\x1b[0m ${warning.hint}`);
    }
  }
}
