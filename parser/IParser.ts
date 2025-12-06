import Expression from "./expression/expr";
import { ParserBase } from "./parserBase";

import type { VariableType } from "./expression/variableDeclarationExpr";
import type BlockExpr from "./expression/blockExpr";
import type VariableDeclarationExpr from "./expression/variableDeclarationExpr";
import type FunctionDeclarationExpr from "./expression/functionDeclaration";
import type StructDeclarationExpr from "./expression/structDeclarationExpr";
import type ExternDeclarationExpr from "./expression/externDeclarationExpr";
import type ImportExpr from "./expression/importExpr";
import type ExportExpr from "./expression/exportExpr";
import type LoopExpr from "./expression/loopExpr";

export interface IParser extends ParserBase {
  parseExpression(): Expression;
  parseTernary(): Expression;
  parseType(): VariableType;
  parseCodeBlock(): BlockExpr;
  parsePrimary(): Expression;

  // Declarations
  parseVariableDeclaration(): VariableDeclarationExpr;
  parseFunctionDeclaration(): FunctionDeclarationExpr;
  parseStructDeclaration(): StructDeclarationExpr;
  parseExternDeclaration(): ExternDeclarationExpr;
  parseImportExpression(): ImportExpr;
  parseExportExpression(): ExportExpr;

  // Control Flow
  parseLoopDeclaration(): LoopExpr;
  parseIfExpression(): Expression;
  parseSwitchExpression(): Expression;
  parseBreakExpr(): Expression;
  parseContinueExpr(): Expression;
  parseFunctionReturn(): Expression;
}
