import * as AST from "../common/AST";
import { TypeUtils } from "./TypeUtils";
import { TYPE_ALIASES } from "./BuiltinTypes";

export class RTTI {
  private static typeIds = new Map<string, bigint>();

  static getTypeId(type: AST.TypeNode): bigint {
    const canonicalType = this.canonicalizeType(type);
    const typeName = TypeUtils.typeToString(canonicalType);

    if (this.typeIds.has(typeName)) {
      return this.typeIds.get(typeName)!;
    }

    const id = this.fnv1a(typeName);
    this.typeIds.set(typeName, id);
    return id;
  }

  static getTypeIdFromName(typeName: string): bigint {
    if (this.typeIds.has(typeName)) {
      return this.typeIds.get(typeName)!;
    }
    const id = this.fnv1a(typeName);
    this.typeIds.set(typeName, id);
    return id;
  }

  private static canonicalizeType(type: AST.TypeNode): AST.TypeNode {
    if (type.kind === "BasicType") {
      let name = type.name;
      let pointerDepth = type.pointerDepth;

      // Special case for string -> i8*
      if (name === "string" && pointerDepth === 0) {
        name = "i8";
        pointerDepth = 1;
      }

      // Check aliases
      for (const [alias, target] of TYPE_ALIASES) {
        if (name === alias) {
          name = target;
          break;
        }
      }

      // Recursively canonicalize generic args
      let genericArgs = type.genericArgs;
      if (genericArgs.length > 0) {
        genericArgs = genericArgs.map((arg) => this.canonicalizeType(arg));
      }

      if (
        name !== type.name ||
        pointerDepth !== type.pointerDepth ||
        genericArgs !== type.genericArgs
      ) {
        return {
          ...type,
          name,
          pointerDepth,
          genericArgs,
        };
      }
    } else if (type.kind === "FunctionType") {
      const returnType = this.canonicalizeType(type.returnType);
      const paramTypes = type.paramTypes.map((p) => this.canonicalizeType(p));
      return {
        ...type,
        returnType,
        paramTypes,
      };
    } else if (type.kind === "TupleType") {
      const types = type.types.map((t) => this.canonicalizeType(t));
      return {
        ...type,
        types,
      };
    } else if (type.kind === "MetaType") {
      const metaType = type as AST.MetaType;
      const inner = this.canonicalizeType(metaType.type);
      return {
        ...type,
        type: inner,
      } as AST.MetaType;
    }
    return type;
  }

  private static fnv1a(str: string): bigint {
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < str.length; i++) {
      hash ^= BigInt(str.charCodeAt(i));
      hash *= 0x100000001b3n;
      hash &= 0xffffffffffffffffn; // Keep it 64-bit
    }
    // console.log("Registered type id for type:", str, hash);
    return hash;
  }
}
