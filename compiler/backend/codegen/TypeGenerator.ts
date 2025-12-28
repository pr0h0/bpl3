import type { AST } from "../..";
import { CompilerError } from "../../common/CompilerError";
import { BaseCodeGenerator } from "./BaseCodeGenerator";
import { TypeSubstitution } from "../../middleend/TypeUtils";

export abstract class TypeGenerator extends BaseCodeGenerator {
  protected abstract generateFunction(
    decl: AST.FunctionDecl,
    parentStruct?: AST.StructDecl | AST.EnumDecl,
    captureInfo?: { name: string; fields: { name: string; type: string }[] },
  ): void;

  protected getMangledName(
    name: string,
    type: AST.FunctionTypeNode,
    isExtern: boolean = false,
    genericArgs: AST.TypeNode[] = [],
  ): string {
    if (name === "main" || isExtern) return name;
    let mangled = `${name}_${type.paramTypes.map((t) => this.mangleType(t)).join("_")}`;
    if (genericArgs.length > 0) {
      mangled += "_" + genericArgs.map((t) => this.mangleType(t)).join("_");
    }
    return mangled;
  }

  protected getDwarfTypeId(type: AST.TypeNode): number {
    if (!this.generateDwarf) return 0;
    console.log(
      `getDwarfTypeId: ${type.kind} ${type.kind === "BasicType" ? type.name : ""}`,
    );

    const resolvedName = this.resolveType(type);

    // Pointers
    if (resolvedName.endsWith("*")) {
      // We need to find the pointee type.
      // This is tricky because resolveType returns a string.
      // We need to inspect the AST node.
      if (type.kind === "BasicType") {
        if (type.pointerDepth > 0) {
          // Create a copy of the type with one less pointer depth
          const pointeeType: AST.BasicTypeNode = {
            ...type,
            pointerDepth: type.pointerDepth - 1,
          };
          const pointeeId = this.getDwarfTypeId(pointeeType);
          return this.debugInfoGenerator.createPointerType(pointeeId);
        }
      }
      // Fallback for other pointer types (e.g. function pointers, or if we can't deduce)
      // Just use void*
      const voidId = 0;
      return this.debugInfoGenerator.createPointerType(voidId);
    }

    // Basic Types
    let primitiveName = "";
    if (type.kind === "BasicType") {
      // Check for type aliases
      if (this.typeAliasMap.has(type.name)) {
        const aliasDecl = this.typeAliasMap.get(type.name)!;

        // If it's a generic alias, we need to substitute args
        if (aliasDecl.genericParams && aliasDecl.genericParams.length > 0) {
          if (type.genericArgs && type.genericArgs.length > 0) {
            const typeMap = new Map<string, AST.TypeNode>();
            for (let i = 0; i < aliasDecl.genericParams.length; i++) {
              if (i < type.genericArgs.length) {
                typeMap.set(
                  aliasDecl.genericParams[i]!.name,
                  type.genericArgs[i]!,
                );
              }
            }
            const substituted = this.substituteType(aliasDecl.type, typeMap);
            return this.getDwarfTypeId(substituted);
          }
        }

        // Non-generic alias or generic alias used without args
        return this.getDwarfTypeId(aliasDecl.type);
      }

      primitiveName = type.name;
    }

    if (primitiveName === "i32") {
      return this.debugInfoGenerator.createBasicType("int", 32, 5);
    }
    if (primitiveName === "int") {
      return this.debugInfoGenerator.createBasicType("int", 32, 5);
    }
    if (primitiveName === "u32") {
      return this.debugInfoGenerator.createBasicType("unsigned int", 32, 7);
    }
    if (primitiveName === "uint") {
      return this.debugInfoGenerator.createBasicType("unsigned int", 32, 7);
    }
    if (primitiveName === "i64" || primitiveName === "long") {
      return this.debugInfoGenerator.createBasicType("long", 64, 5);
    }
    if (primitiveName === "u64" || primitiveName === "ulong") {
      return this.debugInfoGenerator.createBasicType("unsigned long", 64, 7);
    }
    if (primitiveName === "i16" || primitiveName === "short") {
      return this.debugInfoGenerator.createBasicType("short", 16, 5);
    }
    if (primitiveName === "u16" || primitiveName === "ushort") {
      return this.debugInfoGenerator.createBasicType("unsigned short", 16, 7);
    }
    if (primitiveName === "i8") {
      return this.debugInfoGenerator.createBasicType("signed char", 8, 6);
    }
    if (primitiveName === "char") {
      return this.debugInfoGenerator.createBasicType("char", 8, 8);
    }
    if (primitiveName === "u8" || primitiveName === "uchar") {
      return this.debugInfoGenerator.createBasicType("unsigned char", 8, 8);
    }
    if (primitiveName === "i1" || primitiveName === "bool") {
      return this.debugInfoGenerator.createBasicType("bool", 8, 2);
    }
    if (primitiveName === "double") {
      return this.debugInfoGenerator.createBasicType("double", 64, 4);
    }
    if (primitiveName === "float") {
      return this.debugInfoGenerator.createBasicType("float", 64, 4);
    }
    if (primitiveName === "void") {
      return 0;
    }

    // Fallback using resolvedName (for non-BasicTypes or unresolved aliases)
    if (resolvedName === "i32") {
      return this.debugInfoGenerator.createBasicType("int", 32, 5);
    }
    if (resolvedName === "int") {
      return this.debugInfoGenerator.createBasicType("int", 32, 5);
    }
    if (resolvedName === "u32") {
      return this.debugInfoGenerator.createBasicType("unsigned int", 32, 7);
    }
    if (resolvedName === "uint") {
      return this.debugInfoGenerator.createBasicType("unsigned int", 32, 7);
    }
    if (resolvedName === "i64" || resolvedName === "long") {
      return this.debugInfoGenerator.createBasicType("long", 64, 5);
    }
    if (resolvedName === "u64" || resolvedName === "ulong") {
      return this.debugInfoGenerator.createBasicType("unsigned long", 64, 7);
    }
    if (resolvedName === "i16" || resolvedName === "short") {
      return this.debugInfoGenerator.createBasicType("short", 16, 5);
    }
    if (resolvedName === "u16" || resolvedName === "ushort") {
      return this.debugInfoGenerator.createBasicType("unsigned short", 16, 7);
    }
    if (resolvedName === "i8") {
      return this.debugInfoGenerator.createBasicType("char", 8, 6);
    }
    if (resolvedName === "char") {
      return this.debugInfoGenerator.createBasicType("char", 8, 8);
    }
    if (resolvedName === "u8" || resolvedName === "uchar") {
      return this.debugInfoGenerator.createBasicType("unsigned char", 8, 8);
    }
    if (resolvedName === "i1" || resolvedName === "bool") {
      return this.debugInfoGenerator.createBasicType("bool", 8, 2);
    }
    if (resolvedName === "double") {
      return this.debugInfoGenerator.createBasicType("double", 64, 4);
    }
    if (resolvedName === "float") {
      return this.debugInfoGenerator.createBasicType("float", 64, 4);
    }
    if (resolvedName === "void") {
      return 0;
    }

    // Function Types (Closures)
    if (type.kind === "FunctionType") {
      const voidPtrId = this.debugInfoGenerator.createPointerType(0);
      const fileId = this.debugInfoGenerator.getFileNodeId(
        this.currentFilePath,
      );

      // Create members for { i8*, i8* }
      const funcMember = this.debugInfoGenerator.createMemberType(
        "func_ptr",
        fileId,
        0,
        64,
        0,
        voidPtrId,
      );
      const envMember = this.debugInfoGenerator.createMemberType(
        "env_ptr",
        fileId,
        0,
        64,
        64,
        voidPtrId,
      );

      const funcType = type as AST.FunctionTypeNode;
      const retName = this.resolveType(funcType.returnType);
      const paramNames = funcType.paramTypes
        .map((p) => this.resolveType(p))
        .join("_");
      const closureName = `Closure_${retName}_${paramNames}`.replace(
        /[^a-zA-Z0-9_]/g,
        "_",
      );

      return this.debugInfoGenerator.createStructType(
        closureName,
        128,
        fileId,
        0,
        [funcMember, envMember],
      );
    }

    // Arrays
    if (
      type.kind === "BasicType" &&
      type.arrayDimensions &&
      type.arrayDimensions.length > 0
    ) {
      const size = type.arrayDimensions[0];
      if (size === null) {
        // Dynamic array / Slice
        // Struct { data: T*, len: i64 }

        // Element type (rest of dimensions)
        let elementTypeNode: AST.BasicTypeNode;
        if (type.arrayDimensions.length > 1) {
          elementTypeNode = {
            ...type,
            arrayDimensions: type.arrayDimensions.slice(1),
          };
        } else {
          elementTypeNode = {
            ...type,
            arrayDimensions: [],
          };
        }

        const elementTypeId = this.getDwarfTypeId(elementTypeNode);
        const ptrTypeId =
          this.debugInfoGenerator.createPointerType(elementTypeId);
        const i64TypeId = this.debugInfoGenerator.createBasicType(
          "long",
          64,
          5,
        );

        const fileId = this.debugInfoGenerator.getFileNodeId(
          this.currentFilePath,
        );

        // Create members
        const dataMember = this.debugInfoGenerator.createMemberType(
          "data",
          fileId,
          0,
          64,
          0,
          ptrTypeId,
        );
        const lenMember = this.debugInfoGenerator.createMemberType(
          "len",
          fileId,
          0,
          64,
          64,
          i64TypeId,
        );

        // Use a safe name for the slice type
        const elementTypeName = this.resolveType(elementTypeNode).replace(
          /[^a-zA-Z0-9_]/g,
          "_",
        );

        return this.debugInfoGenerator.createStructType(
          `slice_${elementTypeName}`,
          128, // Size (64 + 64)
          fileId,
          0,
          [dataMember, lenMember],
        );
      }

      // Element type
      let elementTypeNode: AST.BasicTypeNode;
      if (type.arrayDimensions.length > 1) {
        elementTypeNode = {
          ...type,
          arrayDimensions: type.arrayDimensions.slice(1),
        };
      } else {
        elementTypeNode = {
          ...type,
          arrayDimensions: [],
        };
      }

      const elementTypeId = this.getDwarfTypeId(elementTypeNode);
      const elementSizeInBits = this.getTypeSizeInBits(elementTypeNode);
      const sizeInBits = size! * elementSizeInBits;
      const alignInBits = elementSizeInBits >= 64 ? 64 : elementSizeInBits;

      return this.debugInfoGenerator.createArrayType(
        size!,
        elementTypeId,
        sizeInBits,
        alignInBits,
      );
    }

    // Structs
    if (type.kind === "BasicType") {
      const structDecl = this.structMap.get(type.name);
      if (structDecl) {
        // Check if we already created this struct type to avoid recursion
        // DebugInfoGenerator caches by name, but we need to compute elements.
        // We can use a placeholder or forward declaration if needed, but for now let's just compute.

        // We need to compute fields.
        let fields = this.getAllStructFields(structDecl);
        let structName = structDecl.name;

        // Handle generics
        if (
          type.genericArgs &&
          type.genericArgs.length > 0 &&
          structDecl.genericParams
        ) {
          const typeMap = new Map<string, AST.TypeNode>();
          for (let i = 0; i < structDecl.genericParams.length; i++) {
            if (i < type.genericArgs.length) {
              typeMap.set(
                structDecl.genericParams[i]!.name,
                type.genericArgs[i]!,
              );
            }
          }

          fields = fields.map((field) => ({
            ...field,
            type: this.substituteType(field.type, typeMap),
          }));

          // Update struct name for DWARF to avoid collision with generic template
          const argNames = type.genericArgs
            .map((arg) => this.mangleType(arg))
            .join("_");
          structName = `${structDecl.name}_${argNames}`;
        }

        // Check cache to avoid recursion
        if (this.debugInfoGenerator.hasType(`struct:${structName}`)) {
          return this.debugInfoGenerator.getType(`struct:${structName}`)!;
        }

        const fileId = this.debugInfoGenerator.getFileNodeId(
          structDecl.location.file,
        );

        // Create Forward Declaration to handle recursion
        this.debugInfoGenerator.createForwardDecl(
          "DW_TAG_structure_type",
          structName,
          fileId,
          structDecl.location?.startLine || 0,
        );

        const elements: number[] = [];
        let offset = 0;

        for (const field of fields) {
          const fieldTypeId = this.getDwarfTypeId(field.type);
          // Compute size and alignment (simplified)
          let size = 64; // Default to 64 bits for pointers/i64/double
          const fieldTypeName = this.resolveType(field.type);
          if (fieldTypeName === "i32") size = 32;
          if (fieldTypeName === "i16") size = 16;
          if (fieldTypeName === "i8" || fieldTypeName === "i1") size = 8;

          // Alignment padding (simplified)
          // Assume packed or natural alignment. LLVM handles layout, but DWARF needs offsets.
          // For now, let's assume 64-bit alignment for everything to keep it simple,
          // or just increment offset by size.

          const memberId = this.debugInfoGenerator.createMemberType(
            field.name,
            fileId,
            field.location?.startLine || 0,
            size,
            offset,
            fieldTypeId,
          );
          elements.push(memberId);
          offset += size;
        }

        return this.debugInfoGenerator.createStructType(
          structName,
          offset, // Total size
          fileId,
          structDecl.location?.startLine || 0,
          elements,
          true, // Force update
        );
      }
    }

    // Tuples
    if (type.kind === "TupleType") {
      const tupleType = type as AST.TupleTypeNode;
      const elements: number[] = [];
      let offset = 0;
      const fileId = this.debugInfoGenerator.getFileNodeId(
        this.currentFilePath,
      );

      for (let i = 0; i < tupleType.types.length; i++) {
        const fieldType = tupleType.types[i]!;
        const fieldTypeId = this.getDwarfTypeId(fieldType);
        const fieldSize = this.getTypeSizeInBits(fieldType);

        const memberId = this.debugInfoGenerator.createMemberType(
          `_${i}`,
          fileId,
          0,
          fieldSize,
          offset,
          fieldTypeId,
        );
        elements.push(memberId);
        offset += fieldSize;
      }

      return this.debugInfoGenerator.createStructType(
        `tuple_${elements.length}`, // Simplified name
        offset,
        fileId,
        0,
        elements,
      );
    }

    // Enums
    if (type.kind === "BasicType") {
      let enumDecl = this.enumDeclMap.get(type.name);

      // Try to use resolved declaration if name lookup failed
      if (
        !enumDecl &&
        type.resolvedDeclaration &&
        type.resolvedDeclaration.kind === "EnumDecl"
      ) {
        enumDecl = type.resolvedDeclaration as AST.EnumDecl;
      }

      // Fallback: try stripping namespace
      if (!enumDecl && type.name.includes(".")) {
        const parts = type.name.split(".");
        const simpleName = parts[parts.length - 1]!;
        enumDecl = this.enumDeclMap.get(simpleName);
      }

      if (enumDecl) {
        const fileId = this.debugInfoGenerator.getFileNodeId(
          enumDecl.location.file,
        );

        let enumName = enumDecl.name;
        let maxSize = 0;

        // Handle generics
        if (
          type.genericArgs &&
          type.genericArgs.length > 0 &&
          enumDecl.genericParams
        ) {
          const argNames = type.genericArgs
            .map((arg) => this.mangleType(arg))
            .join("_");
          enumName = `${enumDecl.name}_${argNames}`;

          // Check cache to avoid recursion
          if (this.debugInfoGenerator.hasType(`struct:${enumName}`)) {
            return this.debugInfoGenerator.getType(`struct:${enumName}`)!;
          }

          // No forward declaration needed for Enums as we erase payload to bytes
          // and don't reference the type recursively in the DWARF structure.

          const i32TypeId = this.debugInfoGenerator.createBasicType(
            "int",
            32,
            5,
          );
          const i8TypeId = this.debugInfoGenerator.createBasicType(
            "char",
            8,
            8,
          );

          // Calculate payload size
          let payloadSize = 0;
          if (this.enumDataSizes.has(enumName)) {
            payloadSize = this.enumDataSizes.get(enumName)!;
          } else {
            // Substitute types to calculate size
            const typeMap = new Map<string, AST.TypeNode>();
            const basicType = type as AST.BasicTypeNode;
            for (let i = 0; i < enumDecl.genericParams.length; i++) {
              if (i < basicType.genericArgs.length) {
                typeMap.set(
                  enumDecl.genericParams[i]!.name,
                  basicType.genericArgs[i]!,
                );
              }
            }

            const substitutedDecl: AST.EnumDecl = {
              ...enumDecl,
              variants: enumDecl.variants.map((v) => {
                if (!v.dataType) return v;
                if (v.dataType.kind === "EnumVariantTuple") {
                  return {
                    ...v,
                    dataType: {
                      ...v.dataType,
                      types: v.dataType.types.map((t) =>
                        this.substituteType(t, typeMap),
                      ),
                    },
                  };
                } else if (v.dataType.kind === "EnumVariantStruct") {
                  return {
                    ...v,
                    dataType: {
                      ...v.dataType,
                      fields: v.dataType.fields.map((f) => ({
                        ...f,
                        type: this.substituteType(f.type, typeMap),
                      })),
                    },
                  };
                }
                return v;
              }),
            };

            payloadSize = this.calculateEnumMaxSize(substitutedDecl);
            this.enumDataSizes.set(enumName, payloadSize);
          }

          const elements: number[] = [];
          const tagMember = this.debugInfoGenerator.createMemberType(
            "tag",
            fileId,
            enumDecl.location.startLine,
            32,
            0,
            i32TypeId,
          );
          elements.push(tagMember);

          if (payloadSize > 0) {
            const payloadArrayTypeId = this.debugInfoGenerator.createArrayType(
              payloadSize,
              i8TypeId,
              payloadSize * 8,
              8,
            );

            // Payload offset: 32 bits (4 bytes)
            const payloadMember = this.debugInfoGenerator.createMemberType(
              "payload",
              fileId,
              enumDecl.location.startLine,
              payloadSize * 8,
              32,
              payloadArrayTypeId,
            );
            elements.push(payloadMember);
          }

          return this.debugInfoGenerator.createStructType(
            enumName,
            32 + payloadSize * 8,
            fileId,
            enumDecl.location.startLine,
            elements,
          );
        } else {
          // Non-generic
          if (this.debugInfoGenerator.hasType(`struct:${enumName}`)) {
            return this.debugInfoGenerator.getType(`struct:${enumName}`)!;
          }

          // No forward declaration needed for Enums

          let size = this.enumDataSizes.get(type.name);
          if (size === undefined) {
            size = this.calculateEnumMaxSize(enumDecl);
            this.enumDataSizes.set(type.name, size);
          }
          maxSize = size;
        }

        // Create DWARF struct
        // { i32 tag, [maxSize x i8] data }
        const elements: number[] = [];

        // Tag (i32)
        const intTypeId = this.debugInfoGenerator.createBasicType("int", 32, 5);
        const tagMember = this.debugInfoGenerator.createMemberType(
          "tag",
          fileId,
          enumDecl.location.startLine,
          32,
          0,
          intTypeId,
        );
        elements.push(tagMember);

        // Data (array of i8) - only if maxSize > 0
        if (maxSize > 0) {
          const u8TypeId = this.debugInfoGenerator.createBasicType(
            "unsigned char",
            8,
            8,
          );
          const arrayTypeId = this.debugInfoGenerator.createArrayType(
            maxSize,
            u8TypeId,
            maxSize * 8,
            8,
          );

          const dataMember = this.debugInfoGenerator.createMemberType(
            "data",
            fileId,
            enumDecl.location.startLine,
            maxSize * 8,
            32, // Offset after tag (32 bits)
            arrayTypeId,
          );
          elements.push(dataMember);
        }

        const totalSize = 32 + maxSize * 8;

        return this.debugInfoGenerator.createStructType(
          enumName,
          totalSize,
          fileId,
          enumDecl.location.startLine,
          elements,
          false, // No forward declaration to overwrite
        );
      }
    }

    return 0; // Unknown
  }

  protected getTypeIdFromNode(type: AST.TypeNode): number {
    const typeName = this.resolveType(type); // Get LLVM type name as key

    // Primitives
    if (typeName === "i32") return 1;
    if (typeName === "i1") return 2;
    if (typeName === "double") return 3;
    if (typeName === "i8*") return 4;

    if (!this.typeIdMap.has(typeName)) {
      this.typeIdMap.set(typeName, this.nextTypeId++);
    }
    return this.typeIdMap.get(typeName)!;
  }

  protected getAllStructFields(decl: AST.StructDecl): AST.StructField[] {
    let fields: AST.StructField[] = [];
    if (decl.inheritanceList) {
      for (const typeNode of decl.inheritanceList) {
        if (typeNode.kind === "BasicType") {
          // Check for generic instantiation
          if (typeNode.genericArgs && typeNode.genericArgs.length > 0) {
            const baseDecl =
              (typeNode.resolvedDeclaration as AST.StructDecl) ||
              this.structMap.get(typeNode.name);
            if (baseDecl && baseDecl.kind === "StructDecl") {
              // Check if we are in a generic template context (e.g. Child<T> inheriting Parent<T>)
              // If so, we shouldn't try to generate a monomorphized struct for Parent<T> yet,
              // as T is not a concrete type. Instead, we should just substitute the fields.
              const isTemplateContext =
                decl.genericParams.length > 0 &&
                typeNode.genericArgs.some((arg) => {
                  if (arg.kind === "BasicType") {
                    return decl.genericParams.some(
                      (p) => p.name === (arg as AST.BasicTypeNode).name,
                    );
                  }
                  return false;
                });

              if (isTemplateContext) {
                const parentFields = this.getAllStructFields(baseDecl);
                const typeMap = new Map<string, AST.TypeNode>();
                for (let i = 0; i < baseDecl.genericParams.length; i++) {
                  if (i < typeNode.genericArgs.length) {
                    typeMap.set(
                      baseDecl.genericParams[i]!.name,
                      typeNode.genericArgs[i]!,
                    );
                  }
                }
                fields = parentFields.map((f) => ({
                  ...f,
                  type: this.substituteType(f.type, typeMap),
                }));
                break;
              }

              // Resolve the monomorphized struct to ensure it exists and we get the concrete name
              const llvmType = this.resolveMonomorphizedType(
                baseDecl,
                typeNode.genericArgs,
              );
              // llvmType is like %struct.Name_Args
              let structName = llvmType;
              if (structName.startsWith("%struct.")) {
                structName = structName.substring(8);
              }
              // Strip pointer if present (shouldn't be for struct type)
              while (structName.endsWith("*")) {
                structName = structName.slice(0, -1);
              }

              const parent = this.structMap.get(structName);
              if (parent) {
                fields = this.getAllStructFields(parent);
                break; // Only one parent struct
              } else {
                // Parent is likely a monomorphized struct not in structMap
                // We need to substitute fields from baseDecl
                const parentFields = this.getAllStructFields(baseDecl);
                const typeMap = new Map<string, AST.TypeNode>();
                for (let i = 0; i < baseDecl.genericParams.length; i++) {
                  if (i < typeNode.genericArgs.length) {
                    typeMap.set(
                      baseDecl.genericParams[i]!.name,
                      typeNode.genericArgs[i]!,
                    );
                  }
                }
                fields = parentFields.map((f) => ({
                  ...f,
                  type: this.substituteType(f.type, typeMap),
                }));
                break; // Only one parent struct
              }
            }
          }

          // Try to use resolved declaration first (supports cross-module inheritance)
          if (
            typeNode.resolvedDeclaration &&
            typeNode.resolvedDeclaration.kind === "StructDecl"
          ) {
            const parent = typeNode.resolvedDeclaration as AST.StructDecl;
            fields = this.getAllStructFields(parent);
            break; // Only one parent struct
          }

          // Check for primitive inheritance
          const primitives = [
            "int",
            "uint",
            "i32",
            "u32",
            "i64",
            "u64",
            "long",
            "ulong",
            "i16",
            "u16",
            "short",
            "ushort",
            "i8",
            "u8",
            "char",
            "bool",
            "float",
            "double",
          ];
          if (
            primitives.includes(typeNode.name) &&
            typeNode.pointerDepth === 0
          ) {
            fields.push({
              kind: "StructField",
              name: "__base__",
              type: typeNode,
              location: typeNode.location,
            });
            break;
          }

          // Fallback to name lookup (local structs)
          const parent = this.structMap.get(typeNode.name);
          if (parent) {
            fields = this.getAllStructFields(parent);
            break; // Only one parent struct
          }
        }
      }
    }

    const currentFields = decl.members.filter(
      (m) => m.kind === "StructField",
    ) as AST.StructField[];

    let resultFields = [...fields];
    // VTable injection removed for POD structs

    return resultFields.concat(currentFields);
  }

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

    if (parentName) {
      layout = [...this.computeVTableLayout(parentName)];
    }

    // Add/Override methods
    const methods = this.getStructMethods(decl);
    for (const method of methods) {
      const index = layout.indexOf(method);
      if (index === -1) {
        layout.push(method);
      }
      // If index !== -1, it's an override, position stays same.
    }

    this.vtableLayouts.set(name, layout);
    return layout;
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

  protected generateVTable(structName: string, decl: AST.StructDecl) {
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
        console.log(
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
        console.log(
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
          let mangled = this.getMangledName(baseName, funcType);

          // If the function is generic, we can't put it in vtable directly unless it's instantiated?
          // But vtable methods shouldn't be generic.
          // If fallback is generic, we skip it.
          if (fallback.genericParams.length > 0) {
            ptrs.push("null");
            continue;
          }

          // If we are here, it means we failed to find methodDecl by mangled name.
          // This implies 'methodName' (from vtable) != getMangledName(method in owner).
          // We fallback to finding by name directly.
          // This looks valid LLVM IR: [i8* ..., i8* null]
          // But maybe it needs to be `i8* null` explicitly?
          // Yes, `null` alone is not enough in array constant if type is not inferred?
          // But the array type is `[4 x i8*]`.

          // Let's check the error again:
          // constant [4 x i8*] [..., null]
          // ^ expected type

          // It seems `null` must be typed as `i8* null`.

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
      // All functions now take an implicit context pointer as first argument
      // And methods take 'this' as the second argument (which is in paramTypes)
      const paramTypes = funcType.paramTypes.map((p) => this.resolveType(p));
      const paramsStr =
        paramTypes.length > 0 ? `, ${paramTypes.join(", ")}` : "";
      const rawFuncTypeStr = `${retType} (i8*${paramsStr})*`;

      ptrs.push(`i8* bitcast (${rawFuncTypeStr} @${mangled} to i8*)`);
    }

    const arrayType = `[${methods.length} x i8*]`;
    const arrayContent = `[${ptrs.join(", ")}]`;

    this.emitDeclaration(
      `${globalName} = constant ${arrayType} ${arrayContent}`,
    );
    this.emitDeclaration("");
  }

  protected generateStruct(decl: AST.StructDecl, mangledName?: string) {
    const structName = mangledName || decl.name;

    // Avoid re-emitting
    if (this.generatedStructs.has(structName)) return;
    this.generatedStructs.add(structName);

    // %struct.Name = type { ... }
    const fields = this.getAllStructFields(decl);

    // We need to resolve field types.
    // If this is a monomorphized struct (generic instance), the fields might use generic types.
    // The 'decl' passed here should effectively be the instantiated version with types substituted.
    // However, for simplicity, 'resolveType' handles substitution if 'decl' is a virtual AST node?
    // No, standard resolveType relies on resolving AST nodes.
    // When we call generateStruct for Box<int>, we should have already substituted T with int in the fields.

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
        const mangledName = `${structName}_${method.name}`;

        if (this.currentFunctionName) {
          this.pendingGenerations.push(() => {
            const oldName = method.name;
            method.name = mangledName;
            this.generateFunction(method, decl);
            method.name = oldName;
          });
        } else {
          method.name = mangledName;
          this.generateFunction(method, decl);
          method.name = originalName;
        }
      }
    }
  }

  protected calculateEnumMaxSize(decl: AST.EnumDecl): number {
    let maxSize = 0;
    for (const variant of decl.variants) {
      let variantSize = 0;

      if (variant.dataType) {
        if (variant.dataType.kind === "EnumVariantTuple") {
          // Tuple variant: calculate size with alignment
          let offset = 0;
          for (const fieldType of variant.dataType.types) {
            const llvmType = this.resolveType(fieldType);
            const fieldSize = this.getTypeSize(llvmType);

            // Align offset based on field size
            const alignment =
              fieldSize >= 8 ? 8 : fieldSize >= 4 ? 4 : fieldSize >= 2 ? 2 : 1;
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
            const llvmType = this.resolveType(field.type);
            const fieldSize = this.getTypeSize(llvmType);

            // Align offset based on field size
            const alignment =
              fieldSize >= 8 ? 8 : fieldSize >= 4 ? 4 : fieldSize >= 2 ? 2 : 1;
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
    let size = 0;
    const fields = this.getAllStructFields(decl);
    for (const field of fields) {
      size += this.getTypeSizeInBits(field.type);
    }
    return size;
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
        case "int":
        case "uint":
        case "double":
        case "float":
          return 64;
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
      if (enumDecl) return this.calculateEnumMaxSize(enumDecl) * 8;

      return 64; // Default
    }

    if (type.kind === "FunctionType") return 128; // Closure { func_ptr, env_ptr }
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
        const mangledName = `${enumName}_${method.name}`;

        if (this.currentFunctionName) {
          this.pendingGenerations.push(() => {
            const oldName = method.name;
            method.name = mangledName;
            this.generateFunction(method, decl);
            method.name = oldName;
          });
        } else {
          method.name = mangledName;
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

    // For now, only handle unit variants (no associated data)
    // TODO: Handle tuple and struct variants with data
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

  protected mangleType(type: AST.TypeNode): string {
    if (type.kind === "BasicType") {
      // Check for type aliases
      if (this.typeAliasMap.has(type.name)) {
        const aliasDecl = this.typeAliasMap.get(type.name)!;
        // Only resolve non-generic aliases here to avoid complexity with generic args substitution in mangling
        if (!aliasDecl.genericParams || aliasDecl.genericParams.length === 0) {
          const aliasedMangled = this.mangleType(aliasDecl.type);

          // Add pointers and arrays from the current usage
          let suffix = "";
          for (let i = 0; i < type.pointerDepth; i++) suffix += "_ptr";
          for (let d of type.arrayDimensions) suffix += `_arr_${d}_`;

          return `${aliasedMangled}${suffix}`;
        }
      }

      let name = type.name;

      // Normalize aliases to match TypeChecker and ensure consistent mangling
      switch (name) {
        case "int":
          name = "i32";
          break;
        case "uint":
          name = "u32";
          break;
        case "float":
          name = "double";
          break;
        case "bool":
          name = "i1";
          break;
        case "char":
          name = "i8";
          break;
        case "uchar":
          name = "u8";
          break;
        case "short":
          name = "i16";
          break;
        case "ushort":
          name = "u16";
          break;
        case "long":
          name = "i64";
          break;
        case "ulong":
          name = "u64";
          break;
        case "string":
          name = "i8_ptr";
          break;
      }

      // Handle generic args in mangling
      if (type.genericArgs.length > 0) {
        const args = type.genericArgs.map((t) => this.mangleType(t)).join("_");
        name = `${name}_${args}`;
      }

      // Cleanup name similarly to before but on AST level names
      if (name.includes(".")) name = name.replace(/\./g, "_");

      // Basic type pointers/arrays
      let suffix = "";
      for (let i = 0; i < type.pointerDepth; i++) suffix += "_ptr";
      for (let d of type.arrayDimensions) suffix += `_arr_${d}_`;

      return `${name}${suffix}`;
    } else if (type.kind === "FunctionType") {
      return "fn"; // simplified mangling for fn types
    }
    return "unknown";
  }

  protected checkInheritance(childName: string, parentName: string): boolean {
    if (childName === parentName) return true;

    const structDecl = this.structMap.get(childName);
    if (!structDecl) return false;

    if (structDecl.inheritanceList) {
      for (const parent of structDecl.inheritanceList) {
        if (parent.kind === "BasicType") {
          const parentBasic = parent as AST.BasicTypeNode;
          // Check direct parent
          if (parentBasic.name === parentName) return true;
          // Check recursive
          if (this.checkInheritance(parentBasic.name, parentName)) return true;
        }
      }
    }
    return false;
  }

  protected isGenericTypeParameter(name: string): boolean {
    // Check if this is a generic type parameter (usually single uppercase letter or short name)
    // This is a heuristic - better would be to track in symbol table
    return name.length <= 2 && name === name.toUpperCase();
  }

  protected isPrimitiveType(name: string): boolean {
    const primitives = [
      "int",
      "i8",
      "i16",
      "i32",
      "i64",
      "u8",
      "u16",
      "u32",
      "u64",
      "float",
      "double",
      "bool",
      "char",
      "void",
      "string",
    ];
    return primitives.includes(name);
  }

  protected getASTTypeSize(type: AST.TypeNode): number {
    const typeStr = this.resolveType(type);

    // Map LLVM types to sizes
    if (typeStr === "i1") return 1;
    if (typeStr === "i8") return 1;
    if (typeStr === "i16") return 2;
    if (typeStr === "i32") return 4;
    if (typeStr === "i64") return 8;
    if (typeStr === "float") return 4;
    if (typeStr === "double") return 8;
    if (typeStr.includes("*")) return 8; // Pointers are 8 bytes

    // For structs and other types, return a default
    return 0;
  }

  protected findMethodOwner(
    structName: string,
    methodName: string,
  ): AST.StructDecl | null {
    const decl = this.structMap.get(structName);
    if (!decl) return null;

    // Check members
    for (const m of decl.members) {
      if (m.kind === "FunctionDecl") {
        const funcDecl = m as AST.FunctionDecl;
        if (funcDecl.name === methodName) {
          return decl;
        }
        // Check mangled name (for vtable generation)
        if (
          funcDecl.resolvedType &&
          funcDecl.resolvedType.kind === "FunctionType"
        ) {
          const mangled = this.getMangledName(
            funcDecl.name,
            funcDecl.resolvedType as AST.FunctionTypeNode,
          );
          if (mangled === methodName) {
            return decl;
          }
          // Check vtable name
          const vtableName = this.getVTableMethodName(funcDecl);
          if (vtableName === methodName) {
            return decl;
          }
        }
      }
    }

    // Check parents
    for (const parent of decl.inheritanceList) {
      if (parent.kind === "BasicType") {
        // Handle generic inheritance
        if (parent.genericArgs && parent.genericArgs.length > 0) {
          const baseDecl =
            (parent.resolvedDeclaration as AST.StructDecl) ||
            this.structMap.get(parent.name);
          if (baseDecl && baseDecl.kind === "StructDecl") {
            // Resolve the monomorphized struct
            const llvmType = this.resolveMonomorphizedType(
              baseDecl,
              parent.genericArgs,
            );
            let pName = llvmType;
            if (pName.startsWith("%struct.")) {
              pName = pName.substring(8);
            }
            // Strip pointer if present
            while (pName.endsWith("*")) {
              pName = pName.slice(0, -1);
            }

            // If the parent is a monomorphized struct, we need to check its methods.
            // But findMethodOwner expects a struct name that exists in structMap.
            // Monomorphized structs are added to structMap during generation.
            // However, if it hasn't been generated yet, we might fail.
            // But resolveMonomorphizedType should have triggered generation.

            const owner = this.findMethodOwner(pName, methodName);
            if (owner) return owner;
          }
          continue;
        }

        let parentName = parent.name;
        // Use resolved declaration if available (handles imports)
        if (
          parent.resolvedDeclaration &&
          parent.resolvedDeclaration.kind === "StructDecl"
        ) {
          parentName = parent.resolvedDeclaration.name;
        }

        const owner = this.findMethodOwner(parentName, methodName);
        if (owner) return owner;
      }
    }
    return null;
  }

  protected findInstantiatedParentType(
    childDecl: AST.StructDecl,
    childType: AST.BasicTypeNode,
    parentName: string,
  ): AST.BasicTypeNode | undefined {
    if (childDecl.name === parentName) return childType;

    if (!childDecl.inheritanceList || childDecl.inheritanceList.length === 0)
      return undefined;

    const parentType = childDecl.inheritanceList[0] as AST.BasicTypeNode;

    // Substitute if child is generic
    let instantiatedParent = parentType;
    if (
      childDecl.genericParams.length > 0 &&
      childType.genericArgs.length > 0
    ) {
      const map = new Map<string, AST.TypeNode>();
      for (let i = 0; i < childDecl.genericParams.length; i++) {
        if (i < childType.genericArgs.length) {
          map.set(childDecl.genericParams[i]!.name, childType.genericArgs[i]!);
        }
      }
      instantiatedParent = this.substituteType(
        parentType,
        map,
      ) as AST.BasicTypeNode;
    }

    if (instantiatedParent.name === parentName) return instantiatedParent;

    const parentDecl = this.structMap.get(instantiatedParent.name);
    if (!parentDecl) return undefined;

    return this.findInstantiatedParentType(
      parentDecl,
      instantiatedParent,
      parentName,
    );
  }

  protected resolveTypeDepth = 0;

  protected resolveType(type: AST.TypeNode): string {
    if (this.resolveTypeDepth > 200) {
      throw new CompilerError(
        "resolveType recursion limit",
        "Check for circular type definitions or excessive nesting.",
        type.location,
      );
    }
    this.resolveTypeDepth++;
    try {
      if (!type) {
        throw new CompilerError(
          "Cannot resolve undefined type",
          "Internal compiler error: resolveType called with undefined.",
          {
            file: this.currentFilePath,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
        );
      }

      if (type.kind === "BasicType") {
        const basicType = type as AST.BasicTypeNode;

        let llvmType = "";

        // Check currentTypeMap for generic substitutions
        if (this.currentTypeMap.has(basicType.name)) {
          const mapped = this.currentTypeMap.get(basicType.name)!;

          // Prevent infinite recursion if mapped type is same as current type (T -> T)
          if (mapped.kind === "BasicType" && mapped.name === basicType.name) {
            // Fallback to struct name if T maps to T (generic template context)
            let llvmType = `%struct.${basicType.name}`;
            for (let i = 0; i < basicType.pointerDepth; i++) {
              llvmType += "*";
            }
            for (let i = basicType.arrayDimensions.length - 1; i >= 0; i--) {
              llvmType = `[${basicType.arrayDimensions[i]} x ${llvmType}]`;
            }
            return llvmType;
          }

          let llvmType = this.resolveType(mapped);

          for (let i = 0; i < basicType.pointerDepth; i++) {
            llvmType += "*";
          }

          for (let i = basicType.arrayDimensions.length - 1; i >= 0; i--) {
            llvmType = `[${basicType.arrayDimensions[i]} x ${llvmType}]`;
          }
          return llvmType;
        }

        // Check for type aliases
        if (this.typeAliasMap.has(basicType.name)) {
          const aliasDecl = this.typeAliasMap.get(basicType.name)!;
          // If it's a generic alias, we need to substitute args
          if (aliasDecl.genericParams && aliasDecl.genericParams.length > 0) {
            // For now, just resolve the base type if no args provided (should be handled by TypeChecker)
            // If args provided, we need substitution logic similar to structs
            if (basicType.genericArgs.length > 0) {
              const typeMap = new Map<string, AST.TypeNode>();
              for (let i = 0; i < aliasDecl.genericParams.length; i++) {
                typeMap.set(
                  aliasDecl.genericParams[i]!.name,
                  basicType.genericArgs[i]!,
                );
              }
              const substituted = this.substituteType(aliasDecl.type, typeMap);
              let llvmType = this.resolveType(substituted);

              for (let i = 0; i < basicType.pointerDepth; i++) {
                llvmType += "*";
              }
              for (let i = basicType.arrayDimensions.length - 1; i >= 0; i--) {
                llvmType = `[${basicType.arrayDimensions[i]} x ${llvmType}]`;
              }
              return llvmType;
            }
          }

          // Non-generic alias or generic alias used without args (if allowed/resolved)
          let llvmType = this.resolveType(aliasDecl.type);
          for (let i = 0; i < basicType.pointerDepth; i++) {
            llvmType += "*";
          }
          for (let i = basicType.arrayDimensions.length - 1; i >= 0; i--) {
            llvmType = `[${basicType.arrayDimensions[i]} x ${llvmType}]`;
          }
          return llvmType;
        }

        // Check for generics usage
        if (basicType.genericArgs && basicType.genericArgs.length > 0) {
          // Substitute generic args first
          const instantiatedArgs = basicType.genericArgs.map((arg) =>
            this.substituteType(arg, this.currentTypeMap),
          );

          let structDecl: AST.StructDecl | undefined;
          let enumDecl: AST.EnumDecl | undefined;
          let specDecl: AST.SpecDecl | undefined;

          // FIRST: Check resolvedDeclaration from TypeChecker (highest priority)
          // This ensures that qualified names like std.Option are correctly resolved
          // even if the name was canonicalized to just "Option" by TypeChecker
          if (basicType.resolvedDeclaration) {
            if (basicType.resolvedDeclaration.kind === "StructDecl") {
              structDecl = basicType.resolvedDeclaration as AST.StructDecl;
            } else if (basicType.resolvedDeclaration.kind === "EnumDecl") {
              enumDecl = basicType.resolvedDeclaration as AST.EnumDecl;
            } else if (basicType.resolvedDeclaration.kind === "SpecDecl") {
              specDecl = basicType.resolvedDeclaration as AST.SpecDecl;
            }
          }

          // FALLBACK: Lookup by name (for types not resolved by TypeChecker)
          if (!structDecl) structDecl = this.structMap.get(basicType.name);
          if (!enumDecl) enumDecl = this.enumDeclMap.get(basicType.name);
          if (!specDecl) specDecl = this.specMap.get(basicType.name);

          // Check for placeholders in instantiatedArgs
          const hasPlaceholders = instantiatedArgs.some((arg) => {
            if (arg.kind === "BasicType") {
              const name = (arg as AST.BasicTypeNode).name;
              if (this.currentTypeMap.has(name)) {
                const mapped = this.currentTypeMap.get(name)!;
                if (mapped.kind === "BasicType" && mapped.name === name) {
                  return true;
                }
              }
            }
            return false;
          });

          if (structDecl) {
            // Instantiate generic struct
            // If it's a pointer, we skip generation to avoid infinite recursion for recursive types
            const isPointer = basicType.pointerDepth > 0;
            llvmType = this.resolveMonomorphizedType(
              structDecl,
              instantiatedArgs,
              hasPlaceholders || isPointer,
            );
          } else if (enumDecl) {
            // Instantiate generic enum
            const mangledName = this.instantiateGenericEnum(
              enumDecl.name,
              instantiatedArgs,
              hasPlaceholders,
            );
            llvmType = `%enum.${mangledName}`;
          } else if (specDecl) {
            // Spec type is always a fat pointer { i8*, i8* }
            llvmType = "{ i8*, i8* }";
          } else {
            // Maybe a primitive like int<T>? Should not happen.
            if (basicType.name === "T") {
              if (this.currentTypeMap.has("T")) {
                const mapped = this.currentTypeMap.get("T")!;
              }
            }
            llvmType = `%struct.${basicType.name}`; // Fallback
          }
        } else {
          switch (basicType.name) {
            case "i32":
            case "u32":
            case "int":
            case "uint":
              llvmType = "i32";
              break;
            case "i8":
            case "u8":
            case "char":
            case "uchar":
              llvmType = "i8";
              break;
            case "i16":
            case "u16":
            case "short":
            case "ushort":
              llvmType = "i16";
              break;
            case "i64":
            case "u64":
            case "long":
            case "ulong":
              llvmType = "i64";
              break;
            case "float":
            case "double":
              llvmType = "double";
              break;
            case "bool":
            case "i1":
              llvmType = "i1";
              break;
            case "void":
              llvmType = basicType.pointerDepth > 0 ? "i8" : "void";
              break;
            case "string":
              llvmType = "i8*";
              break;
            case "null":
            case "nullptr":
              llvmType = "i8*"; // Generic pointer type
              break;
            default:
              // For non-primitive types without generic args, check resolvedDeclaration first
              if (basicType.resolvedDeclaration) {
                if (basicType.resolvedDeclaration.kind === "EnumDecl") {
                  const enumDecl =
                    basicType.resolvedDeclaration as AST.EnumDecl;
                  llvmType = `%enum.${enumDecl.name}`;
                } else if (
                  basicType.resolvedDeclaration.kind === "StructDecl"
                ) {
                  const structDecl =
                    basicType.resolvedDeclaration as AST.StructDecl;
                  llvmType = `%struct.${structDecl.name}`;
                } else if (basicType.resolvedDeclaration.kind === "SpecDecl") {
                  llvmType = "{ i8*, i8* }";
                } else {
                  llvmType = `%struct.${basicType.name}`;
                }
              } else if (this.enumVariants.has(basicType.name)) {
                llvmType = `%enum.${basicType.name}`;
              } else if (this.enumDeclMap.has(basicType.name)) {
                llvmType = `%enum.${basicType.name}`;
              } else if (this.specMap.has(basicType.name)) {
                llvmType = "{ i8*, i8* }";
              } else {
                llvmType = `%struct.${basicType.name}`;
              }
              break;
          }
        }

        for (let i = 0; i < basicType.pointerDepth; i++) {
          llvmType += "*";
        }

        if ("arrayDimensions" in basicType) {
          for (let i = basicType.arrayDimensions.length - 1; i >= 0; i--) {
            llvmType = `[${basicType.arrayDimensions[i]} x ${llvmType}]`;
          }
        }

        return llvmType;
      } else if (type.kind === "TupleType") {
        const tupleType = type as AST.TupleTypeNode;
        // Represent tuples as LLVM structs: { type0, type1, ... }
        const elementTypes = tupleType.types.map((t) => this.resolveType(t));
        return `{ ${elementTypes.join(", ")} }`;
      } else if (type.kind === "FunctionType") {
        const funcType = type as AST.FunctionTypeNode;
        const ret = this.resolveType(funcType.returnType);
        const params = funcType.paramTypes
          .map((p) => this.resolveType(p))
          .join(", ");
        // Raw function pointer: ret (params...)*
        return `${ret} (${params})*`;
      } else if (type.kind === "LambdaType") {
        const lambdaType = type as AST.LambdaTypeNode;
        const ret = this.resolveType(lambdaType.returnType);
        const params = lambdaType.paramTypes
          .map((p) => this.resolveType(p))
          .join(", ");
        // Closure type: { function_ptr, context_ptr }
        // Function signature: ret (i8*, params...)
        // We use i8* for the context pointer (type erased)
        const paramsStr = params ? `, ${params}` : "";
        return `{ ${ret} (i8*${paramsStr})*, i8* }`;
      }
      return "void";
    } finally {
      this.resolveTypeDepth--;
    }
  }

  protected isSigned(type: AST.TypeNode): boolean {
    if (type.kind === "BasicType") {
      return [
        "int",
        "i8",
        "i16",
        "i32",
        "i64",
        "char",
        "short",
        "long",
      ].includes((type as AST.BasicTypeNode).name);
    }
    return false;
  }

  protected isIntegerType(type: string): boolean {
    return ["i1", "i8", "i16", "i32", "i64"].includes(type);
  }

  protected getTypeId(type: string): number {
    if (this.typeIdMap.has(type)) {
      return this.typeIdMap.get(type)!;
    }
    const id = this.nextTypeId++;
    this.typeIdMap.set(type, id);
    return id;
  }

  protected resolveMonomorphizedType(
    baseStruct: AST.StructDecl,
    genericArgs: AST.TypeNode[],
    skipGeneration?: boolean,
  ): string {
    // Auto-detect placeholders if skipGeneration is not provided
    if (skipGeneration === undefined) {
      skipGeneration = genericArgs.some((arg) => {
        if (arg.kind === "BasicType") {
          const name = (arg as AST.BasicTypeNode).name;
          if (this.currentTypeMap.has(name)) {
            const mapped = this.currentTypeMap.get(name)!;
            if (mapped.kind === "BasicType" && mapped.name === name) {
              return true;
            }
          }
        }
        return false;
      });
    }

    // 1. Mangle Name
    const argNames = genericArgs
      .map((arg) => {
        // Use lightweight mangling to avoid recursive resolveType for generic args
        return this.mangleType(arg);
      })
      .join("_");

    const mangledName = `${baseStruct.name}_${argNames}`;

    // Check if we are instantiating with the generic params themselves (Box<T> -> Box<T>)
    if (
      baseStruct.genericParams &&
      baseStruct.genericParams.length === genericArgs.length
    ) {
      const isIdentity = baseStruct.genericParams.every((p, i) => {
        const arg = genericArgs[i]!;
        return (
          arg.kind === "BasicType" &&
          (arg as AST.BasicTypeNode).name === p.name.trim()
        );
      });

      if (isIdentity) {
        return `%struct.${mangledName}`;
      }
    }

    // 2. Check if exists
    if (this.generatedStructs.has(mangledName)) {
      return `%struct.${mangledName}`;
    }

    if (skipGeneration) {
      this.skippedStructs.add(mangledName);
      return `%struct.${mangledName}`;
    }

    // Also check structMap in case it was created but not yet generated (e.g. recursive reference)
    if (this.structMap.has(mangledName)) {
      return `%struct.${mangledName}`;
    }

    // 3. Check if we're already resolving this type (prevent re-entry during method generation)
    if (this.resolvingMonomorphizedTypes.has(mangledName)) {
      // We're already resolving this type - just return the struct name
      // The struct definition and methods will be completed by the outer call
      return `%struct.${mangledName}`;
    }

    // 4. Mark that we're resolving this type to prevent re-entry
    this.resolvingMonomorphizedTypes.add(mangledName);

    try {
      // 5. Instantiate
      // Create a map of generic param names to concrete argument types
      const typeMap = new Map<string, AST.TypeNode>();
      if (baseStruct.genericParams.length !== genericArgs.length) {
        throw this.createError(
          `Generic argument mismatch for struct '${baseStruct.name}'`,
          undefined,
          `Expected ${baseStruct.genericParams.length} generic arguments, but got ${genericArgs.length}`,
        );
      }

      for (let i = 0; i < baseStruct.genericParams.length; i++) {
        typeMap.set(baseStruct.genericParams[i]!.name.trim(), genericArgs[i]!);
      }

      // Clone and substitute fields
      const instantiatedMembers = baseStruct.members.map((m) => {
        if (m.kind === "StructField") {
          const field = m as AST.StructField;
          return {
            ...field,
            type: this.substituteType(field.type, typeMap),
            resolvedType: undefined, // Force re-resolution
            typeMap,
          } as AST.StructField;
        } else if (m.kind === "FunctionDecl") {
          const func = m as AST.FunctionDecl;
          // Substitute function type for vtable generation
          let newResolvedType = func.resolvedType;
          if (newResolvedType && newResolvedType.kind === "FunctionType") {
            newResolvedType = this.substituteType(
              newResolvedType,
              typeMap,
            ) as AST.FunctionTypeNode;
          }
          return {
            ...func,
            resolvedType: newResolvedType,
            returnType: this.substituteType(func.returnType, typeMap),
            params: func.params.map((p) => {
              const newParam = {
                ...p,
                type: this.substituteType(p.type, typeMap),
              };
              return newParam;
            }),
          } as AST.FunctionDecl;
        }
        return m;
      });

      // Handle generic inheritance
      let instantiatedInheritanceList: AST.TypeNode[] = [];
      if (baseStruct.inheritanceList) {
        instantiatedInheritanceList = baseStruct.inheritanceList.map((t) => {
          let instantiatedType = this.substituteType(t, typeMap);

          // Force resolution of parent to ensure it exists and we get the concrete name
          // Only for BasicType (structs/specs)
          if (instantiatedType.kind === "BasicType") {
            const parentLlvmType = this.resolveType(instantiatedType);
            let parentName = parentLlvmType;
            if (parentName.startsWith("%struct.")) {
              parentName = parentName.substring(8);
              while (parentName.endsWith("*"))
                parentName = parentName.slice(0, -1);
            }
            instantiatedType = {
              ...instantiatedType,
              name: parentName,
              genericArgs: [], // Cleared because name is now concrete
              resolvedDeclaration: undefined, // Clear resolved declaration to force name lookup
            };
          }
          return instantiatedType;
        });
      }

      const instantiatedStruct: AST.StructDecl = {
        ...baseStruct,
        name: mangledName, // Update name
        genericParams: [], // Concrete now
        inheritanceList: instantiatedInheritanceList,
        members: instantiatedMembers, // Include all members so findMethodOwner can find them
      };

      // Register in structMap so it can be looked up by name (for inheritance etc)
      this.structMap.set(mangledName, instantiatedStruct);

      // Compute vtable layout for the instantiated struct
      // This handles generic inheritance correctly by resolving parent types
      this.computeVTableLayout(mangledName);

      this.generateStruct(instantiatedStruct, mangledName);

      // Queue generation of methods
      const methods = baseStruct.members.filter(
        (m) => m.kind === "FunctionDecl",
      ) as AST.FunctionDecl[];
      for (const method of methods) {
        // If method is not generic, generate it now (monomorphized)
        if (method.genericParams.length === 0) {
          // Pre-calculate mangled name and mark as defined to prevent redundant declarations
          const funcType = method.resolvedType as AST.FunctionTypeNode;
          const substitutedFuncType = this.substituteType(
            funcType,
            typeMap,
          ) as AST.FunctionTypeNode;
          const methodName = `${mangledName}_${method.name}`;
          const fullMangledName = this.getMangledName(
            methodName,
            substitutedFuncType,
            false,
            [],
          );
          // this.definedFunctions.add(fullMangledName); // Removed to allow generation

          this.pendingGenerations.push(() => {
            const oldName = method.name;
            method.name = `${mangledName}_${method.name}`;
            const prevMap = this.currentTypeMap;
            this.currentTypeMap = typeMap;

            // We pass instantiatedStruct as parent to generateFunction
            // This correctly sets up "this" type and destructor chaining
            this.generateFunction(method, instantiatedStruct);

            this.currentTypeMap = prevMap;
            method.name = oldName;
          });
        }
        // If method IS generic, we don't generate it here.
        // It will be generated when called, via resolveMonomorphizedFunction.
      }

      // Mark as generated (even though methods are pending) to prevent re-entry
      // The struct definition itself is complete, methods will be generated from pendingGenerations
      this.generatedStructs.add(mangledName);

      return `%struct.${mangledName}`;
    } finally {
      // Always remove from tracking set when done
      this.resolvingMonomorphizedTypes.delete(mangledName);
    }
  }

  protected instantiateGenericEnum(
    enumName: string,
    genericArgs: AST.TypeNode[],
    skipGeneration?: boolean,
  ): string {
    // Auto-detect placeholders if skipGeneration is not provided
    if (skipGeneration === undefined) {
      skipGeneration = genericArgs.some((arg) => {
        if (arg.kind === "BasicType") {
          const name = (arg as AST.BasicTypeNode).name;
          if (this.currentTypeMap.has(name)) {
            const mapped = this.currentTypeMap.get(name)!;
            if (mapped.kind === "BasicType" && mapped.name === name) {
              return true;
            } else {
              if (name === "T") {
                console.log(
                  `[DEBUG] instantiateGenericEnum: T in map but not placeholder. mapped.kind=${mapped.kind}, mapped.name=${
                    mapped.kind === "BasicType" ? mapped.name : ""
                  }`,
                );
              }
            }
          } else {
            // Log when T is present but not in map
            if (name === "T") {
              console.trace("Trace for T leak");
            }
          }
        }
        return false;
      });
    }

    // Create mangled name for the instantiated enum
    const mangledName = this.mangleGenericTypeName(enumName, genericArgs);

    // Check if already generated
    if (this.generatedEnums.has(mangledName)) {
      return mangledName;
    }

    if (skipGeneration) {
      return mangledName;
    }

    this.generatedEnums.add(mangledName);

    // Get the generic enum declaration
    const decl = this.enumDeclMap.get(enumName);
    if (!decl) {
      const loc =
        genericArgs.length > 0
          ? genericArgs[0]!.location
          : {
              file: "unknown",
              startLine: 0,
              startColumn: 0,
              endLine: 0,
              endColumn: 0,
            };
      throw new CompilerError(
        `Generic enum ${enumName} not found`,
        "Ensure the enum is defined.",
        loc,
      );
    }

    // Check if we are instantiating with the generic params themselves (Option<T> -> Option<T>)
    if (
      decl.genericParams &&
      decl.genericParams.length === genericArgs.length
    ) {
      const isIdentity = decl.genericParams.every((p, i) => {
        const arg = genericArgs[i]!;
        return (
          arg.kind === "BasicType" &&
          (arg as AST.BasicTypeNode).name === p.name.trim()
        );
      });

      if (isIdentity) {
        return mangledName;
      }
    }

    // Build type substitution map
    const typeMap = new Map<string, AST.TypeNode>();
    if (decl.genericParams) {
      for (
        let i = 0;
        i < decl.genericParams.length && i < genericArgs.length;
        i++
      ) {
        // Ensure generic args have resolvedDeclaration for proper type resolution
        const resolvedArg = this.ensureResolvedDeclaration(genericArgs[i]!);
        typeMap.set(decl.genericParams[i]!.name.trim(), resolvedArg);
      }
    }

    // Create a copy of the enum with substituted types
    const instantiatedDecl: AST.EnumDecl = {
      ...decl,
      name: mangledName,
      genericParams: [], // Instantiated enums have no generic params
      variants: decl.variants.map((v) => ({
        ...v,
        dataType: v.dataType
          ? v.dataType.kind === "EnumVariantTuple"
            ? {
                ...v.dataType,
                types: v.dataType.types.map((t) => {
                  const substituted = this.substituteType(t, typeMap);
                  // Ensure substituted types have resolvedDeclaration for backend lookups
                  return this.ensureResolvedDeclaration(substituted);
                }),
              }
            : v.dataType.kind === "EnumVariantStruct"
              ? {
                  ...v.dataType,
                  fields: v.dataType.fields.map((f) => ({
                    name: f.name,
                    type: this.ensureResolvedDeclaration(
                      this.substituteType(f.type, typeMap),
                    ),
                  })),
                }
              : v.dataType
          : undefined,
      })),
    };

    // Generate the instantiated enum
    const prevMap = this.currentTypeMap;
    this.currentTypeMap = typeMap;
    this.generateEnum(instantiatedDecl, mangledName);

    // Generate methods for instantiated enum
    if (decl.methods) {
      for (const method of decl.methods) {
        const mangledMethodName = `${mangledName}_${method.name}`;

        this.pendingGenerations.push(() => {
          const innerPrevMap = this.currentTypeMap;
          this.currentTypeMap = typeMap;

          const oldName = method.name;
          method.name = mangledMethodName;

          // We pass instantiatedDecl as parent so 'this' resolves to the concrete enum
          this.generateFunction(method, instantiatedDecl);

          method.name = oldName;
          this.currentTypeMap = innerPrevMap;
        });
      }
    }

    this.currentTypeMap = prevMap;

    return mangledName;
  }

  /**
   * Ensure a type node has resolvedDeclaration attached for backend lookups.
   * If the type is a BasicType with a name that should resolve to a struct/enum,
   * but doesn't have resolvedDeclaration, look it up and attach it.
   */
  protected ensureResolvedDeclaration(type: AST.TypeNode): AST.TypeNode {
    if (type.kind !== "BasicType") return type;

    const basicType = type as AST.BasicTypeNode;

    // Already has resolvedDeclaration, no need to look up
    if (basicType.resolvedDeclaration) return type;

    // Try to find the declaration in our maps
    let decl =
      this.structMap.get(basicType.name) ||
      this.enumDeclMap.get(basicType.name);

    // Handle qualified names (e.g., "std.Option" -> look for "Option")
    if (!decl && basicType.name.includes(".")) {
      const parts = basicType.name.split(".");
      const simpleName = parts[parts.length - 1]!;
      decl = this.structMap.get(simpleName) || this.enumDeclMap.get(simpleName);
    }

    if (decl) {
      // Attach the resolved declaration and return a new node
      return {
        ...basicType,
        resolvedDeclaration: decl,
      };
    }

    // Not found, return as-is
    return type;
  }

  protected mangleGenericTypeName(
    baseName: string,
    genericArgs: AST.TypeNode[],
  ): string {
    if (genericArgs.length === 0) return baseName;

    const argNames = genericArgs.map((arg) => this.mangleType(arg)).join("_");

    return `${baseName}_${argNames}`;
  }

  protected resolveMonomorphizedFunction(
    decl: AST.FunctionDecl,
    genericArgs: AST.TypeNode[],
    contextMap?: Map<string, AST.TypeNode>,
    namePrefix?: string,
  ): string {
    // 1. Substitute generic args in case they are also generic
    const concreteArgs = genericArgs.map((arg) =>
      this.substituteType(arg, this.currentTypeMap),
    );

    // 2. Create Instance Map
    const instanceMap = new Map<string, AST.TypeNode>(this.currentTypeMap);
    if (contextMap) {
      for (const [k, v] of contextMap) {
        instanceMap.set(k, v);
      }
    }
    if (decl.genericParams.length !== concreteArgs.length) {
      throw this.createError(
        `Generic argument mismatch for function '${decl.name}'`,
        decl,
        `Expected ${decl.genericParams.length} generic arguments, but got ${concreteArgs.length}`,
      );
    }
    for (let i = 0; i < decl.genericParams.length; i++) {
      instanceMap.set(decl.genericParams[i]!.name, concreteArgs[i]!);
    }

    // 3. Substitute Function Type to get correct mangled name
    const substitutedType = this.substituteType(
      decl.resolvedType as AST.FunctionTypeNode,
      instanceMap,
    ) as AST.FunctionTypeNode;

    // 4. Calculate Mangled Name
    let mangledName = this.getMangledName(
      decl.name,
      substitutedType,
      false,
      concreteArgs,
    );
    if (namePrefix) {
      mangledName = `${namePrefix}_${this.getMangledName(
        decl.name,
        substitutedType,
        false,
        concreteArgs,
      )}`;
    }

    // 5. Check Cache
    if (this.declaredFunctions.has(mangledName)) {
      return mangledName;
    }
    this.declaredFunctions.add(mangledName);

    // 6. Queue Generation
    this.pendingGenerations.push(() => {
      // Create a specialized declaration
      const newDecl: AST.FunctionDecl = {
        ...decl,
        name: decl.name,
        resolvedType: substitutedType,
      };

      if (namePrefix) {
        newDecl.name = `${namePrefix}_${decl.name}`;
      }

      const prevMap = this.currentTypeMap;
      this.currentTypeMap = instanceMap;

      this.generateFunction(newDecl);

      this.currentTypeMap = prevMap;
    });

    return mangledName;
  }

  protected substituteType(
    type: AST.TypeNode,
    map: Map<string, AST.TypeNode>,
  ): AST.TypeNode {
    return TypeSubstitution.substituteType(type, map);
  }

  protected emitParentDestroy(
    parentStruct: AST.StructDecl,
    currentMethod: AST.FunctionDecl,
  ) {
    // Find parent type
    let parentType: AST.TypeNode | undefined;
    if (parentStruct.inheritanceList) {
      for (const t of parentStruct.inheritanceList) {
        if (t.kind === "BasicType") {
          // Check if it is a struct (skip Specs)
          if (
            this.structMap.has(t.name) ||
            (t.resolvedDeclaration &&
              t.resolvedDeclaration.kind === "StructDecl")
          ) {
            parentType = t;
            break;
          }
        }
      }
    }

    if (!parentType) return;

    // Resolve parent type name
    const parentTypeName = this.resolveType(parentType);

    // Extract struct name
    let structName = parentTypeName;
    if (structName.startsWith("%struct.")) {
      structName = structName.substring(8);
    }
    while (structName.endsWith("*")) {
      structName = structName.slice(0, -1);
    }

    const destroyMethodName = `${structName}_destroy`;

    // Get 'this' parameter (first parameter)
    const thisParamName = currentMethod.params[0]!.name;
    const thisPtrAddr = this.localPointers.get(thisParamName);

    if (!thisPtrAddr) {
      // Should not happen if generateFunction set it up
      throw new CompilerError(
        "Could not find 'this' pointer for parent destroy call",
        "Internal compiler error.",
        currentMethod.location,
      );
    }

    const thisType = this.resolveType(
      (currentMethod.resolvedType as AST.FunctionTypeNode).paramTypes[0]!,
    );
    const thisPtr = this.newRegister();
    this.emit(`  ${thisPtr} = load ${thisType}, ${thisType}* ${thisPtrAddr}`);

    // Bitcast to parent pointer type
    const parentPtrType = parentTypeName + "*";
    const casted = this.newRegister();
    this.emit(
      `  ${casted} = bitcast ${thisType} ${thisPtr} to ${parentPtrType}`,
    );

    // Call parent destroy
    let callName = destroyMethodName;
    let shouldCall = true;

    // Try to find the parent struct and its destroy method to get the correct mangled name
    const parentDecl = this.structMap.get(structName);
    if (parentDecl) {
      const destroyMethod = parentDecl.members.find(
        (m) => m.kind === "FunctionDecl" && m.name === "destroy",
      ) as AST.FunctionDecl | undefined;

      if (!destroyMethod) {
        shouldCall = false;
      } else if (
        destroyMethod.resolvedType &&
        destroyMethod.resolvedType.kind === "FunctionType"
      ) {
        callName = this.getMangledName(
          destroyMethodName,
          destroyMethod.resolvedType,
        );
      }
    }

    if (shouldCall) {
      this.emit(`  call void @${callName}(${parentPtrType} ${casted})`);
    }
  }
}
