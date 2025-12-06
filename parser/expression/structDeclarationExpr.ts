import type Token from "../../lexer/token";
import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type { TypeInfo } from "../../transpiler/Scope";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

import type { VariableType } from "./variableDeclarationExpr";
import type FunctionDeclarationExpr from "./functionDeclaration";

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
    public methods: FunctionDeclarationExpr[] = [],
    public parent: string | null = null,
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

  toIR(gen: IRGenerator, scope: Scope): string {
    // Define type in scope (same logic as generateIR)
    if (this.genericParams.length > 0) {
      if (!scope.types.has(this.name)) {
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
      }
      return "";
    }

    if (!scope.types.has(this.name)) {
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

      let currentOffset = 0;
      let maxAlignment = 1;
      let memberIndex = 0;

      this.fields.forEach((field) => {
        let fieldTypeInfo = scope.resolveType(field.type.name);

        if (!fieldTypeInfo && field.type.name === this.name) {
          fieldTypeInfo = {
            name: this.name,
            size: 0,
            alignment: 1,
            isPrimitive: false,
            members: structTypeInfo.members,
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

        const padding =
          (fieldAlignment - (currentOffset % fieldAlignment)) % fieldAlignment;
        currentOffset += padding;

        structTypeInfo.members.set(field.name, {
          info: {
            description: `Field ${field.name} of type ${field.type.name}`,
          },
          name: field.type.name,
          isArray: field.type.isArray,
          isPointer: field.type.isPointer,
          size: fieldSize,
          offset: currentOffset,
          alignment: fieldAlignment,
          isPrimitive: fieldTypeInfo.isPrimitive,
          members: fieldTypeInfo.members,
          index: memberIndex++,
        });

        currentOffset += fieldSize;
        maxAlignment = Math.max(maxAlignment, fieldAlignment);
      });

      const structPadding =
        (maxAlignment - (currentOffset % maxAlignment)) % maxAlignment;
      structTypeInfo.size = currentOffset + structPadding;
      structTypeInfo.alignment = maxAlignment;
      structTypeInfo.declaration = this.startToken;

      scope.defineType(this.name, structTypeInfo);
    }

    // Add to IRModule if not already present
    if (!gen.module.structs.some((s) => s.name === this.name)) {
      const typeInfo = scope.resolveType(this.name);
      if (typeInfo && typeInfo.members.size > 0) {
        // Sort members by index to ensure correct layout
        const sortedMembers = Array.from(typeInfo.members.values()).sort(
          (a, b) => (a.index ?? 0) - (b.index ?? 0),
        );

        const fields = sortedMembers.map((m) => {
          const varType: VariableType = {
            name: m.name,
            isPointer: m.isPointer,
            isArray: m.isArray,
            // Note: genericArgs are not stored in TypeInfo member,
            // but if the type was monomorphized, m.name should be the specialized name.
          };
          return gen.getIRType(varType);
        });
        gen.module.addStruct(this.name, fields);
      } else {
        // Fallback to AST fields if type info not found (shouldn't happen for valid code)
        const fields = this.fields.map((f) => gen.getIRType(f.type));
        gen.module.addStruct(this.name, fields);
      }
    }

    // Generate IR for methods
    for (const method of this.methods) {
      method.toIR(gen, scope);
    }

    return "";
  }
}
