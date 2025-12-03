import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import type { VariableType } from "./variableDeclarationExpr";

export default class CastExpr extends Expression {
  constructor(
    public targetType: VariableType,
    public value: Expression,
  ) {
    super(ExpressionType.CastExpression);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ CastExpression ]\n";
    this.depth++;
    output +=
      this.getDepth() + `Target Type: ${this.printType(this.targetType)}\n`;
    output += this.getDepth() + `Value:\n`;
    output += this.value.toString(this.depth + 1);
    this.depth--;
    output += this.getDepth() + `/[ CastExpression ]\n`;
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  optimize(): Expression {
    this.value = this.value.optimize();
    return this;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    const sourceValue = this.value.toIR(gen, scope);

    // We need a way to infer the type - import SemanticAnalyzer temporarily
    const {
      SemanticAnalyzer,
    } = require("../../transpiler/analysis/SemanticAnalyzer");
    const analyzer = new SemanticAnalyzer();
    const sourceType = (analyzer as any).inferType(this.value, scope);

    if (!sourceType) {
      throw new Error(`Cannot infer type of cast source expression`);
    }

    const targetIRType = gen.getIRType(this.targetType);
    const sourceIRType = gen.getIRType(sourceType);

    // If types are identical, no cast needed
    if (this.typesEqual(sourceType, this.targetType)) {
      return sourceValue;
    }

    // Determine appropriate cast instruction
    return this.emitCastInstruction(
      gen,
      sourceValue,
      sourceType,
      this.targetType,
      sourceIRType,
      targetIRType,
    );
  }

  private inferValueType(expr: Expression, scope: Scope): VariableType | null {
    // Delegate to SemanticAnalyzer's inferType logic
    // We'll need to import it or duplicate the logic
    // For now, use a simplified version
    const exprType = (expr as any).type;

    if (exprType === ExpressionType.NumberLiteralExpr) {
      const numExpr = expr as any;
      if (numExpr.value.includes(".")) {
        return { name: "f64", isPointer: 0, isArray: [] };
      }
      return { name: "u64", isPointer: 0, isArray: [] };
    }

    if (exprType === ExpressionType.IdentifierExpr) {
      const ident = expr as any;
      const resolved = scope.resolve(ident.name);
      return resolved ? resolved.varType : null;
    }

    // Add more cases as needed
    return null;
  }

  private typesEqual(a: VariableType, b: VariableType): boolean {
    return (
      a.name === b.name &&
      a.isPointer === b.isPointer &&
      a.isArray.length === b.isArray.length
    );
  }

  private emitCastInstruction(
    gen: IRGenerator,
    sourceValue: string,
    sourceType: VariableType,
    targetType: VariableType,
    sourceIRType: any,
    targetIRType: any,
  ): string {
    const srcIsFloat = sourceType.name === "f32" || sourceType.name === "f64";
    const tgtIsFloat = targetType.name === "f32" || targetType.name === "f64";
    const srcIsPtr = sourceType.isPointer > 0;
    const tgtIsPtr = targetType.isPointer > 0;

    // Pointer to pointer
    if (srcIsPtr && tgtIsPtr) {
      return gen.emitBitcast(sourceValue, sourceIRType, targetIRType);
    }

    // Pointer to integer
    if (srcIsPtr && !tgtIsPtr) {
      return gen.emitPtrToInt(sourceValue, sourceIRType, targetIRType);
    }

    // Integer to pointer
    if (!srcIsPtr && tgtIsPtr) {
      return gen.emitIntToPtr(sourceValue, sourceIRType, targetIRType);
    }

    // Float to float
    if (srcIsFloat && tgtIsFloat) {
      const srcSize = this.getFloatSize(sourceType.name);
      const tgtSize = this.getFloatSize(targetType.name);
      if (srcSize > tgtSize) {
        return gen.emitFPTrunc(sourceValue, sourceIRType, targetIRType);
      } else if (srcSize < tgtSize) {
        return gen.emitFPExt(sourceValue, sourceIRType, targetIRType);
      }
      return sourceValue;
    }

    // Float to integer
    if (srcIsFloat && !tgtIsFloat) {
      const isSigned = this.isSignedInt(targetType.name);
      if (isSigned) {
        return gen.emitFPToSI(sourceValue, sourceIRType, targetIRType);
      } else {
        return gen.emitFPToUI(sourceValue, sourceIRType, targetIRType);
      }
    }

    // Integer to float
    if (!srcIsFloat && tgtIsFloat) {
      const isSigned = this.isSignedInt(sourceType.name);
      if (isSigned) {
        return gen.emitSIToFP(sourceValue, sourceIRType, targetIRType);
      } else {
        return gen.emitUIToFP(sourceValue, sourceIRType, targetIRType);
      }
    }

    // Integer to integer
    const srcSize = this.getIntSize(sourceType.name);
    const tgtSize = this.getIntSize(targetType.name);

    if (srcSize > tgtSize) {
      return gen.emitTrunc(sourceValue, sourceIRType, targetIRType);
    } else if (srcSize < tgtSize) {
      const isSigned = this.isSignedInt(sourceType.name);
      if (isSigned) {
        return gen.emitSExt(sourceValue, sourceIRType, targetIRType);
      } else {
        return gen.emitZExt(sourceValue, sourceIRType, targetIRType);
      }
    }

    return sourceValue;
  }
  private getFloatSize(name: string): number {
    if (name === "f32") return 4;
    if (name === "f64") return 8;
    return 0;
  }

  private getIntSize(name: string): number {
    if (name === "u8" || name === "i8") return 1;
    if (name === "u16" || name === "i16") return 2;
    if (name === "u32" || name === "i32") return 4;
    if (name === "u64" || name === "i64") return 8;
    return 0;
  }

  private isSignedInt(name: string): boolean {
    return name === "i8" || name === "i16" || name === "i32" || name === "i64";
  }
}
