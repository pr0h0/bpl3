import { Token } from "../frontend/Token";

export interface SourceLocation {
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export class CompilerError extends Error {
  constructor(
    public message: string,
    public hint: string,
    public location: SourceLocation,
  ) {
    super(message);
    this.name = "CompilerError";
  }

  public toString(): string {
    return (
      `\x1b[31m${this.name}\x1b[0m: ${this.message}\n` +
      `  --> ${this.location.file}:${this.location.startLine}:${this.location.startColumn}\n` +
      `  \x1b[34mHint\x1b[0m: ${this.hint}`
    );
  }
}
