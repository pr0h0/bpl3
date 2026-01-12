import type { AST } from "../..";
import { codeGenLog } from "../../common/Logger";
import { BaseCodeGenerator } from "./BaseCodeGenerator";

/**
 * StructEnumGenerator handles the generation of struct and enum definitions,
 * including VTable layout computation and method generation.
 *
 * Inheritance chain:
 * BaseCodeGenerator -> StructEnumGenerator -> TypeGenerator -> ...
 */
export abstract class StructEnumGenerator extends BaseCodeGenerator {
  // Abstract methods that will be implemented in child classes
  protected abstract generateFunction(
    decl: AST.FunctionDecl,
    parentStruct?: AST.StructDecl | AST.EnumDecl,
    captureInfo?: { name: string; fields: { name: string; type: string }[] },
  ): void;

  protected abstract resolveType(type: AST.TypeNode): string;
  protected abstract substituteType(
    type: AST.TypeNode,
    typeMap: Map<string, AST.TypeNode>,
  ): AST.TypeNode;
  protected abstract mangleType(type: AST.TypeNode): string;
  protected abstract getAllStructFields(
    decl: AST.StructDecl,
  ): AST.StructField[];
  protected abstract findMethodOwner(
    structName: string,
    methodName: string,
  ): AST.StructDecl | null;
  protected abstract getMangledName(
    name: string,
    type: AST.FunctionTypeNode,
    isExtern?: boolean,
    genericArgs?: AST.TypeNode[],
  ): string;
  protected abstract instantiateGenericEnum(
    enumName: string,
    genericArgs: AST.TypeNode[],
    skipGeneration?: boolean,
  ): string;

  // ============================================================
  // Struct Layout Collection
  // ============================================================

  protected collectStructLayouts(program: AST.Program) {
    for (const stmt of program.statements) {
      if (stmt.kind === "StructDecl") {
        // Only collect non-generic structs initially
        // Generic structs are collected on demand
        // But we need to index layout for non-generic ones
        const decl = stmt as AST.StructDecl;
        if (decl.genericParams.length === 0) {
          const layout = new Map<string, number>();
          const fields = this.getAllStructFields(decl);

          const hasVTable =
            this.vtableLayouts.has(decl.name) &&
            this.vtableLayouts.get(decl.name)!.length > 0;
          const offset = hasVTable ? 1 : 0;

          if (hasVTable) {
            layout.set("__vtable__", 0);
          }

          fields.forEach((f, i) => layout.set(f.name, i + offset));
          this.structLayouts.set(decl.name, layout);
        }
      }
    }
  }

  // ============================================================
  // VTable Methods
  // ============================================================

  protected getVTableMethodName(decl: AST.FunctionDecl): string {
    if (!decl.resolvedType || decl.resolvedType.kind !== "FunctionType") {
      return decl.name;
    }
    const type = decl.resolvedType as AST.FunctionTypeNode;
    // Skip first param (this)
    const paramTypes = type.paramTypes.slice(1);
    const mangledParams = paramTypes.map((t) => this.mangleType(t)).join("_");
    return `${decl.name}_${mangledParams}`;
  }

  protected getStructMethods(decl: AST.StructDecl): string[] {
    return decl.members
      .filter((m) => m.kind === "FunctionDecl")
      .filter((m) => (m as AST.FunctionDecl).genericParams.length === 0)
      .map((m) => {
        const funcDecl = m as AST.FunctionDecl;
        return this.getVTableMethodName(funcDecl);
      });
  }

  protected computeVTableLayout(name: string): string[] {
    if (this.vtableLayouts.has(name)) return this.vtableLayouts.get(name)!;

    const decl = this.structMap.get(name);
    if (!decl) return [];

    let layout: string[] = [];

    // Check parent
    let parentName: string | null = null;
    if (decl.inheritanceList) {
      for (const typeNode of decl.inheritanceList) {
        if (typeNode.kind === "BasicType") {
          // Resolve parent name
          let pName = typeNode.name;

          if (typeNode.genericArgs && typeNode.genericArgs.length > 0) {
            // It's a generic parent. We need the instantiated name.
            const llvmType = this.resolveType(typeNode);
            // Strip %struct. and *
            pName = llvmType.replace(/^%struct\./, "").replace(/\*+$/, "");
          } else if (
            typeNode.resolvedDeclaration &&
            typeNode.resolvedDeclaration.kind === "StructDecl"
          ) {
            pName = typeNode.resolvedDeclaration.name;
          }
          parentName = pName;
          break;
        }
      }
    }

    // Implicit inheritance from Type
    // Do not force Type inheritance on reflection structs or string to avoid layout mismatches
    // in ReflectionGenerator and circular dependencies.
    const isReflectionStruct = [
      "TypeInfo",
      "FieldInfo",
      "MethodInfo",
      "InterfaceImpl",
      "string",
      "Any",
    ].includes(name);

    // Only force implicit inheritance from Type if the struct has methods.
    // This allows POD (Plain Old Data) structs to be compatible with C ABI (no vtable).
    const hasMethods = decl.members.some((m) => m.kind === "FunctionDecl");

    if (
      !parentName &&
      name !== "Type" &&
      this.structMap.has("Type") &&
      !isReflectionStruct &&
      hasMethods
    ) {
      parentName = "Type";
    }

    if (parentName) {
      layout = [...this.computeVTableLayout(parentName)];
    }

    // Add/Override methods
    // We iterate FunctionDecls to get names
    const funcDecls = decl.members.filter(
      (m) =>
        m.kind === "FunctionDecl" &&
        (m as AST.FunctionDecl).genericParams.length === 0,
    ) as AST.FunctionDecl[];

    for (const mDecl of funcDecls) {
      const methodStr = this.getVTableMethodName(mDecl);
      // Assume mDecl.name is Struct_SimpleName
      const simpleName = mDecl.name.substring(name.length + 1);

      let overridden = false;
      for (let i = 0; i < layout.length; i++) {
        const entry = layout[i]!;
        const entrySimple = this.getEntrySimpleName(entry);
        if (entrySimple === simpleName) {
          layout[i] = methodStr;
          overridden = true;
          break;
        }
      }

      if (!overridden) {
        layout.push(methodStr);
      }
    }

    this.vtableLayouts.set(name, layout);
    return layout;
  }

  protected getEntrySimpleName(entry: string): string | null {
    // Find matching struct prefix
    let bestStructName = "";
    for (const sName of this.structMap.keys()) {
      if (entry.startsWith(sName + "_")) {
        if (sName.length > bestStructName.length) {
          bestStructName = sName;
        }
      }
    }
    if (!bestStructName) return null;

    // We can't easily look up the method decl without iterating.
    // Optimization: Assume format Struct_SimpleName_MangledParams.
    // The SimpleName ends before the first underscore OF THE PARAMS.
    // But SimpleName might contain underscores.
    // Reliable way: check struct decl.
    const decl = this.structMap.get(bestStructName)!;
    for (const m of decl.members) {
      if (
        m.kind === "FunctionDecl" &&
        (m as AST.FunctionDecl).genericParams.length === 0
      ) {
        const fd = m as AST.FunctionDecl;
        if (this.getVTableMethodName(fd) === entry) {
          return fd.name.substring(bestStructName.length + 1);
        }
      }
    }
    return null;
  }

  protected computeVTableLayouts(program: AST.Program) {
    // First, ensure all structs are in structMap
    for (const stmt of program.statements) {
      if (stmt.kind === "StructDecl") {
        const decl = stmt as AST.StructDecl;
        this.structMap.set(decl.name, decl);
      }
    }

    // Compute for all structs
    for (const [name, decl] of this.structMap) {
      if (decl.genericParams.length === 0) {
        this.computeVTableLayout(name);
      }
    }
  }

  protected generateVTable(structName: string, _decl: AST.StructDecl) {
    const methods = this.vtableLayouts.get(structName);
    if (!methods || methods.length === 0) return;

    const vtableName = `${structName}_vtable`;
    const globalName = `@${vtableName}`;
    this.vtableGlobalNames.set(structName, globalName);

    // Build array of function pointers
    const ptrs: string[] = [];
    for (const methodName of methods) {
      const owner = this.findMethodOwner(structName, methodName);
      if (!owner) {
        codeGenLog.debug(
          `[VTable] ${structName}: Method ${methodName} owner not found`,
        );
        ptrs.push("i8* null");
        continue;
      }

      const methodDecl = owner.members.find((m) => {
        if (m.kind !== "FunctionDecl") return false;
        const fd = m as AST.FunctionDecl;
        if (fd.genericParams.length > 0) return false;

        return this.getVTableMethodName(fd) === methodName;
      }) as AST.FunctionDecl;

      if (!methodDecl) {
        codeGenLog.debug(
          `[VTable] ${structName}: Method ${methodName} decl not found in ${owner.name}`,
        );
        // Try to find by name directly if mangled name check failed
        // This handles cases where methodName is simple (e.g. "getValue") but methodDecl has complex type
        const fallback = owner.members.find(
          (m) => m.kind === "FunctionDecl" && m.name === methodName,
        ) as AST.FunctionDecl;
        if (fallback) {
          // Found it!
          const funcName = fallback.name;
          const baseName = `${owner.name}_${funcName}`;
          const funcType = fallback.resolvedType as AST.FunctionTypeNode;
          const _mangled = this.getMangledName(baseName, funcType);

          // If the function is generic, we can't put it in vtable directly unless it's instantiated?
          // But vtable methods shouldn't be generic.
          // If fallback is generic, we skip it.
          if (fallback.genericParams.length > 0) {
            ptrs.push("null");
            continue;
          }

          ptrs.push("i8* null");
          continue;
        }

        ptrs.push("i8* null");
        continue;
      }

      const funcName = methodDecl.name; // Use original name, not mangled name as base
      let mangled = funcName;
      if (
        methodDecl.resolvedType &&
        methodDecl.resolvedType.kind === "FunctionType"
      ) {
        // Ensure we use the correct mangled name for the function definition.
        // The function definition includes parameter types in its name (e.g., Struct_method_ParamType).
        // We must reconstruct this name to reference the correct global function symbol.
        const baseName = `${owner.name}_${funcName}`;
        mangled = this.getMangledName(
          baseName,
          methodDecl.resolvedType as AST.FunctionTypeNode,
        );
      } else {
        mangled = `${owner.name}_${methodName}`;
      }

      // We need the raw function pointer type, not the closure struct type
      // resolveType(FunctionTypeNode) returns { func_ptr, env_ptr }
      // But @mangled is just the func_ptr.
      const funcType = methodDecl.resolvedType as AST.FunctionTypeNode;
      const retType = this.resolveType(funcType.returnType);
      // Virtual methods are Frames (not Lambdas) so they don't take context pointer
      const paramTypes = funcType.paramTypes.map((p) => this.resolveType(p));
      const paramsStr = paramTypes.join(", ");
      const rawFuncTypeStr = `${retType} (${paramsStr})*`;

      ptrs.push(`i8* bitcast (${rawFuncTypeStr} @${mangled} to i8*)`);
    }

    const arrayType = `[${methods.length} x i8*]`;
    const arrayContent = `[${ptrs.join(", ")}]`;

    this.emitDeclaration(
      `${globalName} = linkonce_odr constant ${arrayType} ${arrayContent}`,
    );
    this.emitDeclaration("");
  }

  // ============================================================
  // Struct Generation
  // ============================================================

  protected generateStruct(decl: AST.StructDecl, mangledName?: string) {
    const structName = mangledName || decl.name;

    // Avoid re-emitting
    if (this.generatedStructs.has(structName)) return;
    this.generatedStructs.add(structName);

    // %struct.Name = type { ... }
    const fields = this.getAllStructFields(decl);

    // Ensure vtable layout is computed
    if (!this.vtableLayouts.has(structName)) {
      this.computeVTableLayout(structName);
    }

    // Check if we need a vtable pointer
    const hasVTable =
      this.vtableLayouts.has(structName) &&
      this.vtableLayouts.get(structName)!.length > 0;

    let allFieldTypes = fields
      .map((f) => this.resolveType(f.resolvedType || f.type))
      .join(", ");

    if (hasVTable) {
      allFieldTypes = allFieldTypes ? `i8*, ${allFieldTypes}` : `i8*`;
    } else if (!allFieldTypes) {
      allFieldTypes = `i8`;
    }

    this.emitDeclaration(`%struct.${structName} = type { ${allFieldTypes} }`);
    this.emitDeclaration("");

    // Register layout
    const layout = new Map<string, number>();
    const offset = hasVTable ? 1 : 0;
    if (hasVTable) {
      layout.set("__vtable__", 0);
    }
    fields.forEach((f, i) => layout.set(f.name, i + offset));
    this.structLayouts.set(structName, layout);

    // VTable generation disabled for POD structs
    if (this.vtableLayouts.has(structName)) {
      this.generateVTable(structName, decl);
    }

    // Generate methods
    // Only generate methods for non-generic structs (standard structs).
    // For monomorphized structs (when mangledName is provided), methods are queued
    // separately in resolveMonomorphizedType() with proper type substitution.
    if (decl.genericParams.length === 0 && !mangledName) {
      const methods = decl.members.filter(
        (m) => m.kind === "FunctionDecl",
      ) as AST.FunctionDecl[];

      for (const method of methods) {
        const originalName = method.name;
        const methodMangledName = `${structName}_${method.name}`;

        if (this.currentFunctionName) {
          this.pendingGenerations.push(() => {
            const oldName = method.name;
            method.name = methodMangledName;
            this.generateFunction(method, decl);
            method.name = oldName;
          });
        } else {
          method.name = methodMangledName;
          this.generateFunction(method, decl);
          method.name = originalName;
        }
      }
    }
  }

  // ============================================================
  // Enum Generation
  // ============================================================

  protected calculateEnumMaxSize(decl: AST.EnumDecl): number {
    let maxSize = 0;
    for (const variant of decl.variants) {
      let variantSize = 0;

      if (variant.dataType) {
        if (variant.dataType.kind === "EnumVariantTuple") {
          // Tuple variant: calculate size with alignment
          let offset = 0;
          for (const fieldType of variant.dataType.types) {
            // Use getTypeSizeInBits to accurately calculate size (including vtables of nested structs)
            const fieldSize = this.getTypeSizeInBits(fieldType) / 8;

            const alignment = this.getAlignmentForSize(fieldSize);
            if (offset % alignment !== 0) {
              offset = Math.ceil(offset / alignment) * alignment;
            }

            offset += fieldSize;
          }
          variantSize = offset;
        } else if (variant.dataType.kind === "EnumVariantStruct") {
          // Struct variant: calculate size with alignment
          let offset = 0;
          for (const field of variant.dataType.fields) {
            // Use getTypeSizeInBits to accurately calculate size
            const fieldSize = this.getTypeSizeInBits(field.type) / 8;

            const alignment = this.getAlignmentForSize(fieldSize);
            if (offset % alignment !== 0) {
              offset = Math.ceil(offset / alignment) * alignment;
            }

            offset += fieldSize;
          }
          variantSize = offset;
        }
      }
      // Unit variants have size 0

      if (variantSize > maxSize) {
        maxSize = variantSize;
      }
    }
    return maxSize;
  }

  protected calculateStructSize(decl: AST.StructDecl): number {
    let offset = 0;
    let maxAlign = 1;

    // Check for VTable
    if (!this.vtableLayouts.has(decl.name)) {
      try {
        this.computeVTableLayout(decl.name);
      } catch (_e) {
        // Ignore
      }
    }

    if (
      this.vtableLayouts.has(decl.name) &&
      this.vtableLayouts.get(decl.name)!.length > 0
    ) {
      // VTable pointer
      const ptrSize = 8;
      const ptrAlign = 8;

      const padding = (ptrAlign - (offset % ptrAlign)) % ptrAlign;
      offset += padding;
      offset += ptrSize;

      if (ptrAlign > maxAlign) maxAlign = ptrAlign;
    }

    const fields = this.getAllStructFields(decl);
    for (const field of fields) {
      const sizeBytes = this.getTypeSizeInBits(field.type) / 8;

      // Estimate alignment
      let align = 1;
      if (sizeBytes >= 8) align = 8;
      else if (sizeBytes >= 4) align = 4;
      else if (sizeBytes >= 2) align = 2;

      // Fix for arrays: alignment determines by element, not total size
      // But for size calculation, using size-based alignment estimate is usually safe
      // (allocating more padding than needed is safe).
      // Exception: large struct with small alignment?
      // If we pad it to 8 bytes boundary always, it's safe.

      const padding = (align - (offset % align)) % align;
      offset += padding;
      offset += sizeBytes;

      if (align > maxAlign) maxAlign = align;
    }

    // Tail padding
    const tailPadding = (maxAlign - (offset % maxAlign)) % maxAlign;
    offset += tailPadding;

    return offset * 8;
  }

  protected getTypeSizeInBits(type: AST.TypeNode): number {
    if (type.kind === "BasicType") {
      if (type.pointerDepth > 0) return 64;

      if (type.arrayDimensions && type.arrayDimensions.length > 0) {
        let totalElements = 1;
        for (const dim of type.arrayDimensions) {
          if (dim === null) return 128; // Slice {ptr, len} (simplified)
          totalElements *= dim;
        }

        const elementType: AST.BasicTypeNode = {
          ...type,
          arrayDimensions: [],
        };
        return totalElements * this.getTypeSizeInBits(elementType);
      }

      switch (type.name) {
        case "i64":
        case "u64":
        case "double":
        case "float":
          return 64;
        case "int":
        case "uint":
        case "i32":
        case "u32":
          return 32;
        case "i16":
        case "u16":
          return 16;
        case "i8":
        case "u8":
        case "char":
        case "bool":
          return 8;
        case "void":
          return 0;
      }

      const structDecl = this.structMap.get(type.name);
      if (structDecl) return this.calculateStructSize(structDecl);

      const enumDecl = this.enumDeclMap.get(type.name);
      if (enumDecl) return (this.calculateEnumMaxSize(enumDecl) + 4) * 8;

      return 64; // Default
    }

    if (type.kind === "FunctionType") return 64; // Raw function pointer
    if (type.kind === "LambdaType") return 128; // Closure { func_ptr, env_ptr }
    if (type.kind === "TupleType") {
      let size = 0;
      for (const t of type.types) size += this.getTypeSizeInBits(t);
      return size;
    }

    return 64;
  }

  protected generateEnum(decl: AST.EnumDecl, mangledName?: string) {
    const enumName = mangledName || decl.name;

    // Avoid re-emitting
    if (this.generatedStructs.has(enumName)) return;
    this.generatedStructs.add(enumName);

    // Calculate maximum variant data size with proper alignment
    const maxSize = this.calculateEnumMaxSize(decl);

    // Generate enum as: { i32 tag, [maxSize x i8] data }
    // If maxSize is 0 (all unit variants), just use { i32 }
    const enumType =
      maxSize > 0
        ? `%enum.${enumName} = type { i32, [${maxSize} x i8] }`
        : `%enum.${enumName} = type { i32 }`;

    this.emitDeclaration(enumType);
    this.emitDeclaration("");

    // Register layout for later use
    const layout = new Map<string, number>();
    layout.set("__tag__", 0); // Discriminant is always at index 0
    if (maxSize > 0) {
      layout.set("__data__", 1); // Data union is at index 1
    }
    this.structLayouts.set(enumName, layout);

    // Store the data array size for equality comparisons
    if (maxSize > 0) {
      this.enumDataSizes.set(enumName, maxSize);
    }

    // Store variant information for later use in pattern matching
    const variantInfo = new Map<
      string,
      { index: number; dataType?: AST.EnumVariantData }
    >();
    decl.variants.forEach((v, i) => {
      variantInfo.set(v.name, { index: i, dataType: v.dataType });
    });
    this.enumVariants.set(enumName, variantInfo);

    // Generate methods
    // Only generate methods for non-generic enums.
    // For monomorphized enums (when mangledName is provided), methods are queued
    // separately in instantiateGenericEnum() with proper type substitution.
    if (decl.genericParams.length === 0 && !mangledName && decl.methods) {
      for (const method of decl.methods) {
        const originalName = method.name;
        const methodMangledName = `${enumName}_${method.name}`;

        if (this.currentFunctionName) {
          this.pendingGenerations.push(() => {
            const oldName = method.name;
            method.name = methodMangledName;
            this.generateFunction(method, decl);
            method.name = oldName;
          });
        } else {
          method.name = methodMangledName;
          this.generateFunction(method, decl);
          method.name = originalName;
        }
      }
    }
  }

  protected getTypeSize(llvmType: string): number {
    // Estimate size in bytes for common LLVM types
    // This is a simplification - actual sizes may vary
    if (llvmType === "i1") return 1;
    if (llvmType === "i8") return 1;
    if (llvmType === "i16") return 2;
    if (llvmType === "i32") return 4;
    if (llvmType === "i64") return 8;
    if (llvmType === "double") return 8;
    if (llvmType === "float") return 4;
    if (llvmType.endsWith("*")) return 8; // Pointers are 8 bytes
    if (llvmType.startsWith("%struct.")) return 8; // Approximate struct size
    if (llvmType.startsWith("%enum.")) return 8; // Approximate enum size
    return 8; // Default fallback
  }

  /**
   * Get proper alignment for a given size in bytes.
   * Follows standard alignment rules: 8-byte types align to 8, 4-byte to 4, etc.
   */
  protected getAlignmentForSize(size: number): number {
    if (size >= 8) return 8;
    if (size >= 4) return 4;
    if (size >= 2) return 2;
    return 1;
  }

  protected getDataArraySize(enumTypeName: string): number {
    // Extract the data array size from enum type string like "%enum.Color = type { i32, [16 x i8] }"
    // or from just the type name "%enum.Color"
    const match = enumTypeName.match(/\[(\d+) x i8\]/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    // If no match, the enum might not have a data field (unit-only enum)
    return 0;
  }

  protected generateEnumVariantConstruction(
    enumDecl: AST.EnumDecl,
    variant: AST.EnumVariant,
    variantIndex: number,
    genericArgs?: AST.TypeNode[],
  ): string {
    let enumName = enumDecl.name;

    // If generic args are provided, instantiate the generic enum
    if (genericArgs && genericArgs.length > 0) {
      // Substitute generic args if we are in a generic context
      const substitutedArgs = genericArgs.map((arg) =>
        this.substituteType(arg, this.currentTypeMap),
      );

      enumName = this.instantiateGenericEnum(enumDecl.name, substitutedArgs);
    }

    const enumType = `%enum.${enumName}`;

    // This path only handles unit variants (no associated data).
    // Tuple variants go through CallExpressionGenerator.
    // Struct variants go through ExpressionGenerator (StructLiteral path).
    if (variant.dataType) {
      throw this.createError(
        `Enum variants with associated data are not yet supported in code generation`,
        variant,
        `Variant '${variant.name}' has associated data. Only unit variants are currently supported.`,
      );
    }

    // Allocate space for the enum value
    const enumPtr = this.newRegister();
    this.emit(`  ${enumPtr} = alloca ${enumType}`);

    // Get pointer to tag field (index 0)
    const tagPtr = this.newRegister();
    this.emit(
      `  ${tagPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${enumPtr}, i32 0, i32 0`,
    );

    // Store the variant index as the discriminant
    this.emit(`  store i32 ${variantIndex}, i32* ${tagPtr}`);

    // Load and return the enum value
    const result = this.newRegister();
    this.emit(`  ${result} = load ${enumType}, ${enumType}* ${enumPtr}`);

    return result;
  }
}
