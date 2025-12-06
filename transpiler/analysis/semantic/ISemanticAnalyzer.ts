import FunctionDeclarationExpr from "../../../parser/expression/functionDeclaration";
import ProgramExpr from "../../../parser/expression/programExpr";
import Scope from "../../Scope";

export interface ISemanticAnalyzer {
  analyzeFunctionDeclaration(expr: FunctionDeclarationExpr, scope: Scope): void;
  currentProgram: ProgramExpr | null;
}
