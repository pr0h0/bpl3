import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import Scope from "../../transpiler/Scope";
import type { TypeInfo } from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import ArrayLiteralExpr from "./arrayLiteralExpr";
import BinaryExpr from "./binaryExpr";
import Expression from "./expr";
import NullLiteralExpr from "./nullLiteralExpr";
import NumberLiteralExpr from "./numberLiteralExpr";
import StringLiteralExpr from "./stringLiteralExpr";
import UnaryExpr from "./unaryExpr";
import Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import { IROpcode } from "../../transpiler/ir/IROpcode";
import { resolveExpressionType, getIntSize } from "../../utils/typeResolver";
import StructLiteralExpr from "./structLiteralExpr";

export type VariableType = {
  name: string;
  isPointer: number;
  isArray: number[];
  token?: Token;
  isLiteral?: boolean;
  genericArgs?: VariableType[];
};

export default class VariableDeclarationExpr extends Expression {
  constructor(
    public scope: "global" | "local",
    public isConst: boolean,
    public name: string,
    public varType: VariableType,
    public value: Expression | null,
    public nameToken?: Token,
  ) {
    super(ExpressionType.VariableDeclaration);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ VariableDeclaration ]\n";
    this.depth++;
    output += this.getDepth();
    output += `Scope: ${this.scope}\n`;
    output += this.getDepth();
    output += `IsConst: ${this.isConst}\n`;
    output += this.getDepth();
    output += `Name: ${this.name}\n`;
    output += this.getDepth();
    output += this.printType(this.varType);
    if (this.value) {
      output += this.getDepth();
      output += `Value:\n`;
      output += this.value.toString(this.depth + 1);
    } else {
      output += this.getDepth();
      output += `Value: uninitialized\n`;
    }
    this.depth--;
    output += this.getDepth();
    output += "/[ VariableDeclaration ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  optimize(): Expression {
    if (this.value) {
      this.value = this.value.optimize();
    }
    return this;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    let varType = this.varType;
    if (this.varType.genericArgs && this.varType.genericArgs.length > 0) {
      const typeInfo = scope.resolveGenericType(
        this.varType.name,
        this.varType.genericArgs,
      );
      if (typeInfo) {
        varType = { ...this.varType, name: typeInfo.name, genericArgs: [] };
        gen.registerStruct(typeInfo, scope);
      }
    } else {
      const typeInfo = scope.resolveType(this.varType.name);
      if (typeInfo && !typeInfo.isPrimitive) {
        gen.registerStruct(typeInfo, scope);
      }
    }

    if (this.scope === "global") {
      const irType = gen.getIRType(varType);
      const name = `@${this.name}`;

      let initVal: string | undefined = undefined;
      if (this.value instanceof NumberLiteralExpr) {
        initVal = this.value.value;
      }

      gen.module.addGlobal(name, irType, initVal);

      scope.define(this.name, {
        type: "global",
        offset: name,
        varType: varType,
        irName: name,
      });
      return name;
    }

    const irType = gen.getIRType(varType);
    const ptr = gen.emitAlloca(irType, this.name);

    scope.define(this.name, {
      type: "local",
      offset: "0",
      varType: varType,
      irName: ptr,
    });

    if (this.value) {
      if (this.varType.isArray.length > 0) {
        if (this.value instanceof StringLiteralExpr) {
          const srcPtr = this.value.toIR(gen, scope);
          const unescaped = (this.value as StringLiteralExpr).value
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .replace(/\\r/g, "\r")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
          const byteLength = unescaped.length + 1;

          gen.ensureIntrinsic(
            "llvm.memcpy.p0.p0.i64",
            [
              { name: "dest", type: { type: "pointer", base: { type: "i8" } } },
              { name: "src", type: { type: "pointer", base: { type: "i8" } } },
              { name: "len", type: { type: "i64" } },
              { name: "isvolatile", type: { type: "i1" } },
            ],
            { type: "void" },
          );

          gen.emitCall(
            "llvm.memcpy.p0.p0.i64",
            [
              { value: ptr, type: { type: "pointer", base: { type: "i8" } } },
              {
                value: srcPtr,
                type: { type: "pointer", base: { type: "i8" } },
              },
              { value: byteLength.toString(), type: { type: "i64" } },
              { value: "false", type: { type: "i1" } },
            ],
            { type: "void" },
          );
        } else if (this.value instanceof ArrayLiteralExpr) {
          this.value.elements.forEach((elem, index) => {
            const val = elem.toIR(gen, scope);
            const elemPtr = gen.emitGEP(irType, ptr, ["0", index.toString()]);
            const elemType = gen.getIRType({
              ...this.varType,
              isArray: this.varType.isArray.slice(1),
            });
            gen.emitStore(elemType, val, elemPtr);
          });
        } else if (this.value instanceof StructLiteralExpr) {
          const structType = scope.resolveType(this.varType.name);
          if (!structType || structType.isPrimitive) {
            throw new Error(
              `Cannot initialize non-struct type '${this.varType.name}' with struct literal`,
            );
          }
          this.initializeStruct(gen, scope, ptr, structType, this.value);
        }
      } else if (this.value instanceof StructLiteralExpr) {
        const structType = scope.resolveType(this.varType.name);
        if (!structType || structType.isPrimitive) {
          throw new Error(
            `Cannot initialize non-struct type '${this.varType.name}' with struct literal`,
          );
        }
        this.initializeStruct(gen, scope, ptr, structType, this.value);
      } else {
        let val = this.value.toIR(gen, scope);
        const valType = resolveExpressionType(this.value, scope);

        if (valType && valType.name !== this.varType.name) {
          let srcType = gen.getIRType(valType);
          const destType = irType;

          const isSrcPointer =
            valType.isPointer > 0 || valType.isArray.length > 0;
          const isDestPointer =
            this.varType.isPointer > 0 || this.varType.isArray.length > 0;

          if (isSrcPointer && isDestPointer) {
            // Pointer to Pointer - no cast needed for opaque pointers
          } else if (isSrcPointer && !isDestPointer) {
            // Pointer to Int
            // Ensure srcType is treated as pointer for the cast
            if (valType.isArray.length > 0) {
              // Arrays are pointers in IR
              srcType = { type: "pointer", base: { type: "i8" } };
            }
            val = gen.emitCast(IROpcode.PTR_TO_INT, val, destType, srcType);
          } else if (!isSrcPointer && isDestPointer) {
            // Int to Pointer
            val = gen.emitCast(IROpcode.INT_TO_PTR, val, destType, srcType);
          } else {
            const isSrcFloat = valType.name === "f64" || valType.name === "f32";
            const isDestFloat =
              this.varType.name === "f64" || this.varType.name === "f32";

            if (isSrcFloat && !isDestFloat) {
              // Float to Int
              val = gen.emitCast(IROpcode.FP_TO_SI, val, destType, srcType);
            } else if (!isSrcFloat && isDestFloat) {
              // Int to Float
              val = gen.emitCast(IROpcode.SI_TO_FP, val, destType, srcType);
            } else if (isSrcFloat && isDestFloat) {
              // Float to Float
              if (valType.name === "f64" && this.varType.name === "f32") {
                val = gen.emitCast(IROpcode.FP_TRUNC, val, destType, srcType);
              } else if (
                valType.name === "f32" &&
                this.varType.name === "f64"
              ) {
                val = gen.emitCast(IROpcode.FP_EXT, val, destType, srcType);
              }
            } else {
              // Int to Int
              const srcSize = getIntSize(valType.name);
              const destSize = getIntSize(this.varType.name);

              if (srcSize < destSize) {
                const isSigned = ["i8", "i16", "i32", "i64"].includes(
                  valType.name,
                );
                val = gen.emitCast(
                  isSigned ? IROpcode.SEXT : IROpcode.ZEXT,
                  val,
                  destType,
                  srcType,
                );
              } else if (srcSize > destSize) {
                val = gen.emitCast(IROpcode.TRUNC, val, destType, srcType);
              }
            }
          }
        }

        gen.emitStore(irType, val, ptr);
      }
    }
    return ptr;
  }

  private initializeStruct(
    gen: IRGenerator,
    scope: Scope,
    ptr: string,
    structType: TypeInfo,
    literal: StructLiteralExpr,
  ) {
    // Check if mixing named and positional fields
    const hasNamed = literal.fields.some((f) => f.fieldName !== undefined);
    const hasPositional = literal.fields.some((f) => f.fieldName === undefined);

    if (hasNamed && hasPositional) {
      throw new Error(
        `Cannot mix named and positional field initialization in struct literal for '${structType.name}'`,
      );
    }

    literal.fields.forEach((field, index) => {
      let fieldIndex = index;
      let fieldType: VariableType | undefined;

      if (field.fieldName) {
        const member = structType.members.get(field.fieldName);
        if (!member) {
          throw new Error(
            `Field '${field.fieldName}' not found in struct '${structType.name}'`,
          );
        }
        fieldIndex = member.index!;
        fieldType = {
          name: member.name,
          isPointer: member.isPointer,
          isArray: member.isArray,
        };
      } else {
        let foundMember: TypeInfo | undefined;
        for (const member of structType.members.values()) {
          if (member.index === index) {
            foundMember = member;
            break;
          }
        }

        if (!foundMember) {
          throw new Error(
            `Too many fields in struct literal for '${structType.name}' or index mismatch`,
          );
        }
        fieldIndex =
          foundMember.index !== undefined ? foundMember.index : index;
        fieldType = {
          name: foundMember.name,
          isPointer: foundMember.isPointer,
          isArray: foundMember.isArray,
        };
      }

      const elemPtr = gen.emitGEP(
        gen.getIRType({
          name: structType.name,
          isPointer: 0,
          isArray: [],
        }),
        ptr,
        ["0", fieldIndex.toString()],
      );

      if (field.value instanceof StructLiteralExpr) {
        const fieldTypeInfo = scope.resolveType(fieldType.name);
        if (!fieldTypeInfo) {
          throw new Error(`Unknown type ${fieldType.name}`);
        }
        this.initializeStruct(gen, scope, elemPtr, fieldTypeInfo, field.value);
      } else {
        const val = field.value.toIR(gen, scope);
        const elemIrType = gen.getIRType(fieldType);
        gen.emitStore(elemIrType, val, elemPtr);
      }
    });
  }
}
