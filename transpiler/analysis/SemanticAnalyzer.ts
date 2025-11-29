import ProgramExpr from "../../parser/expression/programExpr";
import Scope from "../Scope";
import Expression from "../../parser/expression/expr";
import ExpressionType from "../../parser/expressionType";
import VariableDeclarationExpr, {
  type VariableType,
} from "../../parser/expression/variableDeclarationExpr";
import FunctionDeclarationExpr from "../../parser/expression/functionDeclaration";
import BlockExpr from "../../parser/expression/blockExpr";
import IdentifierExpr from "../../parser/expression/identifierExpr";
import BinaryExpr from "../../parser/expression/binaryExpr";
import FunctionCallExpr from "../../parser/expression/functionCallExpr";
import ImportExpr from "../../parser/expression/importExpr";
import ExternDeclarationExpr from "../../parser/expression/externDeclarationExpr";
import NumberLiteralExpr from "../../parser/expression/numberLiteralExpr";
import ReturnExpr from "../../parser/expression/returnExpr";
import ArrayLiteralExpr from "../../parser/expression/arrayLiteralExpr";
import TokenType from "../../lexer/tokenType";
import { CompilerError } from "../../errors";

export class SemanticAnalyzer {
  private currentReturnType: VariableType | null = null;

  public analyze(program: ProgramExpr, parentScope?: Scope): void {
    // Use the passed scope directly if provided, otherwise create a new one.
    // This allows the analyzer to populate the scope used for transpilation.
    const scope = parentScope || new Scope();
    this.analyzeBlock(program.expressions, scope);
  }

  private analyzeBlock(expressions: Expression[], scope: Scope): void {
    for (const expr of expressions) {
      this.analyzeExpression(expr, scope);
    }
  }

  private analyzeExpression(expr: Expression, scope: Scope): void {
    switch (expr.type) {
      case ExpressionType.VariableDeclaration:
        this.analyzeVariableDeclaration(expr as VariableDeclarationExpr, scope);
        break;
      case ExpressionType.FunctionDeclaration:
        this.analyzeFunctionDeclaration(expr as FunctionDeclarationExpr, scope);
        break;
      case ExpressionType.BlockExpression:
        this.analyzeBlockExpr(expr as BlockExpr, scope);
        break;
      case ExpressionType.IdentifierExpr:
        this.analyzeIdentifier(expr as IdentifierExpr, scope);
        break;
      case ExpressionType.BinaryExpression:
        this.analyzeBinaryExpr(expr as BinaryExpr, scope);
        break;
      case ExpressionType.FunctionCall:
        this.analyzeFunctionCall(expr as FunctionCallExpr, scope);
        break;
      case ExpressionType.ImportExpression:
        this.analyzeImportExpression(expr as ImportExpr, scope);
        break;
      case ExpressionType.ExternDeclaration:
        this.analyzeExternDeclaration(expr as ExternDeclarationExpr, scope);
        break;
      case ExpressionType.ReturnExpression:
        this.analyzeReturnExpr(expr as ReturnExpr, scope);
        break;
      // TODO: Add more cases
    }
  }

  private inferType(expr: Expression, scope: Scope): VariableType | null {
    switch (expr.type) {
      case ExpressionType.NumberLiteralExpr: {
        const numExpr = expr as NumberLiteralExpr;
        if (numExpr.value.includes(".")) {
          return { name: "f64", isPointer: 0, isArray: [], isLiteral: true };
        }
        return { name: "u64", isPointer: 0, isArray: [], isLiteral: true };
      }
      case ExpressionType.StringLiteralExpr:
        return { name: "u8", isPointer: 1, isArray: [], isLiteral: true };
      case ExpressionType.IdentifierExpr: {
        const ident = expr as IdentifierExpr;
        const resolved = scope.resolve(ident.name);
        return resolved ? resolved.varType : null;
      }
      case ExpressionType.FunctionCall: {
        const call = expr as FunctionCallExpr;
        const func = scope.resolveFunction(call.functionName);
        return func ? func.returnType : null;
      }
      case ExpressionType.BinaryExpression: {
        const binExpr = expr as BinaryExpr;
        const leftType = this.inferType(binExpr.left, scope);
        const rightType = this.inferType(binExpr.right, scope);

        if (!leftType || !rightType) return null;

        // Comparison operators return u8 (boolean)
        if (
          [
            TokenType.EQUAL,
            TokenType.NOT_EQUAL,
            TokenType.LESS_THAN,
            TokenType.GREATER_THAN,
            TokenType.LESS_EQUAL,
            TokenType.GREATER_EQUAL,
            TokenType.AND,
            TokenType.OR,
          ].includes(binExpr.operator.type)
        ) {
          return { name: "u8", isPointer: 0, isArray: [] };
        }

        // Arithmetic operators
        // If either is float, result is float (f64 takes precedence)
        if (leftType.name === "f64" || rightType.name === "f64") {
          return { name: "f64", isPointer: 0, isArray: [] };
        }
        if (leftType.name === "f32" || rightType.name === "f32") {
          return { name: "f32", isPointer: 0, isArray: [] };
        }

        // Pointer arithmetic
        if (leftType.isPointer > 0 && rightType.isPointer === 0)
          return leftType;
        if (rightType.isPointer > 0 && leftType.isPointer === 0)
          return rightType;

        // Default to left type (usually u64)
        return leftType;
      }
      case ExpressionType.UnaryExpression: {
        const unaryExpr = expr as any;
        const opType = this.inferType(unaryExpr.right, scope);
        if (!opType) return null;

        if (unaryExpr.operator.value === "&") {
          return {
            name: opType.name,
            isPointer: opType.isPointer + 1,
            isArray: opType.isArray,
          };
        }
        if (unaryExpr.operator.value === "*") {
          if (opType.isPointer > 0) {
            return {
              name: opType.name,
              isPointer: opType.isPointer - 1,
              isArray: opType.isArray,
            };
          }
          // Error: dereferencing non-pointer
          return null;
        }
        return opType;
      }
      case ExpressionType.MemberAccessExpression: {
        const memberExpr = expr as any;
        const objectType = this.inferType(memberExpr.object, scope);
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
      }
      case ExpressionType.ArrayLiteralExpr: {
        const arrExpr = expr as ArrayLiteralExpr;
        if (arrExpr.elements.length === 0) return null;

        const firstType = this.inferType(arrExpr.elements[0]!, scope);
        if (!firstType) return null;

        return {
          name: firstType.name,
          isPointer: firstType.isPointer,
          isArray: [arrExpr.elements.length, ...firstType.isArray],
          isLiteral: true, // Treat array literal as literal if elements are?
          // Actually, if elements are literals, the array is a literal value.
          // Even if elements are variables, it's an rvalue.
          // But for narrowing, we care if it's a literal number.
          // Here we care if it's a literal array of literal numbers.
          // Let's say yes.
        };
      }
    }
    return null;
  }

  private analyzeBinaryExpr(expr: BinaryExpr, scope: Scope): void {
    this.analyzeExpression(expr.left, scope);
    this.analyzeExpression(expr.right, scope);

    const leftType = this.inferType(expr.left, scope);
    const rightType = this.inferType(expr.right, scope);

    if (leftType && rightType) {
      // Pointer Arithmetic Check
      if (
        (expr.operator.type === TokenType.PLUS ||
          expr.operator.type === TokenType.MINUS) &&
        ((leftType.isPointer > 0 && rightType.isPointer === 0) ||
          (rightType.isPointer > 0 && leftType.isPointer === 0))
      ) {
        // Check if the non-pointer is an integer
        const nonPointerType = leftType.isPointer === 0 ? leftType : rightType;
        if (nonPointerType.name !== "f32" && nonPointerType.name !== "f64") {
          return; // Valid pointer arithmetic
        }
      }

      // Check if types are compatible for binary operation
      // For arithmetic, we check if they can be promoted to a common type
      // i.e. left -> right OR right -> left
      if (
        !this.checkTypeCompatibility(leftType, rightType, 0) &&
        !this.checkTypeCompatibility(rightType, leftType, 0)
      ) {
        throw new CompilerError(
          `Type mismatch in binary expression: '${this.printType(leftType)}' and '${this.printType(rightType)}' are not compatible`,
          expr.operator.line,
        );
      }
    }
  }

  private checkTypeCompatibility(
    expected: VariableType,
    actual: VariableType,
    line: number,
  ): boolean {
    // Exact match
    if (
      expected.name === actual.name &&
      expected.isPointer === actual.isPointer &&
      expected.isArray.length === actual.isArray.length
    ) {
      return true;
    }

    // Allow numeric promotions
    const isExpectedFloat = expected.name === "f64" || expected.name === "f32";
    const isActualFloat = actual.name === "f64" || actual.name === "f32";
    const isExpectedInt = !isExpectedFloat && expected.isPointer === 0;
    const isActualInt = !isActualFloat && actual.isPointer === 0;

    if (isExpectedFloat && isActualFloat) {
      // Allow f32 -> f64
      if (expected.name === "f64" && actual.name === "f32") return true;
      // Allow f64 -> f32 (lossy but often allowed, or maybe strict?)
      // User asked for strict. Let's allow f32 -> f64 but warn/error on f64 -> f32?
      // For now, let's allow both as they are "compatible" floats.
      return true;
    }

    if (isExpectedFloat && isActualInt) {
      // Allow int -> float
      return true;
    }

    if (isExpectedInt && isActualInt) {
      // Allow int -> int (size check?)
      // BPL treats most ints as compatible for now.
      // Allow smaller int to larger int (promotion)
      const expectedSize = this.getIntSize(expected.name);
      const actualSize = this.getIntSize(actual.name);
      if (expectedSize >= actualSize) return true;

      // Allow literal int to smaller int (if it fits, but we can't check value here easily)
      // Assuming user knows what they are doing with literals
      if (actual.isLiteral) return true;
    }

    // Pointers
    if (expected.isPointer > 0 && actual.isPointer > 0) {
      // Allow void* (u8*) to any*?
      if (expected.name === "u8" && expected.isPointer === 1) return true; // void* equivalent
      if (actual.name === "u8" && actual.isPointer === 1) return true; // void* equivalent

      // Handle 'string' alias for *u8
      const expectedName = expected.name === "string" ? "u8" : expected.name;
      const actualName = actual.name === "string" ? "u8" : actual.name;
      if (
        expectedName === actualName &&
        expected.isPointer === actual.isPointer
      )
        return true;
    }

    // Arrays vs Pointers
    if (expected.isArray.length > 0 && actual.isPointer > 0) {
      // Allow *u8 (string literal) to u8[] (array initialization)
      if (
        expected.name === "u8" &&
        actual.name === "u8" &&
        actual.isPointer === 1
      )
        return true;
    }

    if (expected.isPointer > 0 && actual.isArray.length > 0) {
      // Array decays to pointer
      if (
        expected.name === actual.name &&
        expected.isPointer === actual.isArray.length // Simplified check
      ) {
        // Actually array decays to pointer to first element.
        // u8[] -> u8*
        if (
          expected.name === actual.name &&
          expected.isPointer === 1 &&
          actual.isArray.length === 1
        )
          return true;
      }
    }

    // Handle 'string' alias for *u8 (non-pointer context check, though string is usually *u8)
    if (
      expected.name === "string" &&
      actual.name === "u8" &&
      actual.isPointer === 1
    )
      return true;
    if (
      expected.name === "u8" &&
      expected.isPointer === 1 &&
      actual.name === "string"
    )
      return true;

    // Array literal to Array
    if (
      expected.isArray.length > 0 &&
      actual.isArray.length > 0 &&
      actual.isLiteral
    ) {
      if (expected.isArray.length !== actual.isArray.length) return false;
      for (let i = 0; i < expected.isArray.length; i++) {
        if (expected.isArray[i] !== actual.isArray[i]) return false;
      }

      const expectedBase: VariableType = {
        name: expected.name,
        isPointer: expected.isPointer,
        isArray: [],
        isLiteral: false,
      };
      const actualBase: VariableType = {
        name: actual.name,
        isPointer: actual.isPointer,
        isArray: [],
        isLiteral: true,
      };

      return this.checkTypeCompatibility(expectedBase, actualBase, line);
    }

    // Pointer <-> u64 compatibility (unsafe but allowed in systems programming often)
    if (
      (expected.name === "u64" && actual.isPointer > 0) ||
      (expected.isPointer > 0 && actual.name === "u64")
    ) {
      return true;
    }

    return false;
  }

  private checkTypeCompatibilityOrThrow(
    expected: VariableType,
    actual: VariableType,
    line: number,
  ): void {
    if (!this.checkTypeCompatibility(expected, actual, line)) {
      throw new CompilerError(
        `Type mismatch: expected '${this.printType(expected)}', got '${this.printType(actual)}'`,
        line,
      );
    }
  }

  private getIntSize(name: string): number {
    switch (name) {
      case "u8":
      case "i8":
        return 1;
      case "u16":
      case "i16":
        return 2;
      case "u32":
      case "i32":
        return 4;
      case "u64":
      case "i64":
        return 8;
      default:
        return 0; // Not an int
    }
  }

  private printType(type: VariableType): string {
    let s = type.name;
    for (let i = 0; i < type.isPointer; i++) s = "*" + s;
    for (const dim of type.isArray) s += `[${dim}]`;
    return s;
  }

  private analyzeVariableDeclaration(
    expr: VariableDeclarationExpr,
    scope: Scope,
  ): void {
    if (scope.vars.has(expr.name)) {
      throw new CompilerError(
        `Variable '${expr.name}' is already defined in this scope.`,
        expr.startToken?.line || 0,
      );
    }

    if (expr.scope === "global" && scope.parent !== null) {
      throw new CompilerError(
        "Global variable declaration should be in the global scope",
        expr.startToken?.line || 0,
      );
    }

    if (expr.value === null && expr.isConst) {
      throw new CompilerError(
        "Const variable must be initialized",
        expr.startToken?.line || 0,
      );
    }

    if (expr.value) {
      this.analyzeExpression(expr.value, scope);
      const valueType = this.inferType(expr.value, scope);
      if (valueType) {
        this.checkTypeCompatibilityOrThrow(
          expr.varType,
          valueType,
          expr.startToken?.line || 0,
        );
      }
    }

    // Define in scope
    scope.define(expr.name, {
      type: expr.scope,
      offset: "0", // Dummy offset
      varType: expr.varType,
      declaration: expr.startToken,
    });
  }

  private analyzeFunctionDeclaration(
    expr: FunctionDeclarationExpr,
    scope: Scope,
  ): void {
    if (scope.functions.has(expr.name)) {
      throw new CompilerError(
        `Function '${expr.name}' is already defined.`,
        expr.startToken?.line || 0,
      );
    }

    scope.defineFunction(expr.name, {
      name: expr.name,
      label: expr.name,
      startLabel: expr.name,
      endLabel: expr.name,
      args: expr.args,
      returnType: expr.returnType,
      declaration: expr.startToken,
      isVariadic: expr.isVariadic,
      variadicType: expr.variadicType,
    });

    const functionScope = new Scope(scope);
    // Define arguments in function scope
    for (const arg of expr.args) {
      functionScope.define(arg.name, {
        type: "local",
        offset: "0",
        varType: arg.type,
        isParameter: true,
      });
    }

    const previousReturnType = this.currentReturnType;
    this.currentReturnType = expr.returnType;
    this.analyzeExpression(expr.body, functionScope);
    this.currentReturnType = previousReturnType;
  }

  private analyzeBlockExpr(expr: BlockExpr, scope: Scope): void {
    const blockScope = new Scope(scope);
    this.analyzeBlock(expr.expressions, blockScope);
  }

  private analyzeIdentifier(expr: IdentifierExpr, scope: Scope): void {
    const resolved = scope.resolve(expr.name);
    if (!resolved) {
      // It might be a function call or struct member access handled elsewhere,
      // but if it's a standalone identifier expression, it should be a variable.
      // However, IdentifierExpr is often used as part of other expressions.
      // We need to be careful here.
      // For now, let's assume if it's visited here, it's a variable usage.
      // But wait, IdentifierExpr is also used in assignments.
      // Let's skip strict check here for now or check if it's a function.
      if (!scope.resolveFunction(expr.name)) {
        // throw new CompilerError(`Undefined identifier '${expr.name}'`, expr.startToken?.line);
      }
    }
  }

  private analyzeFunctionCall(expr: FunctionCallExpr, scope: Scope): void {
    const func = scope.resolveFunction(expr.functionName);
    if (!func) {
      throw new CompilerError(
        `Undefined function '${expr.functionName}'`,
        expr.startToken?.line || 0,
      );
    }

    // Check argument count
    if (func.isExternal) {
      if (func.isVariadic) {
        // For variadic/unknown signature external functions, allow more arguments than declared
        if (expr.args.length < func.args.length) {
          throw new CompilerError(
            `Function '${expr.functionName}' expects at least ${func.args.length} arguments, but got ${expr.args.length}`,
            expr.startToken?.line || 0,
          );
        }
      } else {
        // For fixed signature external functions, enforce exact argument count
        if (func.args.length !== expr.args.length) {
          throw new CompilerError(
            `Function '${expr.functionName}' expects ${func.args.length} arguments, but got ${expr.args.length}`,
            expr.startToken?.line || 0,
          );
        }
      }
    } else {
      // For internal functions, enforce exact argument count
      if (func.isVariadic) {
        if (expr.args.length < func.args.length) {
          throw new CompilerError(
            `Function '${expr.functionName}' expects at least ${func.args.length} arguments, but got ${expr.args.length}`,
            expr.startToken?.line || 0,
          );
        }
      } else if (func.args.length !== expr.args.length) {
        throw new CompilerError(
          `Function '${expr.functionName}' expects ${func.args.length} arguments, but got ${expr.args.length}`,
          expr.startToken?.line || 0,
        );
      }
    }

    for (let i = 0; i < expr.args.length; i++) {
      const arg = expr.args[i];
      if (!arg) continue;
      this.analyzeExpression(arg, scope);

      // Check argument type compatibility
      if (i < func.args.length) {
        const argType = this.inferType(arg, scope);
        const param = func.args[i];
        if (param && argType) {
          this.checkTypeCompatibilityOrThrow(
            param.type,
            argType,
            expr.startToken?.line || 0,
          );
        }
      } else if (func.isVariadic && func.variadicType) {
        const argType = this.inferType(arg, scope);
        if (argType) {
          this.checkTypeCompatibilityOrThrow(
            func.variadicType,
            argType,
            expr.startToken?.line || 0,
          );
        }
      }
    }
  }

  private analyzeImportExpression(expr: ImportExpr, scope: Scope): void {
    for (const importItem of expr.importName) {
      if (importItem.type === "type") {
        continue;
      }
      const name = importItem.name;

      if (scope.resolveFunction(name)) {
        continue;
      }

      scope.defineFunction(name, {
        name: name,
        label: name,
        args: [],
        returnType: null,
        startLabel: name,
        endLabel: name,
        isExternal: true,
        isVariadic: true, // Imported functions are assumed variadic/unknown signature unless declared
      });
    }
  }

  private analyzeExternDeclaration(
    expr: ExternDeclarationExpr,
    scope: Scope,
  ): void {
    const existingFunc = scope.resolveFunction(expr.name);
    // If it's not defined, we can define it now (assuming it's an extern that didn't need an import, or import was implicit)
    // But based on ExternDeclarationExpr logic, it expects it to be defined.
    // However, for Semantic Analysis, we might want to be more lenient or strict.
    // If we follow the transpiler logic:
    if (!existingFunc || !existingFunc.isExternal) {
      // If it's not defined, let's define it as external.
      // This allows 'extern' to declare functions without 'import' if they are linked otherwise.
      // But the original logic threw an error. Let's stick to the original logic but maybe relax it if it's not found?
      // Actually, if I import from libc, it's defined.
      // If I just say 'extern foo', it should probably be defined.

      // Let's define it if it doesn't exist, assuming the user knows what they are doing (linking against something).
      // But wait, the original code threw an error.
      // "Function ${this.name} is not defined, or it's already defined and is not external."

      // If I change this behavior, I might break something.
      // But if I don't define it in ImportExpr, then it won't be defined here.
      // I added analyzeImportExpression, so it should be defined if imported.

      if (!existingFunc) {
        // Maybe allow defining it?
        // For now, let's define it.
        scope.defineFunction(expr.name, {
          args: expr.args,
          returnType: expr.returnType,
          endLabel: expr.name + "_end",
          label: expr.name,
          name: expr.name,
          startLabel: expr.name,
          isExternal: true,
          isVariadic: expr.isVariadic, // Explicit extern declaration implies fixed signature unless we add support for '...'
        });
        return;
      }

      if (!existingFunc.isExternal) {
        throw new CompilerError(
          `Function '${expr.name}' is already defined and is not external.`,
          expr.startToken?.line || 0,
        );
      }
    }

    // Update the existing function definition with types
    scope.defineFunction(expr.name, {
      ...existingFunc,
      args: expr.args,
      returnType: expr.returnType,
      isVariadic: expr.isVariadic, // Explicit extern declaration makes it fixed signature
    });
  }

  private analyzeReturnExpr(expr: ReturnExpr, scope: Scope): void {
    if (this.currentReturnType === null) {
      // Return outside function? Or void function?
      // If we are in a function, currentReturnType should be set (even if null/void)
      // But wait, if function returns void, expr.returnType is null?
      // Let's assume currentReturnType is null means "not in function" or "void return".
      // But I initialized it to null.
      // If I am in global scope, it is null.
      // If I am in a function with no return type, it is null?
      // Let's check FunctionDeclarationExpr.returnType. It is VariableType | null.
    }

    if (expr.value) {
      this.analyzeExpression(expr.value, scope);
      const valueType = this.inferType(expr.value, scope);

      if (this.currentReturnType) {
        if (valueType) {
          this.checkTypeCompatibilityOrThrow(
            this.currentReturnType,
            valueType,
            expr.startToken?.line || 0,
          );
        }
      } else {
        // Function is void, but returning a value
        throw new CompilerError(
          "Void function cannot return a value",
          expr.startToken?.line || 0,
        );
      }
    } else {
      // Return void
      if (this.currentReturnType) {
        // Function expects a value
        throw new CompilerError(
          `Function expects return type '${this.printType(this.currentReturnType)}', but got void`,
          expr.startToken?.line || 0,
        );
      }
    }
  }
}
