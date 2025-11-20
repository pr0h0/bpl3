export type VarInfo =
  | { type: "local"; offset: number } // stack: [rbp - offset]
  | { type: "global"; label: string }; // data: [label]

export default class Scope {
  private vars = new Map<string, VarInfo>();
  private functions = new Map<string, any>();
  public stackOffset = 0; // Tracks stack usage for this function

  constructor(private parent: Scope | null = null) {}

  // Find a variable recursively
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

  resolveFunction(name: string): any | null {
    return (
      this.functions.get(name) || this.parent?.resolveFunction(name) || null
    );
  }

  defineFunction(name: string, info: any) {
    if (this.parent) {
      this.parent.defineFunction(name, info);
    } else if (this.functions.has(name)) {
      throw new Error(`Function ${name} is already defined.`);
    } else {
      this.functions.set(name, info);
    }
  }
}
