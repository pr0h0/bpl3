import type { VariableType } from "../parser/expression/variableDeclarationExpr";

export interface VarInfo {
  type: "local" | "global";
  offset: string;
  varType: VariableType;
  isParameter?: boolean;
}

export type ContextType =
  | {
      type: "function";
      label: string;
      endLabel: string;
      returnType: VariableType | null;
    }
  | {
      type: "loop";
      breakLabel: string;
      continueLabel: string;
      stackOffset: number;
    }
  | { type: "LHS" }
  | null;

export type TypeInfo = {
  name: string;
  isPointer: number;
  isArray: number[];
  size: number;
  offset?: number;
  alignment?: number;
  isPrimitive: boolean;
  members: Map<string, TypeInfo>;
  info: InfoType;
};

export type InfoType = {
  description: string;
  signed?: boolean;
  [key: string]: any;
};

export type FunctionInfo = {
  name: string;
  label: string;
  startLabel: string;
  endLabel: string;
  args: { type: VariableType; name: string }[];
  returnType: VariableType | null;
  isExternal?: boolean;
};

export default class Scope {
  private types = new Map<string, TypeInfo>();
  private vars = new Map<string, VarInfo>();
  public stackOffset = 0; // Tracks stack usage for this function
  private functions = new Map<string, FunctionInfo>();
  public currentContext: ContextType[] = [];

  constructor(public readonly parent: Scope | null = null) {}

  // #region Context Management
  removeCurrentContext(type: "loop" | "function" | "LHS") {
    const index = this.currentContext.findLastIndex(
      (ctx) => ctx?.type === type,
    );
    if (index !== -1) {
      this.currentContext.splice(index, 1);
    }
  }

  setCurrentContext(context: Exclude<ContextType, null>) {
    this.currentContext.push(context);
  }

  getCurrentContext(type: "loop" | "function" | "LHS"): ContextType {
    const current = this.currentContext.findLast((ctx) => ctx?.type === type);
    if (current) {
      return current;
    } else if (this.parent) {
      return this.parent.getCurrentContext(type);
    } else {
      return null;
    }
  }
  // #endregion

  // #region Variables
  resolve(name: string): VarInfo | null {
    return this.vars.get(name) || this.parent?.resolve(name) || null;
  }

  // Define a new variable
  define(name: string, info: VarInfo) {
    this.vars.set(name, info);
  }

  // Allocate space on stack (e.g., 8 bytes for 64-bit int)
  allocLocal(size: number = 8): number {
    this.stackOffset += size;
    return this.stackOffset;
  }

  // #endregion

  // #region functions
  defineFunction(name: string, info: FunctionInfo) {
    if (this.parent) {
      this.parent.defineFunction(name, info);
    } else if (this.functions.has(name)) {
      if (this.functions.get(name)!.isExternal && info.isExternal) {
        if (this.functions.get(name)!.args.length < info.args.length) {
          this.functions.set(name, info);
        }
        return; // Allow re-definition of external functions
      }
      throw new Error(`Function ${name} is already defined.`);
    } else {
      this.functions.set(name, info);
    }
  }

  resolveFunction(name: string): FunctionInfo | null {
    if (this.parent) {
      return this.parent.resolveFunction(name);
    } else if (this.functions.has(name)) {
      return this.functions.get(name)!;
    }
    return null;
  }
  // #endregion

  // #region Types
  defineType(name: string, info: TypeInfo) {
    if (this.parent) {
      throw new Error("Types can only be defined in the global scope.");
    }

    if (this.types.has(name)) {
      throw new Error(`Type ${name} is already defined.`);
    }
    if (info.size === 0) {
      const size = this.calculateSizeOfType(info);
      info.size = size;
    }
    this.types.set(name, info);
  }
  resolveType(name: string): TypeInfo | null {
    if (this.parent) {
      return this.parent?.resolveType(name) || null;
    }
    return this.types.get(name) || null;
  }
  calculateSizeOfType(type: TypeInfo): number {
    if (type.isPrimitive) {
      return type.size;
    }

    if (type.isPointer > 0) {
      return 8; // Assuming 64-bit pointers
    }

    if (type.isArray.length > 0) {
      let baseSize = this.calculateSizeOfType({
        ...type,
        isArray: [],
      });
      for (let dim of type.isArray) {
        baseSize *= dim;
      }
      return baseSize;
    }

    let totalSize = 0;
    for (let member of type.members.values()) {
      if (!this.resolveType(member.name)) {
        throw new Error(`Type ${member.name} not defined.`);
      }
      totalSize += this.resolveType(member.name)!.size;
    }
    return totalSize;
  }
  // #endregion
}
