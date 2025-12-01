import type Token from "../../lexer/token";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import type { TypeInfo } from "../../transpiler/Scope";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import type { VariableType } from "./variableDeclarationExpr";

export type StructField = {
  name: string;
  type: VariableType;
  token?: Token;
};

export default class StructDeclarationExpr extends Expression {
  constructor(
    public name: string,
    public fields: StructField[],
    public genericParams: string[] = [],
  ) {
    super(ExpressionType.StructureDeclaration);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ StructDeclaration ]\n";
    this.depth++;
    output += this.getDepth();
    output += `Name: ${this.name}`;
    if (this.genericParams.length > 0) {
      output += `<${this.genericParams.join(", ")}>`;
    }
    output += "\n";
    output += this.getDepth();
    output += `Fields:\n`;
    this.depth++;
    for (const field of this.fields) {
      output += this.getDepth();
      output += `- Name: ${field.name}, ${this.printType(field.type)}\n`;
    }
    this.depth--;
    this.depth--;
    output += this.getDepth();
    output += "/[ StructDeclaration ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    if (this.genericParams.length > 0) {
      const structTypeInfo: TypeInfo = {
        name: this.name,
        isArray: [],
        isPointer: 0,
        members: new Map(),
        size: 0,
        alignment: 1,
        isPrimitive: false,
        info: {
          description: `Generic Structure ${this.name}`,
        },
        genericParams: this.genericParams,
        genericFields: this.fields.map((f) => ({
          name: f.name,
          type: f.type,
        })),
        declaration: this.startToken,
      };
      scope.defineType(this.name, structTypeInfo);
      return;
    }

    const structTypeInfo: TypeInfo = {
      name: this.name,
      isArray: [],
      isPointer: 0,
      members: new Map(),
      size: 0,
      alignment: 1,
      isPrimitive: false,
      info: {
        description: `Structure ${this.name}`,
      },
    };

    const toAddLater: string[] = [];
    let currentOffset = 0;
    let maxAlignment = 1;

    this.fields.forEach((field, index) => {
      const fieldTypeInfo = scope.resolveType(field.type.name);

      if (
        field.type.name === this.name &&
        (field.type.isPointer > 0 || field.type.isArray.length > 0)
      ) {
        toAddLater.push(field.name);
        return;
      } else if (field.type.name === this.name) {
        throw new Error(
          `Direct recursive struct '${this.name}' field '${field.name}' is not allowed without pointer or array.`,
        );
      } else if (!fieldTypeInfo) {
        throw new Error(
          `Unknown type '${field.type.name}' for field '${field.name}' in struct '${this.name}'`,
        );
      }

      let fieldSize = fieldTypeInfo.size;
      let fieldAlignment = fieldTypeInfo.alignment || 1;

      if (field.type.isPointer > 0) {
        fieldSize = 8;
        fieldAlignment = 8;
      } else if (field.type.isArray.length > 0) {
        fieldSize =
          fieldTypeInfo.size * field.type.isArray.reduce((a, b) => a * b, 1);
        fieldAlignment = fieldTypeInfo.alignment || 1;
      }

      // Calculate padding
      const padding =
        (fieldAlignment - (currentOffset % fieldAlignment)) % fieldAlignment;
      currentOffset += padding;

      structTypeInfo.members.set(field.name, {
        info: { description: `Field ${field.name} of type ${field.type.name}` },
        name: field.type.name,
        isArray: field.type.isArray,
        isPointer: field.type.isPointer,
        size: fieldSize,
        offset: currentOffset,
        alignment: fieldAlignment,
        isPrimitive: fieldTypeInfo.isPrimitive,
        members: fieldTypeInfo.members,
      });

      currentOffset += fieldSize;
      maxAlignment = Math.max(maxAlignment, fieldAlignment);
    });

    toAddLater.forEach((fieldName) => {
      const memberInfo = this.fields.find((f) => f.name === fieldName);
      const fieldSize = 8;
      const fieldAlignment = 8;

      const padding =
        (fieldAlignment - (currentOffset % fieldAlignment)) % fieldAlignment;
      currentOffset += padding;

      structTypeInfo.members.set(fieldName, {
        info: { description: `Field ${fieldName} of type ${this.name}` },
        name: memberInfo!.type.name,
        isArray: memberInfo?.type.isArray || [],
        isPointer: memberInfo?.type.isPointer || 0,
        size: fieldSize,
        offset: currentOffset,
        alignment: fieldAlignment,
        isPrimitive: false,
        members: structTypeInfo.members,
      });

      currentOffset += fieldSize;
      maxAlignment = Math.max(maxAlignment, fieldAlignment);
    });

    // Align struct size
    const structPadding =
      (maxAlignment - (currentOffset % maxAlignment)) % maxAlignment;
    structTypeInfo.size = currentOffset + structPadding;
    structTypeInfo.alignment = maxAlignment;
    structTypeInfo.declaration = this.startToken;

    scope.defineType(this.name, structTypeInfo);
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    if (this.genericParams.length > 0) {
      const structTypeInfo: TypeInfo = {
        name: this.name,
        isArray: [],
        isPointer: 0,
        members: new Map(),
        size: 0,
        alignment: 1,
        isPrimitive: false,
        info: {
          description: `Generic Structure ${this.name}`,
        },
        genericParams: this.genericParams,
        genericFields: this.fields.map((f) => ({
          name: f.name,
          type: f.type,
        })),
        declaration: this.startToken,
      };
      scope.defineType(this.name, structTypeInfo);
      return "";
    }

    const structTypeInfo: TypeInfo = {
      name: this.name,
      isArray: [],
      isPointer: 0,
      members: new Map(),
      size: 0,
      alignment: 1,
      isPrimitive: false,
      info: {
        description: `Structure ${this.name}`,
      },
    };

    const memberTypes: string[] = [];
    let currentOffset = 0;
    let maxAlignment = 1;
    let memberIndex = 0;

    this.fields.forEach((field) => {
      let fieldTypeInfo = scope.resolveType(field.type.name);

      if (!fieldTypeInfo && field.type.name === this.name) {
        // Recursive reference
        fieldTypeInfo = {
          name: this.name,
          size: 0, // Placeholder
          alignment: 1, // Placeholder
          isPrimitive: false,
          members: structTypeInfo.members, // Reference to self members
          isArray: [],
          isPointer: 0,
          info: { description: `Recursive reference to ${this.name}` },
        };
      }

      if (!fieldTypeInfo) {
        throw new Error(
          `Unknown type '${field.type.name}' for field '${field.name}' in struct '${this.name}'`,
        );
      }

      let fieldSize = fieldTypeInfo.size;
      let fieldAlignment = fieldTypeInfo.alignment || 1;

      if (field.type.isPointer > 0) {
        fieldSize = 8;
        fieldAlignment = 8;
      } else if (field.type.isArray.length > 0) {
        fieldSize =
          fieldTypeInfo.size * field.type.isArray.reduce((a, b) => a * b, 1);
        fieldAlignment = fieldTypeInfo.alignment || 1;
      }

      // Calculate padding
      const padding =
        (fieldAlignment - (currentOffset % fieldAlignment)) % fieldAlignment;
      currentOffset += padding;

      structTypeInfo.members.set(field.name, {
        info: { description: `Field ${field.name} of type ${field.type.name}` },
        name: field.type.name,
        isArray: field.type.isArray,
        isPointer: field.type.isPointer,
        size: fieldSize,
        offset: currentOffset,
        alignment: fieldAlignment,
        isPrimitive: fieldTypeInfo.isPrimitive,
        members: fieldTypeInfo.members,
        index: memberIndex++, // Store index for GEP
      });

      currentOffset += fieldSize;
      maxAlignment = Math.max(maxAlignment, fieldAlignment);

      memberTypes.push(gen.mapType(field.type));
    });

    // Align struct size
    const structPadding =
      (maxAlignment - (currentOffset % maxAlignment)) % maxAlignment;
    structTypeInfo.size = currentOffset + structPadding;
    structTypeInfo.alignment = maxAlignment;
    structTypeInfo.declaration = this.startToken;

    scope.defineType(this.name, structTypeInfo);

    // Emit LLVM struct definition
    gen.emitGlobal(`%struct.${this.name} = type { ${memberTypes.join(", ")} }`);

    return "";
  }
}
