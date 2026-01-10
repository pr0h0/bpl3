import * as AST from "../../common/AST";
import { TypeGenerator } from "./TypeGenerator";

/**
 * ReflectionGenerator - Handles generation of Runtime Type Information (RTTI)
 * Part of the ExpressionGenerator inheritance chain:
 * TypeGenerator -> ReflectionGenerator -> AddressExpressionGenerator
 */
export abstract class ReflectionGenerator extends TypeGenerator {
  // Cache for TypeInfo globals to avoid duplicates and handle recursion
  // Key: Mangles type string, Value: Global variable name (e.g. @TypeInfo_int)
  protected typeInfoCache: Map<string, string> = new Map();

  // Constants matching lib/reflection.bpl
  protected readonly TYPE_KIND_PRIMITIVE = 0;
  protected readonly TYPE_KIND_STRUCT = 1;
  protected readonly TYPE_KIND_ARRAY = 2;
  protected readonly TYPE_KIND_POINTER = 3;
  protected readonly TYPE_KIND_ENUM = 4;
  protected readonly TYPE_KIND_FUNCTION = 5;

  /**
   * Entry point for typeof(T) expression
   */
  protected generateTypeOf(expr: AST.TypeOfExpr): string {
    let type: AST.TypeNode;
    const target = expr.target as AST.ASTNode;

    if (
      target.kind === "BasicType" ||
      target.kind === "TupleType" ||
      target.kind === "FunctionType" ||
      target.kind === "LambdaType" ||
      target.kind === "MetaType"
    ) {
      type = target as AST.TypeNode;
    } else {
      // It's an expression, get its type
      type = (target as AST.Expression).resolvedType!;
    }

    // Substitute generics if necessary
    if (this.currentTypeMap.size > 0) {
      type = this.substituteType(type, this.currentTypeMap);
    }

    if (type.kind === "MetaType") {
      type = (type as any).type;
    }

    const globalName = this.getOrCreateTypeInfo(type);

    // Return pointer to the global, bitcast to generic %struct.TypeInfo* to match runtime signature.
    const ptrReg = this.newRegister();
    this.emit(
      `  ${ptrReg} = bitcast %struct.TypeInfo* ${globalName} to %struct.TypeInfo*`,
    );
    return ptrReg;
  }

  /**
   * Get or create a TypeInfo global for the given type.
   * Returns the global variable name (e.g. @TypeInfo_int).
   */
  protected getOrCreateTypeInfo(type: AST.TypeNode): string {
    const typeKey = this.mangleType(type);
    if (this.typeInfoCache.has(typeKey)) {
      return this.typeInfoCache.get(typeKey)!;
    }

    // Reserve name
    const safeName = typeKey.replace(/[^a-zA-Z0-9_]/g, "_");
    const globalName = `@TypeInfo_${safeName}`;
    this.typeInfoCache.set(typeKey, globalName);

    // Ensure TypeInfo structs are defined (if not already handled by libraries)
    if (!this.generatedStructs.has("TypeInfo")) {
      // Define structures matching internal layout used by reflection generation
      // FieldInfo = { name: i8*, offset: i64, type: TypeInfo* }
      this.emitDeclaration(
        `%struct.FieldInfo = type { i8*, i64, %struct.TypeInfo* }`,
      );
      // MethodInfo = { name: i8*, func: i8* }
      this.emitDeclaration(`%struct.MethodInfo = type { i8*, i8* }`);
      // TypeInfo = { name: i8*, size: i64, kind: i8, num_fields: i32, fields: FieldInfo*, num_methods: i32, methods: MethodInfo*, element_type: TypeInfo* }
      this.emitDeclaration(
        `%struct.TypeInfo = type { i8*, i64, i8, i32, %struct.FieldInfo*, i32, %struct.MethodInfo*, %struct.TypeInfo* }`,
      );
      this.generatedStructs.add("TypeInfo");
    }

    // Generate content based on type kind
    if (type.kind === "BasicType") {
      const basic = type as AST.BasicTypeNode;

      // Check for Pointers (Highest priority)
      if (basic.pointerDepth > 0) {
        this.generatePointerTypeInfo(globalName, type);
        return globalName;
      }

      // Check for Arrays (Next priority)
      if (basic.arrayDimensions.length > 0) {
        this.generateArrayTypeInfo(globalName, type);
        return globalName;
      }

      // Check for Primitives
      if (this.isPrimitive(basic.name)) {
        this.generatePrimitiveTypeInfo(globalName, basic);
        return globalName;
      }

      // Structs / Enums
      let structDecl =
        basic.resolvedDeclaration &&
        basic.resolvedDeclaration.kind === "StructDecl"
          ? (basic.resolvedDeclaration as AST.StructDecl)
          : undefined;

      if (!structDecl && this.structMap.has(basic.name)) {
        structDecl = this.structMap.get(basic.name);
      }

      if (structDecl) {
        this.generateStructTypeInfo(globalName, basic, structDecl);
        return globalName;
      }

      let enumDecl =
        basic.resolvedDeclaration &&
        basic.resolvedDeclaration.kind === "EnumDecl"
          ? (basic.resolvedDeclaration as AST.EnumDecl)
          : undefined;

      if (!enumDecl && this.enumDeclMap.has(basic.name)) {
        enumDecl = this.enumDeclMap.get(basic.name);
      }

      if (enumDecl) {
        this.generateEnumTypeInfo(globalName, basic, enumDecl);
        return globalName;
      }
    }

    // Fallback for unknown/unsupported types (e.g. function pointers for now)
    this.generatePrimitiveTypeInfo(globalName, {
      kind: "BasicType",
      name: "void",
      pointerDepth: 0,
      genericArgs: [],
      arrayDimensions: [],
      location: type.location,
    });
    return globalName;
  }

  private isPrimitive(name: string): boolean {
    const p = [
      "int",
      "uint",
      "long",
      "ulong",
      "float",
      "double",
      "bool",
      "char",
      "void",
      "string",
      "i8",
      "u8",
      "i16",
      "u16",
      "i32",
      "u32",
      "i64",
      "u64",
    ];
    return p.includes(name);
  }

  private generatePrimitiveTypeInfo(
    globalName: string,
    type: AST.BasicTypeNode,
  ) {
    // Name string
    const nameStrVar = this.getOrCreateStringLiteral(type.name);
    // Size
    const size = this.getTypeSizeInBits(type) / 8;

    // Emit global
    // %struct.TypeInfo = type { i8*, i64, i8, i32, %struct.FieldInfo*, %struct.TypeInfo* }
    // matches: name, size, kind, num_fields, fields, element_type

    const structType = "%struct.TypeInfo";

    this.declarationsOutput.push(`${globalName} = global ${structType} {
    i8* getelementptr inbounds ([${type.name.length + 1} x i8], [${type.name.length + 1} x i8]* ${nameStrVar}, i32 0, i32 0),
    i64 ${size},
    i8 ${this.TYPE_KIND_PRIMITIVE},
    i32 0,
    %struct.FieldInfo* null,
    i32 0,
    %struct.MethodInfo* null,
    %struct.TypeInfo* null
}`);
  }

  private generatePointerTypeInfo(globalName: string, type: AST.TypeNode) {
    // Deconstruct pointer to get element type
    // This is tricky with BasicType having pointerDepth.
    // We need to create a TypeNode for the element.

    let elementType: AST.TypeNode;
    let displayName = "pointer";

    if (type.kind === "BasicType") {
      const basic = type as AST.BasicTypeNode;
      displayName = "*" + basic.name; // Simplified name

      elementType = { ...basic, pointerDepth: basic.pointerDepth - 1 };
      // If array dims exist, they are preserved.
    } else {
      // Should not happen with current AST structure where only BasicType has pointerDepth
      elementType = {
        kind: "BasicType",
        name: "void",
        pointerDepth: 0,
        genericArgs: [],
        arrayDimensions: [],
        location: type.location,
      };
    }

    const nameStrVar = this.getOrCreateStringLiteral(displayName);
    const size = 8; // Pointer size

    // Recursively get element type info
    const elementTypeInfo = this.getOrCreateTypeInfo(elementType);

    const structType = "%struct.TypeInfo";

    this.declarationsOutput.push(`${globalName} = global ${structType} {
    i8* getelementptr inbounds ([${displayName.length + 1} x i8], [${displayName.length + 1} x i8]* ${nameStrVar}, i32 0, i32 0),
    i64 ${size},
    i8 ${this.TYPE_KIND_POINTER},
    i32 0,
    %struct.FieldInfo* null,
    i32 0,
    %struct.MethodInfo* null,
    %struct.TypeInfo* ${elementTypeInfo}
}`);
  }

  // Placeholder for Structs (recursion handling needs care)
  private generateStructTypeInfo(
    globalName: string,
    type: AST.BasicTypeNode,
    decl: AST.StructDecl,
  ) {
    const nameStrVar = this.getOrCreateStringLiteral(decl.name);
    const size = this.getTypeSizeInBits(type) / 8;

    // Helper to generate fields array
    const fieldsArrayName = `${globalName}_fields`;
    const fields = decl.members.filter(
      (m) => m.kind === "StructField",
    ) as AST.StructField[];

    let fieldsPtr = "null";
    let numFields = 0;

    // Check if struct has vtable to adjust field offsets
    const hasVTable =
      this.vtableLayouts.has(decl.name) &&
      this.vtableLayouts.get(decl.name)!.length > 0;
    const vtableOffset = hasVTable ? 1 : 0;

    if (fields.length > 0) {
      numFields = fields.length;
      // Generate Field Infos
      const fieldInfos = fields.map((f, index) => {
        const fieldTypeInfo = this.getOrCreateTypeInfo(f.type);
        const fieldNameStr = this.getOrCreateStringLiteral(f.name);

        const llvmType = this.resolveType(type);
        const fieldIndex = index + vtableOffset;

        return `%struct.FieldInfo {
      i8* getelementptr inbounds ([${f.name.length + 1} x i8], [${f.name.length + 1} x i8]* ${fieldNameStr}, i32 0, i32 0),
      i64 ptrtoint (${llvmType}* getelementptr (${llvmType}, ${llvmType}* null, i32 0, i32 ${fieldIndex}) to i64),
      %struct.TypeInfo* ${fieldTypeInfo}
  }`;
      });

      const fieldArrayType = `[${fields.length} x %struct.FieldInfo]`;

      this.declarationsOutput
        .push(`${fieldsArrayName} = private constant ${fieldArrayType} [
  ${fieldInfos.join(",\n  ")}
]`);

      fieldsPtr = `getelementptr inbounds (${fieldArrayType}, ${fieldArrayType}* ${fieldsArrayName}, i32 0, i32 0)`;
    }

    // Generate Methods
    const methods = decl.members.filter(
      (m) => m.kind === "FunctionDecl",
    ) as AST.FunctionDecl[];

    let methodsPtr = "null";
    let numMethods = 0;

    if (methods.length > 0) {
      numMethods = methods.length;
      const methodsArrayName = `${globalName}_methods`;

      const methodInfos = methods.map((m) => {
        const mNameStr = this.getOrCreateStringLiteral(m.name);

        const funcType = m.resolvedType as AST.FunctionTypeNode;
        let effectiveFuncType = funcType;

        // Substitute generic types if necessary
        if (
          type.genericArgs &&
          type.genericArgs.length > 0 &&
          decl.genericParams.length === type.genericArgs.length
        ) {
          const typeMap = new Map<string, AST.TypeNode>();
          decl.genericParams.forEach((p, i) => {
            typeMap.set(p.name.trim(), type.genericArgs![i]!);
          });
          effectiveFuncType = this.substituteType(
            funcType,
            typeMap,
          ) as AST.FunctionTypeNode;
        }

        // Calculate Mangled Name
        // Naming convention: StructName_MethodName
        const symbolPrefix = `${decl.name}_${m.name}`;
        const symbolName =
          "@" + this.getMangledName(symbolPrefix, effectiveFuncType);

        // Function Pointer Type (with explicit i8* closure context)
        const retType = this.resolveType(effectiveFuncType.returnType);
        const paramTypes = effectiveFuncType.paramTypes.map((p) =>
          this.resolveType(p),
        );
        paramTypes.unshift("i8*"); // Add implicit closure context

        const llvmFuncType = `${retType} (${paramTypes.join(", ")})*`;

        return `%struct.MethodInfo {
        i8* getelementptr inbounds ([${m.name.length + 1} x i8], [${m.name.length + 1} x i8]* ${mNameStr}, i32 0, i32 0),
        i8* bitcast (${llvmFuncType} ${symbolName} to i8*)
      }`;
      });

      const methodArrayType = `[${methods.length} x %struct.MethodInfo]`;

      this.declarationsOutput
        .push(`${methodsArrayName} = private constant ${methodArrayType} [
  ${methodInfos.join(",\n  ")}
]`);

      methodsPtr = `getelementptr inbounds (${methodArrayType}, ${methodArrayType}* ${methodsArrayName}, i32 0, i32 0)`;
    }

    this.declarationsOutput.push(`${globalName} = global %struct.TypeInfo {
    i8* getelementptr inbounds ([${decl.name.length + 1} x i8], [${decl.name.length + 1} x i8]* ${nameStrVar}, i32 0, i32 0),
    i64 ${size},
    i8 ${this.TYPE_KIND_STRUCT},
    i32 ${numFields},
    %struct.FieldInfo* ${fieldsPtr},
    i32 ${numMethods},
    %struct.MethodInfo* ${methodsPtr},
    %struct.TypeInfo* null
}`);
  }

  private generateArrayTypeInfo(globalName: string, type: AST.TypeNode) {
    if (type.kind !== "BasicType") return;
    const basic = type as AST.BasicTypeNode;

    // Element Type Node: Same type validation but popped dimension
    const elementTypeNode: AST.BasicTypeNode = {
      ...basic,
      arrayDimensions: basic.arrayDimensions.slice(1),
    };

    const elementTypeGlobal = this.getOrCreateTypeInfo(elementTypeNode);
    const size = this.getTypeSizeInBits(type) / 8;

    // Name conventions: "Array"
    const typeName = "Array";
    const nameStrVar = this.getOrCreateStringLiteral(typeName);

    this.declarationsOutput.push(`${globalName} = global %struct.TypeInfo {
    i8* getelementptr inbounds ([${typeName.length + 1} x i8], [${typeName.length + 1} x i8]* ${nameStrVar}, i32 0, i32 0),
    i64 ${size},
    i8 ${this.TYPE_KIND_ARRAY},
    i32 0,
    %struct.FieldInfo* null,
    i32 0,
    %struct.MethodInfo* null,
    %struct.TypeInfo* ${elementTypeGlobal}
}`);
  }

  private generateEnumTypeInfo(
    globalName: string,
    type: AST.BasicTypeNode,
    decl: AST.EnumDecl,
  ) {
    const nameStrVar = this.getOrCreateStringLiteral(decl.name);
    const size = this.getTypeSizeInBits(type) / 8;

    // Generate variants as fields
    const fieldInfos: string[] = [];
    decl.variants.forEach((variant, index) => {
      const variantNameStr = this.getOrCreateStringLiteral(variant.name);
      // Reuse FieldInfo: { name, offset (tag), type (null) }
      fieldInfos.push(`%struct.FieldInfo {
        i8* getelementptr inbounds ([${variant.name.length + 1} x i8], [${
          variant.name.length + 1
        } x i8]* ${variantNameStr}, i32 0, i32 0),
        i64 ${index},
        %struct.TypeInfo* null
      }`);
    });

    const fieldArrayType = `[${decl.variants.length} x %struct.FieldInfo]`;
    const fieldsArrayName = `${globalName}.variants`;

    if (decl.variants.length > 0) {
      this.declarationsOutput.push(
        `${fieldsArrayName} = private constant ${fieldArrayType} [
${fieldInfos.join(",\n")}
]`,
      );
    }

    const fieldsPtr =
      decl.variants.length > 0
        ? `getelementptr inbounds (${fieldArrayType}, ${fieldArrayType}* ${fieldsArrayName}, i32 0, i32 0)`
        : `null`;

    this.declarationsOutput.push(`${globalName} = global %struct.TypeInfo {
    i8* getelementptr inbounds ([${decl.name.length + 1} x i8], [${
      decl.name.length + 1
    } x i8]* ${nameStrVar}, i32 0, i32 0),
    i64 ${size},
    i8 ${this.TYPE_KIND_ENUM},
    i32 ${decl.variants.length},
    %struct.FieldInfo* ${fieldsPtr},
    i32 0,
    %struct.MethodInfo* null,
    %struct.TypeInfo* null
}`);
  }

  // Helper for strings
  private getOrCreateStringLiteral(str: string): string {
    if (this.stringLiterals.has(str)) {
      return this.stringLiterals.get(str)!;
    }
    const id = this.stringLiterals.size;
    const varName = `@.str.meta.${id}`;

    // Note: CodeGenerator iterates this.stringLiterals and emits the constants automatically
    this.stringLiterals.set(str, varName);
    return varName;
  }
}
