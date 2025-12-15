import { TokenType } from "./TokenType";

export class Token {
  constructor(
    public type: TokenType,
    public lexeme: string,
    public literal: any,
    public line: number,
    public column: number,
    public file: string,
  ) {}

  public toString(): string {
    return `Token(${TokenType[this.type]}, "${this.lexeme}", ${this.literal}, File:${this.file}, Line:${this.line}, Col:${this.column})`;
  }
}
