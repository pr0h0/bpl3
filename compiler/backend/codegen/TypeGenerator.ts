import type { AST } from "../..";
import { CompilerError } from "../../common/CompilerError";
import { codeGenLog } from "../../common/Logger";
import { StructEnumGenerator } from "./StructEnumGenerator";
import { TypeSubstitution } from "../../middleend/TypeUtils";
import {
  isFixedArrayTypeNode as isLoweredFixedArrayTypeNode,
  isSliceTypeNode as isLoweredSliceTypeNode,
} from "../../middleend/lowering/ImplicitConversions";
import {
  isSigned as isSignedTypeName,
  isIntegerType as isLLVMIntegerType,
} from "./utils";

/**
 * DWARF basic type information: [displayName, sizeInBits, encoding]
 * Encoding values: 2=boolean, 4=float, 5=signed, 6=signed_char, 7=unsigned, 8=unsigned_char
 */
const DWARF_BASIC_TYPES: Record<string, [string, number, number]> = {
  i32: ["int", 32, 5],
  int: ["int", 32, 5],
  u32: ["unsigned int", 32, 7],
  uint: ["unsigned int", 32, 7],
  i64: ["long", 64, 5],
  long: ["long", 64, 5],
  u64: ["unsigned long", 64, 7],
  ulong: ["unsigned long", 64, 7],
  i16: ["short", 16, 5],
  short: ["short", 16, 5],
  u16: ["unsigned short", 16, 7],
  ushort: ["unsigned short", 16, 7],
  i8: ["signed char", 8, 6],
  char: ["char", 8, 8],
  u8: ["unsigned char", 8, 8],
  uchar: ["unsigned char", 8, 8],
  i1: ["bool", 8, 2],
  bool: ["bool", 8, 2],
  double: ["double", 64, 4],
  float: ["float", 64, 4],
};

/**
 * Handles AST TypeNode to LLVM type conversions.
 *
 * Provides type resolution, name mangling, function type generation,
 * and DWARF debug type information emission.
 *
 * @extends StructEnumGenerator
 * @see ARCHITECTURE.md for the full inheritance hierarchy
 */
export abstract class TypeGenerator extends StructEnumGenerator {
  protected abstract allocateStack(name: string, type: string): string;

  protected applyArrayDimensions(
    llvmType: string,
    dimensions?: (number | null)[],
  ): string {
    if (!dimensions || dimensions.length === 0) return llvmType;
    const [outer, ...innerDimensions] = dimensions;
    const innerType = this.applyArrayDimensions(llvmType, innerDimensions);
    if (outer === null) return `{ ${innerType}*, i64 }`;
    return `[${outer} x ${innerType}]`;
  }

  protected isSliceTypeNode(
    type: AST.TypeNode | undefined,
  ): type is AST.BasicTypeNode {
    return isLoweredSliceTypeNode(type);
  }

  protected isFixedArrayTypeNode(
    type: AST.TypeNode | undefined,
  ): type is AST.BasicTypeNode {
    return isLoweredFixedArrayTypeNode(type);
  }

  protected getArrayElementTypeNode(
    type: AST.BasicTypeNode,
  ): AST.BasicTypeNode {
    return {
      ...type,
      arrayDimensions: type.arrayDimensions.slice(1),
    };
  }

  protected emitSliceFromArrayAddress(
    arrayAddr: string,
    sourceArrayType: AST.BasicTypeNode,
    destSliceType: AST.BasicTypeNode,
  ): string {
    const length = sourceArrayType.arrayDimensions[0];
    if (length === null || length === undefined) {
      throw new CompilerError(
        "Cannot build slice from dynamic array",
        "Slice conversion requires a fixed-size source array.",
        sourceArrayType.location,
      );
    }

    const sourceType = this.resolveType(sourceArrayType);
    const elementType = this.resolveType(
      this.getArrayElementTypeNode(sourceArrayType),
    );
    const destType = this.resolveType(destSliceType);

    const dataPtr = this.newRegister();
    this.emit(
      `  ${dataPtr} = getelementptr inbounds ${sourceType}, ${sourceType}* ${arrayAddr}, i64 0, i64 0`,
    );

    const withData = this.newRegister();
    this.emit(
      `  ${withData} = insertvalue ${destType} undef, ${elementType}* ${dataPtr}, 0`,
    );

    const withLength = this.newRegister();
    this.emit(
      `  ${withLength} = insertvalue ${destType} ${withData}, i64 ${length}, 1`,
    );
    return withLength;
  }

  protected emitPointerFromArrayAddress(
    arrayAddr: string,
    sourceArrayType: AST.BasicTypeNode,
  ): string {
    const sourceType = this.resolveType(sourceArrayType);
    const elementPtr = this.newRegister();
    this.emit(
      `  ${elementPtr} = getelementptr inbounds ${sourceType}, ${sourceType}* ${arrayAddr}, i64 0, i64 0`,
    );
    return elementPtr;
  }

  protected emitSliceFromArrayValue(
    val: string,
    sourceArrayType: AST.BasicTypeNode,
    destSliceType: AST.BasicTypeNode,
  ): string {
    const sourceType = this.resolveType(sourceArrayType);
    const spill = this.allocateStack(
      `slice_array_${this.labelCount++}`,
      sourceType,
    );
    this.emit(`  store ${sourceType} ${val}, ${sourceType}* ${spill}`);
    return this.emitSliceFromArrayAddress(
      spill,
      sourceArrayType,
      destSliceType,
    );
  }

  protected emitPointerFromArrayValue(
    val: string,
    sourceArrayType: AST.BasicTypeNode,
  ): string {
    const sourceType = this.resolveType(sourceArrayType);
    const spill = this.allocateStack(
      `array_decay_${this.labelCount++}`,
      sourceType,
    );
    this.emit(`  store ${sourceType} ${val}, ${sourceType}* ${spill}`);
    return this.emitPointerFromArrayAddress(spill, sourceArrayType);
  }

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

  protected getDwarfTypeId(type: AST.TypeNode, depth: number = 0): number {
    if (!this.generateDwarf) return 0;
    if (depth > 50) {
      // Avoid infinite recursion for deeply nested generic types
      return 0; // void
    }

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
          const pointeeId = this.getDwarfTypeId(pointeeType, depth + 1);
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
            return this.getDwarfTypeId(substituted, depth + 1);
          }
        }

        // Non-generic alias or generic alias used without args
        return this.getDwarfTypeId(aliasDecl.type, depth + 1);
      }

      primitiveName = type.name;
    }

    // Check primitive type using lookup table
    if (primitiveName) {
      const dwarfInfo = DWARF_BASIC_TYPES[primitiveName];
      if (dwarfInfo) {
        return this.debugInfoGenerator.createBasicType(
          dwarfInfo[0],
          dwarfInfo[1],
          dwarfInfo[2],
        );
      }
      if (primitiveName === "void") {
        return 0;
      }
    }

    // Fallback using resolvedName (for non-BasicTypes or unresolved aliases)
    const resolvedDwarfInfo = DWARF_BASIC_TYPES[resolvedName];
    if (resolvedDwarfInfo) {
      return this.debugInfoGenerator.createBasicType(
        resolvedDwarfInfo[0],
        resolvedDwarfInfo[1],
        resolvedDwarfInfo[2],
      );
    }
    if (resolvedName === "void") {
      return 0;
    }

    // Function Types (Raw Pointers)
    if (type.kind === "FunctionType") {
      // Treat as void* for now in debug info
      return this.debugInfoGenerator.createPointerType(0);
    }

    // Lambda Types (Closures)
    if (type.kind === "LambdaType") {
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

      const lambdaType = type as AST.LambdaTypeNode;
      const retName = this.resolveType(lambdaType.returnType);
      const paramNames = lambdaType.paramTypes
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

        const elementTypeId = this.getDwarfTypeId(elementTypeNode, depth + 1);
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

      const elementTypeId = this.getDwarfTypeId(elementTypeNode, depth + 1);
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
          const fieldTypeId = this.getDwarfTypeId(field.type, depth + 1);
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
        const fieldTypeId = this.getDwarfTypeId(fieldType, depth + 1);
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
        }
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

    // Built-in Exceptions (Must match runtime.ll)
    if (typeName === "%struct.NullAccessError") return 3266311688;
    if (typeName === "%struct.StackOverflowError") return 2060636097;
    if (typeName === "%struct.DivisionByZeroError") return 3968367666;
    if (typeName === "%struct.IndexOutOfBoundsError") return 2320298516;

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

    const resultFields = [...fields];
    // VTable injection removed for POD structs

    return resultFields.concat(currentFields);
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
          for (const d of type.arrayDimensions) suffix += `_arr_${d}_`;

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
      for (const d of type.arrayDimensions) suffix += `_arr_${d}_`;

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
            const parentLlvmType = this.resolveMonomorphizedType(
              baseDecl,
              parent.genericArgs,
            );
            let pName = parentLlvmType;
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

    // Implicit inheritance from Type
    if (structName !== "Type") {
      const typeDecl = this.structMap.get("Type");
      if (typeDecl) {
        // Check Type members directly
        for (const m of typeDecl.members) {
          if (m.kind === "FunctionDecl") {
            const funcDecl = m as AST.FunctionDecl;
            if (funcDecl.name === methodName) {
              return typeDecl;
            }
          }
        }
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

  protected getEffectiveModifiers(type: AST.TypeNode): {
    pointerDepth: number;
    arrayDimensions: (number | null)[];
  } {
    if (type.kind === "BasicType") {
      const basic = type as AST.BasicTypeNode;
      let ptr = basic.pointerDepth;
      let arr = [...basic.arrayDimensions];

      if (this.typeAliasMap.has(basic.name)) {
        const alias = this.typeAliasMap.get(basic.name)!;
        // Only recurse if not generic, or if we can handle it.
        // For now, assume non-generic recursion is safe.
        if (!alias.genericParams || alias.genericParams.length === 0) {
          const inner = this.getEffectiveModifiers(alias.type);
          ptr += inner.pointerDepth;
          arr = [...inner.arrayDimensions, ...arr];
        }
      }
      return { pointerDepth: ptr, arrayDimensions: arr };
    }
    if ("arrayDimensions" in type) {
      return {
        pointerDepth: 0,
        arrayDimensions: [...((type as any).arrayDimensions || [])],
      };
    }
    return { pointerDepth: 0, arrayDimensions: [] };
  }

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

        // Check for variableDeclaration (from & operator)
        if (basicType.variableDeclaration) {
          const decl = basicType.variableDeclaration;
          let declType: AST.TypeNode | undefined;
          if (decl.kind === "VariableDecl") {
            declType = decl.typeAnnotation;
          } else if (decl.kind === "Parameter") {
            declType = decl.type;
          }

          if (!declType) {
            declType = decl.resolvedType!;
          }

          const baseTypeStr = this.resolveType(declType);

          const declMods = this.getEffectiveModifiers(declType);
          const totalMods = {
            pointerDepth: basicType.pointerDepth,
            arrayDimensions: basicType.arrayDimensions,
          };

          const ptrDiff = totalMods.pointerDepth - declMods.pointerDepth;
          const arrDiff = totalMods.arrayDimensions.slice(
            declMods.arrayDimensions.length,
          );

          let llvmType = baseTypeStr;
          if (ptrDiff > 0) {
            for (let i = 0; i < ptrDiff; i++) {
              llvmType += "*";
            }
          } else if (ptrDiff < 0) {
            for (let i = 0; i < -ptrDiff; i++) {
              if (llvmType.endsWith("*")) {
                llvmType = llvmType.slice(0, -1);
              }
            }
          }
          return this.applyArrayDimensions(llvmType, arrDiff);
        }

        // Check for aliasDeclaration (from TypeChecker) to preserve alias structure (e.g. pointer to array)
        if (
          basicType.aliasDeclaration &&
          (!basicType.aliasDeclaration.genericParams ||
            basicType.aliasDeclaration.genericParams.length === 0)
        ) {
          const aliasDecl = basicType.aliasDeclaration;
          // Resolve the alias base type
          const baseTypeStr = this.resolveType(aliasDecl.type);

          // Calculate modifier diff
          const aliasMods = this.getEffectiveModifiers(aliasDecl.type);
          // basicType is the resolved/flattened type, so its modifiers include the alias modifiers
          const totalMods = {
            pointerDepth: basicType.pointerDepth,
            arrayDimensions: basicType.arrayDimensions,
          };

          const ptrDiff = totalMods.pointerDepth - aliasMods.pointerDepth;
          // Array dimensions are appended, so we slice off the prefix
          const arrDiff = totalMods.arrayDimensions.slice(
            aliasMods.arrayDimensions.length,
          );

          // Apply diff to baseTypeStr
          let llvmType = baseTypeStr;
          if (ptrDiff > 0) {
            for (let i = 0; i < ptrDiff; i++) {
              llvmType += "*";
            }
          } else if (ptrDiff < 0) {
            for (let i = 0; i < -ptrDiff; i++) {
              if (llvmType.endsWith("*")) {
                llvmType = llvmType.slice(0, -1);
              }
            }
          }
          return this.applyArrayDimensions(llvmType, arrDiff);
        }

        let llvmType = "";

        // Check currentTypeMap for generic substitutions
        if (this.currentTypeMap.has(basicType.name)) {
          const mapped = this.currentTypeMap.get(basicType.name)!;

          // Prevent infinite recursion if mapped type is same as current type (T -> T)
          if (mapped.kind === "BasicType" && mapped.name === basicType.name) {
            // Fallback to struct name if T maps to T (generic template context)
            let fallbackLlvmType = `%struct.${basicType.name}`;
            for (let i = 0; i < basicType.pointerDepth; i++) {
              fallbackLlvmType += "*";
            }
            return this.applyArrayDimensions(
              fallbackLlvmType,
              basicType.arrayDimensions,
            );
          }

          let mappedLlvmType = this.resolveType(mapped);

          for (let i = 0; i < basicType.pointerDepth; i++) {
            mappedLlvmType += "*";
          }

          return this.applyArrayDimensions(
            mappedLlvmType,
            basicType.arrayDimensions,
          );
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
              let substitutedLlvmType = this.resolveType(substituted);

              for (let i = 0; i < basicType.pointerDepth; i++) {
                substitutedLlvmType += "*";
              }
              return this.applyArrayDimensions(
                substitutedLlvmType,
                basicType.arrayDimensions,
              );
            }
          }

          // Non-generic alias or generic alias used without args (if allowed/resolved)
          let aliasLlvmType = this.resolveType(aliasDecl.type);
          for (let i = 0; i < basicType.pointerDepth; i++) {
            aliasLlvmType += "*";
          }
          return this.applyArrayDimensions(
            aliasLlvmType,
            basicType.arrayDimensions,
          );
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

          // Check for variableDeclaration (from & operator)
          if (basicType.variableDeclaration) {
            codeGenLog.debug("Resolving VariableDecl/Parameter type...");
            const decl = basicType.variableDeclaration as
              | AST.VariableDecl
              | AST.Parameter;
            let declType: AST.TypeNode | undefined;
            if (decl.kind === "VariableDecl") {
              declType = decl.typeAnnotation;
            } else if (decl.kind === "Parameter") {
              declType = decl.type;
            }

            if (!declType) {
              // @ts-ignore
              declType = decl.resolvedType!;
            }

            const baseTypeStr = this.resolveType(declType!);
            codeGenLog.debug("Base type: " + baseTypeStr);

            const declMods = this.getEffectiveModifiers(declType!);
            const totalMods = {
              pointerDepth: basicType.pointerDepth,
              arrayDimensions: basicType.arrayDimensions,
            };

            const ptrDiff = totalMods.pointerDepth - declMods.pointerDepth;
            const arrDiff = totalMods.arrayDimensions.slice(
              declMods.arrayDimensions.length,
            );
            codeGenLog.debug(`Diff: ptr=${ptrDiff}, arr=${arrDiff}`);

            let varDeclLlvmType = baseTypeStr;
            for (let i = 0; i < ptrDiff; i++) {
              varDeclLlvmType += "*";
            }
            codeGenLog.debug("Result: " + varDeclLlvmType);
            return this.applyArrayDimensions(varDeclLlvmType, arrDiff);
          }

          // FALLBACK: Lookup by name (for types not resolved by TypeChecker)
          if (!structDecl) structDecl = this.structMap.get(basicType.name);
          if (!enumDecl) enumDecl = this.enumDeclMap.get(basicType.name);
          if (!specDecl) specDecl = this.specMap.get(basicType.name);

          // If not found and name contains a dot (qualified name), try stripping namespace
          if (
            !structDecl &&
            !enumDecl &&
            !specDecl &&
            basicType.name.includes(".")
          ) {
            const simpleName = basicType.name.split(".").pop()!;
            if (!structDecl) structDecl = this.structMap.get(simpleName);
            if (!enumDecl) enumDecl = this.enumDeclMap.get(simpleName);
            if (!specDecl) specDecl = this.specMap.get(simpleName);
          }

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
            // If basicType.name === "T" and we have a type map, we could handle it here
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
            case "f64":
              llvmType = "double";
              break;
            case "f32":
              llvmType = "float";
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
              } else if (basicType.name.includes(".")) {
                // If not found and name contains a dot (qualified name), try stripping namespace
                const simpleName = basicType.name.split(".").pop()!;
                if (this.enumVariants.has(simpleName)) {
                  llvmType = `%enum.${simpleName}`;
                } else if (this.enumDeclMap.has(simpleName)) {
                  llvmType = `%enum.${simpleName}`;
                } else if (this.specMap.has(simpleName)) {
                  llvmType = "{ i8*, i8* }";
                } else if (this.structMap.has(simpleName)) {
                  llvmType = `%struct.${simpleName}`;
                } else {
                  llvmType = `%struct.${basicType.name}`;
                }
              } else {
                llvmType = `%struct.${basicType.name}`;
              }

              break;
          }
        }

        for (let i = 0; i < basicType.pointerDepth; i++) {
          llvmType += "*";
        }

        return this.applyArrayDimensions(llvmType, basicType.arrayDimensions);
      } else if (type.kind === "TupleType") {
        const tupleType = type as AST.TupleTypeNode;
        // Represent tuples as LLVM structs: { type0, type1, ... }
        const elementTypes = tupleType.types.map((t) => this.resolveType(t));
        let llvmType = `{ ${elementTypes.join(", ")} }`;
        return this.applyArrayDimensions(llvmType, tupleType.arrayDimensions);
      } else if (type.kind === "FunctionType") {
        const funcType = type as AST.FunctionTypeNode;
        const ret = this.resolveType(funcType.returnType);
        const params = funcType.paramTypes
          .map((p) => this.resolveType(p))
          .join(", ");

        // Raw function pointer: return_type (params)*
        let llvmType = `${ret} (${params})*`;

        return this.applyArrayDimensions(llvmType, funcType.arrayDimensions);
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
        let llvmType = `{ ${ret} (i8*${paramsStr})*, i8* }`;
        return this.applyArrayDimensions(llvmType, lambdaType.arrayDimensions);
      }
      return "void";
    } finally {
      this.resolveTypeDepth--;
    }
  }

  protected isSigned(type: AST.TypeNode): boolean {
    if (type.kind === "BasicType") {
      return isSignedTypeName((type as AST.BasicTypeNode).name);
    }
    return false;
  }

  protected isIntegerType(type: string): boolean {
    return isLLVMIntegerType(type);
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
          const _fullMangledName = this.getMangledName(
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
            }
            if (name === "T") {
              codeGenLog.debug(
                `instantiateGenericEnum: T in map but not placeholder`,
                {
                  mappedKind: mapped.kind,
                  mappedName: mapped.kind === "BasicType" ? mapped.name : "",
                },
              );
            }
          } else if (name === "T") {
            // Log when T is present but not in map
            codeGenLog.debug("T not in map - possible leak");
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
        dataType: this.substituteEnumVariantDataType(v.dataType, typeMap),
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
   * Substitute types in enum variant data type (tuple or struct).
   * Extracted to avoid nested ternary expressions.
   */
  protected substituteEnumVariantDataType(
    dataType: AST.EnumVariantData | undefined,
    typeMap: Map<string, AST.TypeNode>,
  ): AST.EnumVariantData | undefined {
    if (!dataType) return undefined;

    if (dataType.kind === "EnumVariantTuple") {
      return {
        ...dataType,
        types: dataType.types.map((t) => {
          const substituted = this.substituteType(t, typeMap);
          return this.ensureResolvedDeclaration(substituted);
        }),
      };
    }

    if (dataType.kind === "EnumVariantStruct") {
      return {
        ...dataType,
        fields: dataType.fields.map((f) => ({
          name: f.name,
          type: this.ensureResolvedDeclaration(
            this.substituteType(f.type, typeMap),
          ),
        })),
      };
    }

    // EnumVariantUnit - no types to substitute
    return dataType;
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
