import type Token from "../lexer/token";
import { CompilerError } from "../errors";
import TokenType from "../lexer/tokenType";
import Expression from "./expression/expr";

export class ParserBase {
  protected tokens: Token[];
  protected current: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.current = 0;
  }

  public withRange<T extends Expression>(fn: () => T): T {
    const startToken = this.peek();
    const expr = fn();
    if (startToken && !expr.startToken) expr.startToken = startToken;
    const endToken = this.peek(-1);
    if (endToken) expr.endToken = endToken;
    return expr;
  }

  public peek(offset: number = 0): Token | null {
    if (this.current + offset >= this.tokens.length) return null;
    return this.tokens[this.current + offset] ?? null;
  }

  public consume(type: TokenType, errorMessage: string = ""): Token {
    const token = this.peek();
    if (token && token.type === type) {
      this.current++;
      return token;
    }

    throw new CompilerError(
      errorMessage
        ? errorMessage
        : `Expected token of type ${type}, but got ${token?.type}`,
      token ? token.line : 0,
    );
  }

  public check(type: TokenType): boolean {
    if (this.current >= this.tokens.length) return false;
    return this.peek()?.type === type;
  }

  public match(type: TokenType): boolean {
    if (this.check(type)) {
      this.consume(type);
      return true;
    }
    return false;
  }

  public splitBitshiftRight(): void {
    const token = this.tokens[this.current];
    if (!token || token.type !== TokenType.BITSHIFT_RIGHT) return;

    token.type = TokenType.GREATER_THAN;
    token.value = ">";
    this.tokens.splice(this.current + 1, 0, {
      ...token,
      type: TokenType.GREATER_THAN,
      value: ">",
      column: token.column + 1,
      start: token.start + 1,
    });
  }
}
