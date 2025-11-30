import type Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import NumberLiteralExpr from "./numberLiteralExpr";
import type { VariableType } from "./variableDeclarationExpr";

export default class UnaryExpr extends Expression {
  constructor(
    public operator: Token,
    public right: Expression,
  ) {
    super(ExpressionType.UnaryExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();

    output += "[ Unary Expression ]\n";
    output += this.getDepth() + `Operator: ${this.operator}\n`;
    output += this.right.toString(this.depth + 1);
    output += this.getDepth() + `[/ Unary Expression ]\n`;
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  optimize(): Expression {
    this.right = this.right.optimize();

    if (this.right instanceof NumberLiteralExpr) {
      const val = Number(this.right.value);
      let result: number | null = null;

      switch (this.operator.type) {
        case TokenType.MINUS:
          result = -val;
          break;
        case TokenType.PLUS:
          result = val;
          break;
        case TokenType.NOT:
          result = val === 0 ? 1 : 0;
          break;
        case TokenType.TILDE:
          result = ~val;
          break;
      }

      if (result !== null) {
        return new NumberLiteralExpr(result.toString(), this.operator);
      }
    }
    return this;
  }

  private resolveExpressionType(
    expr: Expression,
    scope: Scope,
  ): VariableType | null {
    if (expr.type === ExpressionType.IdentifierExpr) {
      const ident = expr as any;
      const resolved = scope.resolve(ident.name);
      return resolved ? resolved.varType : null;
    } else if (expr.type === ExpressionType.MemberAccessExpression) {
      const memberExpr = expr as any;
      const objectType = this.resolveExpressionType(memberExpr.object, scope);
      if (!objectType) return null;

      if (memberExpr.isIndexAccess) {
        if (objectType.isArray.length > 0) {
          return {
            name: objectType.name,
            isPointer: objectType.isPointer,
            isArray: objectType.isArray.slice(1),
          };
        } else if (objectType.isPointer > 0) {
          return {
            name: objectType.name,
            isPointer: objectType.isPointer - 1,
            isArray: [],
          };
        }
        return null;
      } else {
        const typeInfo = scope.resolveType(objectType.name);
        if (!typeInfo) return null;

        const propertyName = (memberExpr.property as any).name;
        const member = typeInfo.members.get(propertyName);
        if (!member) return null;

        return {
          name: member.name,
          isPointer: member.isPointer,
          isArray: member.isArray,
        };
      }
    } else if (expr.type === ExpressionType.BinaryExpression) {
      const binExpr = expr as any;
      const leftType = this.resolveExpressionType(binExpr.left, scope);
      const rightType = this.resolveExpressionType(binExpr.right, scope);

      if (leftType && leftType.isPointer > 0) return leftType;
      if (rightType && rightType.isPointer > 0) return rightType;

      if (leftType?.name === "f64" || rightType?.name === "f64")
        return { name: "f64", isPointer: 0, isArray: [] };
      if (leftType?.name === "f32" || rightType?.name === "f32")
        return { name: "f32", isPointer: 0, isArray: [] };

      return null;
    } else if (expr.type === ExpressionType.UnaryExpression) {
      const unaryExpr = expr as any;
      if (unaryExpr.operator.value === "*") {
        const opType = this.resolveExpressionType(unaryExpr.right, scope);
        if (opType && opType.isPointer > 0) {
          return {
            name: opType.name,
            isPointer: opType.isPointer - 1,
            isArray: opType.isArray,
          };
        }
      } else if (unaryExpr.operator.value === "&") {
        const opType = this.resolveExpressionType(unaryExpr.right, scope);
        if (opType) {
          return {
            name: opType.name,
            isPointer: opType.isPointer + 1,
            isArray: opType.isArray,
          };
        }
      }
      return null;
    } else if (expr.type === ExpressionType.NumberLiteralExpr) {
      const numExpr = expr as NumberLiteralExpr;
      if (numExpr.value.includes(".")) {
        return { name: "f64", isPointer: 0, isArray: [] };
      }
      return { name: "u64", isPointer: 0, isArray: [] };
    }
    return null;
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    if (this.operator.type === TokenType.AMPERSAND) {
      scope.setCurrentContext({ type: "LHS" });
      this.right.transpile(gen, scope);
      scope.removeCurrentContext("LHS");
      return;
    }

    if (this.operator.type === TokenType.STAR) {
      const isLHS = scope.getCurrentContext("LHS");
      if (isLHS) scope.removeCurrentContext("LHS");

      this.right.transpile(gen, scope);

      if (isLHS) {
        scope.setCurrentContext({ type: "LHS" });
      } else {
        const resultType = this.resolveExpressionType(this, scope);
        let size = 8;
        if (resultType) {
          if (resultType.isPointer > 0 || resultType.isArray.length > 0) {
            size = 8;
          } else {
            const typeInfo = scope.resolveType(resultType.name);
            if (typeInfo) size = typeInfo.size;
          }
        }

        if (size === 1) {
          gen.emit("movzx rax, byte [rax]", "dereference pointer (u8)");
        } else if (size === 2) {
          gen.emit("movzx rax, word [rax]", "dereference pointer (u16)");
        } else if (size === 4) {
          gen.emit("mov eax, dword [rax]", "dereference pointer (u32)");
        } else {
          gen.emit("mov rax, [rax]", "dereference pointer (u64)");
        }
      }
      return;
    }

    this.right.transpile(gen, scope);
    const type = this.resolveExpressionType(this.right, scope);
    const isFloat = type?.name === "f64" || type?.name === "f32";

    switch (this.operator.type) {
      case TokenType.MINUS:
        if (isFloat) {
          const label = gen.generateLabel("float_sign_mask_");
          if (type?.name === "f32") {
            gen.emitRoData(label, "dd", "0x80000000");
            gen.emit("movd xmm0, eax", "Move f32 to xmm0");
            gen.emit(`movss xmm1, [rel ${label}]`, "Load sign mask");
            gen.emit(`xorps xmm0, xmm1`, "Toggle sign bit");
            gen.emit("movd eax, xmm0", "Move back to eax");
          } else {
            gen.emitRoData(label, "dq", "0x8000000000000000");
            gen.emit("movq xmm0, rax", "Move f64 to xmm0");
            gen.emit(`movsd xmm1, [rel ${label}]`, "Load sign mask");
            gen.emit(`xorpd xmm0, xmm1`, "Toggle sign bit");
            gen.emit("movq rax, xmm0", "Move back to rax");
          }
        } else {
          gen.emit("neg rax", "unary minus");
        }
        break;
      case TokenType.PLUS:
        gen.emit("noop", "unary plus (no operation)");
        break;
      case TokenType.NOT:
        gen.emit("cmp rax, 0", "compare rax to 0 for logical NOT");
        gen.emit("sete al", "set al to 1 if zero, else 0");
        gen.emit("movzx rax, al", "zero-extend al to rax");
        break;
      case TokenType.TILDE:
        gen.emit("not rax", "bitwise NOT");
        break;
      default:
        throw new Error(`Unsupported unary operator: ${this.operator.value}`);
    }
  }
}
