import type Token from "../lexer/token";
import TokenType from "../lexer/tokenType";
import BlockExpr from "./expression/blockExpr";
import ExportExpr from "./expression/exportExpr";
import Expression from "./expression/expr";
import ExternDeclarationExpr from "./expression/externDeclarationExpr";
import FunctionDeclarationExpr from "./expression/functionDeclaration";
import ImportExpr from "./expression/importExpr";
import LoopExpr from "./expression/loopExpr";
import ProgramExpr from "./expression/programExpr";
import StructDeclarationExpr from "./expression/structDeclarationExpr";
import VariableDeclarationExpr, {
  type VariableType,
} from "./expression/variableDeclarationExpr";
import { ParserBase } from "./parserBase";
import { ControlFlowParser } from "./parsers/controlFlowParser";
import { DeclarationParser } from "./parsers/declarationParser";
import { ExpressionParser } from "./parsers/expressionParser";
import { TypeParser } from "./parsers/typeParser";

import type { IParser } from "./IParser";

export class Parser extends ParserBase implements IParser {
  private typeParser: TypeParser;
  private declarationParser: DeclarationParser;
  private controlFlowParser: ControlFlowParser;
  private expressionParser: ExpressionParser;

  constructor(tokens: Token[]) {
    super(tokens);
    this.typeParser = new TypeParser(this);
    this.declarationParser = new DeclarationParser(this);
    this.controlFlowParser = new ControlFlowParser(this);
    this.expressionParser = new ExpressionParser(this);
  }

  public parse(): ProgramExpr {
    const program = new ProgramExpr();

    while (this.current < this.tokens.length) {
      const expr = this.parseExpression();
      program.addExpression(expr);
    }

    return program;
  }

  parseExpression(): Expression {
    return this.expressionParser.parseExpression();
  }

  parseTernary(): Expression {
    return this.expressionParser.parseTernary();
  }

  parsePrimary(): Expression {
    return this.expressionParser.parsePrimary();
  }

  parseExternDeclaration(): ExternDeclarationExpr {
    return this.declarationParser.parseExternDeclaration();
  }

  parseImportExpression(): ImportExpr {
    return this.declarationParser.parseImportExpression();
  }

  parseExportExpression(): ExportExpr {
    return this.declarationParser.parseExportExpression();
  }

  parseFunctionReturn(): Expression {
    return this.controlFlowParser.parseFunctionReturn();
  }

  parseStructDeclaration(): StructDeclarationExpr {
    return this.declarationParser.parseStructDeclaration();
  }

  parseBreakExpr(): Expression {
    return this.controlFlowParser.parseBreakExpr();
  }

  parseContinueExpr(): Expression {
    return this.controlFlowParser.parseContinueExpr();
  }

  parseLoopDeclaration(): LoopExpr {
    return this.controlFlowParser.parseLoopDeclaration();
  }

  parseFunctionDeclaration(): FunctionDeclarationExpr {
    return this.declarationParser.parseFunctionDeclaration();
  }

  parseIfExpression(): Expression {
    return this.controlFlowParser.parseIfExpression();
  }

  parseSwitchExpression(): Expression {
    return this.controlFlowParser.parseSwitchExpression();
  }

  parseVariableDeclaration(): VariableDeclarationExpr {
    return this.declarationParser.parseVariableDeclaration();
  }

  parseCodeBlock(): BlockExpr {
    return this.withRange(() => {
      const expressions: Expression[] = [];
      this.consume(
        TokenType.OPEN_BRACE,
        "Expected '{' at the beginning of a code block.",
      );

      while (this.peek() && this.peek()!.type !== TokenType.CLOSE_BRACE) {
        const expr = this.parseExpression();
        expressions.push(expr);
      }

      this.consume(
        TokenType.CLOSE_BRACE,
        "Expected '}' at the end of a code block.",
      );
      return new BlockExpr(expressions);
    });
  }

  parseType(): VariableType {
    return this.typeParser.parse();
  }
}
