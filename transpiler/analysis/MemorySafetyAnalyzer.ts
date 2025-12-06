import { CompilerError, CompilerWarning } from "../../errors";
import TokenType from "../../lexer/tokenType";
import BinaryExpr from "../../parser/expression/binaryExpr";
import BlockExpr from "../../parser/expression/blockExpr";
import Expression from "../../parser/expression/expr";
import FunctionCallExpr from "../../parser/expression/functionCallExpr";
import FunctionDeclarationExpr from "../../parser/expression/functionDeclaration";
import IdentifierExpr from "../../parser/expression/identifierExpr";
import IfExpr from "../../parser/expression/ifExpr";
import LoopExpr from "../../parser/expression/loopExpr";
import MemberAccessExpr from "../../parser/expression/memberAccessExpr";
import NumberLiteralExpr from "../../parser/expression/numberLiteralExpr";
import ProgramExpr from "../../parser/expression/programExpr";
import ReturnExpr from "../../parser/expression/returnExpr";
import UnaryExpr from "../../parser/expression/unaryExpr";
import VariableDeclarationExpr, {
  type VariableType,
} from "../../parser/expression/variableDeclarationExpr";
import ExpressionType from "../../parser/expressionType";
import Scope from "../Scope";

interface PointerInfo {
  name: string;
  isDereferenced: boolean;
  isNullChecked: boolean;
  isInitialized: boolean;
  isMallocated: boolean;
  isFreed: boolean;
  line: number;
}

interface BufferInfo {
  name: string;
  size: number | "unknown";
  accessedAt: number[];
  line: number;
}

export class MemorySafetyAnalyzer {
  private pointers: Map<string, PointerInfo> = new Map();
  private buffers: Map<string, BufferInfo> = new Map();
  private currentFunction: string | null = null;
  public warnings: CompilerWarning[] = [];
  public errors: CompilerError[] = [];

  public analyze(program: ProgramExpr, scope: Scope): void {
    this.analyzeExpression(program, scope);
  }

  private analyzeExpression(expr: Expression, scope: Scope): void {
    switch (expr.type) {
      case ExpressionType.Program:
        this.analyzeProgram(expr as ProgramExpr, scope);
        break;
      case ExpressionType.BlockExpression:
        this.analyzeBlock(expr as BlockExpr, scope);
        break;
      case ExpressionType.FunctionDeclaration:
        this.analyzeFunctionDeclaration(expr as FunctionDeclarationExpr, scope);
        break;
      case ExpressionType.VariableDeclaration:
        this.analyzeVariableDeclaration(expr as VariableDeclarationExpr, scope);
        break;
      case ExpressionType.BinaryExpression:
        this.analyzeBinaryExpr(expr as BinaryExpr, scope);
        break;
      case ExpressionType.UnaryExpression:
        this.analyzeUnaryExpr(expr as UnaryExpr, scope);
        break;
      case ExpressionType.MemberAccessExpression:
        this.analyzeMemberAccess(expr as MemberAccessExpr, scope);
        break;
      case ExpressionType.IdentifierExpr:
        this.analyzeIdentifier(expr as IdentifierExpr, scope);
        break;
      case ExpressionType.FunctionCall:
        this.analyzeFunctionCall(expr as FunctionCallExpr, scope);
        break;
      case ExpressionType.ReturnExpression:
        this.analyzeReturn(expr as ReturnExpr, scope);
        break;
      case ExpressionType.IfExpression:
        this.analyzeIf(expr as IfExpr, scope);
        break;
      case ExpressionType.LoopExpression:
        this.analyzeLoop(expr as LoopExpr, scope);
        break;
      default:
        this.visitChildren(expr, scope);
        break;
    }
  }

  private analyzeProgram(expr: ProgramExpr, scope: Scope): void {
    for (const child of expr.expressions) {
      this.analyzeExpression(child, scope);
    }
  }

  private analyzeBlock(expr: BlockExpr, scope: Scope): void {
    const blockScope = new Scope(scope);
    for (const child of expr.expressions) {
      this.analyzeExpression(child, blockScope);
    }
  }

  private analyzeFunctionDeclaration(
    expr: FunctionDeclarationExpr,
    scope: Scope,
  ): void {
    const previousFunction = this.currentFunction;
    this.currentFunction = expr.name;

    // Define function in current scope if not already defined
    if (!scope.resolveFunction(expr.name)) {
      scope.defineFunction(expr.name, {
        name: expr.name,
        label: expr.name,
        startLabel: expr.name,
        endLabel: expr.name,
        args: expr.args,
        returnType: expr.returnType,
        declaration: expr.startToken,
      });
    }

    // Create new scope for function to track local pointers
    const functionScope = new Scope(scope);
    const functionPointers = new Map(this.pointers);
    const functionBuffers = new Map(this.buffers);

    // Track pointer parameters
    for (const arg of expr.args) {
      // Define arg in function scope
      functionScope.define(arg.name, {
        type: "local",
        offset: "0",
        varType: arg.type,
        isParameter: true,
      });

      if (arg.type.isPointer > 0) {
        this.pointers.set(arg.name, {
          name: arg.name,
          isDereferenced: false,
          isNullChecked: false,
          isInitialized: true, // Function parameters are assumed initialized
          isMallocated: false,
          isFreed: false,
          line: expr.startToken?.line || 0,
        });
      }
      if (arg.type.isArray.length > 0) {
        const size =
          arg.type.isArray.length > 0 ? arg.type.isArray[0] : "unknown";
        this.buffers.set(arg.name, {
          name: arg.name,
          size: size || "unknown",
          accessedAt: [],
          line: expr.startToken?.line || 0,
        });
      }
    }

    this.analyzeExpression(expr.body, functionScope);

    // Check for memory leaks (allocated but not freed)
    for (const [name, info] of this.pointers) {
      if (info.isMallocated && !info.isFreed) {
        this.warnings.push(
          new CompilerWarning(
            `Potential memory leak: pointer '${name}' allocated with malloc but never freed`,
            info.line,
            "Call free() before function returns or when pointer is no longer needed",
          ),
        );
      }
    }

    // Restore previous state
    this.pointers = functionPointers;
    this.buffers = functionBuffers;
    this.currentFunction = previousFunction;
  }

  private analyzeVariableDeclaration(
    expr: VariableDeclarationExpr,
    scope: Scope,
  ): void {
    const line = expr.startToken?.line || 0;

    // Define in scope if not already defined (or if it's a local scope which shadows)
    // Note: Scope.define overwrites, so we check first to preserve SemanticAnalyzer's info for globals
    if (expr.scope === "local" || !scope.resolve(expr.name)) {
      scope.define(expr.name, {
        type: expr.scope,
        offset: "0",
        varType: expr.varType,
        declaration: expr.startToken,
      });
    }

    // Track pointer declarations
    if (expr.varType.isPointer > 0) {
      const isNullInitialized =
        expr.value &&
        (expr.value.type === ExpressionType.NullLiteralExpr ||
          (expr.value.type === ExpressionType.NumberLiteralExpr &&
            (expr.value as NumberLiteralExpr).value === "0") ||
          (expr.value.type === ExpressionType.IdentifierExpr &&
            (expr.value as IdentifierExpr).name === "null"));

      let isMallocated = false;
      if (expr.value && expr.value.type === ExpressionType.FunctionCall) {
        const call = expr.value as FunctionCallExpr;
        if (call.functionName === "malloc" || call.functionName === "calloc") {
          isMallocated = true;
        }
      }

      this.pointers.set(expr.name, {
        name: expr.name,
        isDereferenced: false,
        isNullChecked: isNullInitialized ? false : true, // Null pointers need checking
        isInitialized: expr.value !== null,
        isMallocated: isMallocated,
        isFreed: false,
        line,
      });

      if (!expr.value) {
        this.warnings.push(
          new CompilerWarning(
            `Uninitialized pointer '${expr.name}' may lead to undefined behavior`,
            line,
            "Initialize pointer to null or a valid address",
          ),
        );
      } else if (isNullInitialized) {
        this.warnings.push(
          new CompilerWarning(
            `Pointer '${expr.name}' initialized to null should be checked before dereferencing`,
            line,
            "Add null check before dereferencing",
          ),
        );
      }
    }

    // Track array/buffer declarations
    if (expr.varType.isArray.length > 0) {
      const size =
        expr.varType.isArray.length > 0 ? expr.varType.isArray[0] : "unknown";
      this.buffers.set(expr.name, {
        name: expr.name,
        size: size || "unknown",
        accessedAt: [],
        line,
      });
    }

    // Check for signed integer overflow in initialization
    if (expr.value) {
      this.checkIntegerOverflow(expr.value, expr.varType, scope, line);
      this.analyzeExpression(expr.value, scope);
    }
  }

  private analyzeBinaryExpr(expr: BinaryExpr, scope: Scope): void {
    const line = expr.operator.line;

    // Handle assignment operators
    const assignmentOperators = [
      TokenType.ASSIGN,
      TokenType.PLUS_ASSIGN,
      TokenType.MINUS_ASSIGN,
      TokenType.STAR_ASSIGN,
      TokenType.SLASH_ASSIGN,
      TokenType.PERCENT_ASSIGN,
      TokenType.CARET_ASSIGN,
      TokenType.AMPERSAND_ASSIGN,
      TokenType.PIPE_ASSIGN,
    ];

    if (assignmentOperators.includes(expr.operator.type)) {
      this.analyzeExpression(expr.right, scope);

      // For array/member access on LHS, we need to analyze it (e.g. for bounds checks)
      if (expr.left.type !== ExpressionType.IdentifierExpr) {
        this.analyzeExpression(expr.left, scope);
      }

      // Handle assignment to pointer (track malloc, etc.)
      if (expr.left.type === ExpressionType.IdentifierExpr) {
        const targetName = (expr.left as IdentifierExpr).name;
        const pointerInfo = this.pointers.get(targetName);

        if (pointerInfo) {
          if (expr.operator.type === TokenType.ASSIGN) {
            // Simple assignment: overwrites the pointer, so it's no longer freed
            pointerInfo.isFreed = false;
            pointerInfo.isMallocated = false; // Reset, will be set below if malloc
            pointerInfo.isInitialized = true;
            pointerInfo.isNullChecked = false;
          } else {
            // Compound assignment (+=, etc.): uses the old value
            if (pointerInfo.isFreed) {
              this.errors.push(
                new CompilerError(
                  `Use-after-free: pointer '${targetName}' was freed and is being used in compound assignment`,
                  line,
                ),
              );
            }
          }
        }

        // Track malloc assignments
        if (expr.right.type === ExpressionType.FunctionCall) {
          const funcCall = expr.right as FunctionCallExpr;
          if (funcCall.functionName === "malloc" && pointerInfo) {
            pointerInfo.isMallocated = true;
            pointerInfo.isInitialized = true;
          }
        }

        // Track null assignments
        const isNullAssignment =
          expr.right.type === ExpressionType.NullLiteralExpr ||
          (expr.right.type === ExpressionType.NumberLiteralExpr &&
            (expr.right as NumberLiteralExpr).value === "0") ||
          (expr.right.type === ExpressionType.IdentifierExpr &&
            (expr.right as IdentifierExpr).name === "null");

        if (pointerInfo && isNullAssignment) {
          pointerInfo.isNullChecked = false;
        }
      }
      return;
    }

    this.analyzeExpression(expr.left, scope);
    this.analyzeExpression(expr.right, scope);

    const leftType = this.inferType(expr.left, scope);
    const rightType = this.inferType(expr.right, scope);

    // Check for division by zero
    if (
      expr.operator.type === TokenType.SLASH ||
      expr.operator.type === TokenType.SLASH_SLASH ||
      expr.operator.type === TokenType.PERCENT
    ) {
      if (
        expr.right.type === ExpressionType.NumberLiteralExpr &&
        (expr.right as NumberLiteralExpr).value === "0"
      ) {
        this.errors.push(new CompilerError(`Division by zero detected`, line));
      } else if (expr.right.type === ExpressionType.IdentifierExpr) {
        const rightName = (expr.right as IdentifierExpr).name;
        this.warnings.push(
          new CompilerWarning(
            `Potential division by zero: variable '${rightName}' should be checked before division`,
            line,
            "Add runtime check to ensure divisor is non-zero",
          ),
        );
      }
    }

    // Check for signed integer overflow
    if (
      leftType &&
      rightType &&
      (expr.operator.type === TokenType.PLUS ||
        expr.operator.type === TokenType.MINUS ||
        expr.operator.type === TokenType.STAR ||
        expr.operator.type === TokenType.PERCENT)
    ) {
      if (this.isSignedInteger(leftType) && this.isSignedInteger(rightType)) {
        this.warnings.push(
          new CompilerWarning(
            `Potential signed integer overflow in arithmetic operation`,
            line,
            "Use unsigned types or add overflow checks",
          ),
        );
      }
    }

    // Check for pointer arithmetic overflow
    if (
      leftType?.isPointer &&
      rightType &&
      !rightType.isPointer &&
      (expr.operator.type === TokenType.PLUS ||
        expr.operator.type === TokenType.MINUS)
    ) {
      this.warnings.push(
        new CompilerWarning(
          `Pointer arithmetic may access out-of-bounds memory`,
          line,
          "Ensure pointer arithmetic stays within allocated bounds",
        ),
      );
    }

    // Check for null pointer comparison
    if (
      (expr.operator.type === TokenType.EQUAL ||
        expr.operator.type === TokenType.NOT_EQUAL) &&
      leftType?.isPointer
    ) {
      const leftName = this.getIdentifierName(expr.left);
      if (leftName && this.pointers.has(leftName)) {
        const pointerInfo = this.pointers.get(leftName)!;
        pointerInfo.isNullChecked = true;
      }
    }
  }

  private analyzeUnaryExpr(expr: UnaryExpr, scope: Scope): void {
    const line = expr.operator.line;

    this.analyzeExpression(expr.right, scope);

    // Check for null pointer dereference
    if (expr.operator.value === "*") {
      const rightType = this.inferType(expr.right, scope);
      if (rightType?.isPointer) {
        const name = this.getIdentifierName(expr.right);
        if (name) {
          const pointerInfo = this.pointers.get(name);
          if (pointerInfo) {
            pointerInfo.isDereferenced = true;

            if (!pointerInfo.isInitialized) {
              this.errors.push(
                new CompilerError(
                  `Dereferencing uninitialized pointer '${name}'`,
                  line,
                ),
              );
            } else if (!pointerInfo.isNullChecked) {
              this.warnings.push(
                new CompilerWarning(
                  `Potential null pointer dereference: pointer '${name}' not checked for null`,
                  line,
                  "Add null check before dereferencing",
                ),
              );
            }

            if (pointerInfo.isFreed) {
              this.errors.push(
                new CompilerError(
                  `Use-after-free: dereferencing freed pointer '${name}'`,
                  line,
                ),
              );
            }
          }
        }
      }
    }

    // Check for address-of on temporary/rvalue
    if (expr.operator.value === "&") {
      if (
        expr.right.type === ExpressionType.NumberLiteralExpr ||
        expr.right.type === ExpressionType.StringLiteralExpr
      ) {
        this.warnings.push(
          new CompilerWarning(
            `Taking address of temporary value may lead to dangling pointer`,
            line,
            "Store value in a variable first",
          ),
        );
      }
    }
  }

  private analyzeMemberAccess(expr: MemberAccessExpr, scope: Scope): void {
    const line = expr.startToken?.line || 0;

    // Analyze object first (but not deeply to avoid infinite recursion on complex expressions)
    const objectType = this.inferType(expr.object, scope);
    const objectName = this.getIdentifierName(expr.object);

    if (expr.isIndexAccess) {
      this.analyzeExpression(expr.property, scope);

      // Check for buffer overflow
      if (objectName && objectType) {
        if (objectType.isArray.length > 0) {
          const bufferInfo = this.buffers.get(objectName);
          if (bufferInfo && bufferInfo.size !== "unknown") {
            // Check if index is a constant
            if (expr.property.type === ExpressionType.NumberLiteralExpr) {
              const index = parseInt(
                (expr.property as NumberLiteralExpr).value,
              );
              if (index < 0 || index >= bufferInfo.size) {
                this.errors.push(
                  new CompilerError(
                    `Array index ${index} out of bounds for array '${objectName}' of size ${bufferInfo.size}`,
                    line,
                  ),
                );
              }
              bufferInfo.accessedAt.push(index);
            } else {
              // Runtime index
              this.warnings.push(
                new CompilerWarning(
                  `Unchecked array index for '${objectName}': runtime bounds check recommended`,
                  line,
                  `Ensure index is within range [0, ${bufferInfo.size - 1}]`,
                ),
              );
            }
          }
        } else if (objectType.isPointer > 0) {
          // Pointer indexing
          this.warnings.push(
            new CompilerWarning(
              `Pointer indexing on '${objectName}' may access out-of-bounds memory`,
              line,
              "Ensure pointer points to valid memory and index is within bounds",
            ),
          );
        }
      }
    }

    // Don't recursively analyze object to prevent infinite loops
  }

  private analyzeIdentifier(expr: IdentifierExpr, scope: Scope): void {
    const name = expr.name;
    const pointerInfo = this.pointers.get(name);

    if (pointerInfo && pointerInfo.isFreed) {
      this.errors.push(
        new CompilerError(
          `Use-after-free: accessing freed pointer '${name}'`,
          expr.startToken?.line || 0,
        ),
      );
    }
  }

  private analyzeFunctionCall(expr: FunctionCallExpr, scope: Scope): void {
    const line = expr.startToken?.line || 0;

    // Analyze function arguments first
    for (const arg of expr.args) {
      if (arg) {
        this.analyzeExpression(arg, scope);
      }
    }

    // Check malloc/free patterns
    if (expr.functionName === "malloc") {
      if (expr.args.length > 0) {
        const arg = expr.args[0];
        if (
          arg &&
          arg.type === ExpressionType.NumberLiteralExpr &&
          (arg as NumberLiteralExpr).value === "0"
        ) {
          this.warnings.push(
            new CompilerWarning(
              `malloc(0) has implementation-defined behavior`,
              line,
              "Avoid allocating zero bytes",
            ),
          );
        }
      }
    }

    if (expr.functionName === "free") {
      if (expr.args.length > 0) {
        const arg = expr.args[0];
        const name = this.getIdentifierName(arg!);
        if (name) {
          const pointerInfo = this.pointers.get(name);
          if (pointerInfo) {
            if (pointerInfo.isFreed) {
              this.errors.push(
                new CompilerError(
                  `Double free detected: pointer '${name}' is already freed`,
                  line,
                ),
              );
            } else {
              pointerInfo.isFreed = true;
            }

            if (!pointerInfo.isMallocated) {
              this.warnings.push(
                new CompilerWarning(
                  `Freeing pointer '${name}' that was not allocated with malloc`,
                  line,
                  "Only free dynamically allocated memory",
                ),
              );
            }
          }
        }
      }
    }
  }

  private analyzeReturn(expr: ReturnExpr, scope: Scope): void {
    if (expr.value) {
      this.analyzeExpression(expr.value, scope);

      // Check for returning pointer to local variable
      const returnType = this.inferType(expr.value, scope);
      if (returnType?.isPointer) {
        const name = this.getIdentifierName(expr.value);
        if (name) {
          const varInfo = scope.resolve(name);
          if (varInfo && varInfo.type === "local") {
            this.warnings.push(
              new CompilerWarning(
                `Returning pointer to local variable '${name}' leads to dangling pointer`,
                expr.startToken?.line || 0,
                "Return dynamically allocated memory or use static storage",
              ),
            );
          }
        }
      }
    }
  }

  private analyzeIf(expr: IfExpr, scope: Scope): void {
    this.analyzeExpression(expr.condition, scope);

    // Clone pointer state for branches
    const beforePointers = new Map(this.pointers);

    this.analyzeExpression(expr.thenBranch, scope);

    const afterThenPointers = new Map(this.pointers);
    this.pointers = new Map(beforePointers);

    if (expr.elseBranch) {
      this.analyzeExpression(expr.elseBranch, scope);
    }

    // Merge pointer states (conservative approach)
    for (const [name, thenInfo] of afterThenPointers) {
      const elseInfo = this.pointers.get(name);
      if (elseInfo) {
        // Both branches accessed the pointer
        this.pointers.set(name, {
          name,
          isDereferenced: thenInfo.isDereferenced || elseInfo.isDereferenced,
          isNullChecked: thenInfo.isNullChecked && elseInfo.isNullChecked,
          isInitialized: thenInfo.isInitialized && elseInfo.isInitialized,
          isMallocated: thenInfo.isMallocated || elseInfo.isMallocated,
          isFreed: thenInfo.isFreed && elseInfo.isFreed,
          line: thenInfo.line,
        });
      }
    }
  }

  private analyzeLoop(expr: LoopExpr, scope: Scope): void {
    this.analyzeExpression(expr.body, scope);
  }

  private visitChildren(expr: Expression, scope: Scope): void {
    // Visit all child expressions based on type
    const anyExpr = expr as Record<string, any>;
    for (const key in anyExpr) {
      const value = anyExpr[key];
      if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && item.type) {
              this.analyzeExpression(item, scope);
            }
          }
        } else if (value.type) {
          this.analyzeExpression(value, scope);
        }
      }
    }
  }

  private inferType(expr: Expression, scope: Scope): VariableType | null {
    switch (expr.type) {
      case ExpressionType.NumberLiteralExpr: {
        const numExpr = expr as NumberLiteralExpr;
        if (numExpr.value.includes(".")) {
          return { name: "f64", isPointer: 0, isArray: [] };
        }
        return { name: "u64", isPointer: 0, isArray: [] };
      }
      case ExpressionType.StringLiteralExpr:
        return { name: "u8", isPointer: 1, isArray: [] };
      case ExpressionType.IdentifierExpr: {
        const ident = expr as IdentifierExpr;
        const resolved = scope.resolve(ident.name);
        return resolved ? resolved.varType : null;
      }
      case ExpressionType.UnaryExpression: {
        const unaryExpr = expr as UnaryExpr;
        const operandType = this.inferType(unaryExpr.right, scope);
        if (!operandType) return null;

        if (unaryExpr.operator.value === "&") {
          return {
            name: operandType.name,
            isPointer: operandType.isPointer + 1,
            isArray: operandType.isArray,
          };
        }
        if (unaryExpr.operator.value === "*") {
          if (operandType.isPointer > 0) {
            return {
              name: operandType.name,
              isPointer: operandType.isPointer - 1,
              isArray: operandType.isArray,
            };
          }
        }
        return operandType;
      }
      case ExpressionType.MemberAccessExpression: {
        const memberExpr = expr as MemberAccessExpr;
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
        }
        return null;
      }
      case ExpressionType.BinaryExpression: {
        const binExpr = expr as BinaryExpr;
        const leftType = this.inferType(binExpr.left, scope);
        const rightType = this.inferType(binExpr.right, scope);
        if (!leftType || !rightType) return null;

        // Pointer arithmetic: ptr + int -> ptr
        if (
          leftType.isPointer > 0 &&
          rightType.isPointer === 0 &&
          (binExpr.operator.type === TokenType.PLUS ||
            binExpr.operator.type === TokenType.MINUS)
        ) {
          return leftType;
        }
        if (
          rightType.isPointer > 0 &&
          leftType.isPointer === 0 &&
          binExpr.operator.type === TokenType.PLUS
        ) {
          return rightType;
        }

        // Comparison -> bool (u8)
        if (
          [
            TokenType.EQUAL,
            TokenType.NOT_EQUAL,
            TokenType.LESS_THAN,
            TokenType.LESS_EQUAL,
            TokenType.GREATER_THAN,
            TokenType.GREATER_EQUAL,
          ].includes(binExpr.operator.type)
        ) {
          return { name: "u8", isPointer: 0, isArray: [] };
        }

        // Arithmetic -> left type (simplified)
        return leftType;
      }
      case ExpressionType.FunctionCall: {
        const callExpr = expr as FunctionCallExpr;
        if (
          callExpr.functionName === "malloc" ||
          callExpr.functionName === "calloc"
        ) {
          return { name: "u8", isPointer: 1, isArray: [] };
        }
        const funcInfo = scope.resolveFunction(callExpr.functionName);
        return funcInfo ? funcInfo.returnType : null;
      }
    }
    return null;
  }

  private getIdentifierName(expr: Expression): string | null {
    if (expr.type === ExpressionType.IdentifierExpr) {
      return (expr as IdentifierExpr).name;
    }
    if (expr.type === ExpressionType.UnaryExpression) {
      return this.getIdentifierName((expr as UnaryExpr).right);
    }
    return null;
  }

  private isSignedInteger(type: VariableType): boolean {
    return ["i8", "i16", "i32", "i64"].includes(type.name);
  }

  private checkIntegerOverflow(
    expr: Expression,
    targetType: VariableType,
    scope: Scope,
    line: number,
  ): void {
    if (expr.type === ExpressionType.NumberLiteralExpr) {
      const numExpr = expr as NumberLiteralExpr;
      const value = numExpr.value.includes(".")
        ? parseFloat(numExpr.value)
        : parseInt(numExpr.value);

      if (!isNaN(value) && !numExpr.value.includes(".")) {
        const ranges: Record<string, [number, number]> = {
          i8: [-128, 127],
          u8: [0, 255],
          i16: [-32768, 32767],
          u16: [0, 65535],
          i32: [-2147483648, 2147483647],
          u32: [0, 4294967295],
          // i64 and u64 are too large for JS number, skip for now
        };

        const range = ranges[targetType.name];
        if (range && (value < range[0] || value > range[1])) {
          this.errors.push(
            new CompilerError(
              `Integer literal ${value} out of range for type ${targetType.name} [${range[0]}, ${range[1]}]`,
              line,
            ),
          );
        }
      }
    }
  }
}
