import { Token } from "./Token";
import { TokenType } from "./TokenType";
import * as AST from "../common/AST";
import { parseWithPeggy } from "./PeggyParser";

export class Parser {
  private readonly source: string;
  private readonly filePath: string;
  private readonly tokens: Token[];

  constructor(source: string, filePath: string, tokens: Token[] = []) {
    this.source = source;
    this.filePath = filePath;
    this.tokens = tokens;
  }

  public parse(): AST.Program {
    const ast = parseWithPeggy(this.source, this.filePath);
    if (this.tokens.length > 0) {
      const comments = this.tokens.filter((t) => t.type === TokenType.Comment);
      return { ...ast, comments };
    }
    return ast;
  }
}
