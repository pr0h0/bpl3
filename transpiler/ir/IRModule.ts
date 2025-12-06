import { IRFunction } from "./IRFunction";

import type { IRType } from "./IRType";

export class IRModule {
  public functions: IRFunction[] = [];
  public globals: { name: string; type: IRType; value?: any }[] = [];
  public externs: { name: string; args: IRType[]; returnType: IRType }[] = [];
  public structs: { name: string; fields: IRType[] }[] = [];

  addFunction(func: IRFunction) {
    this.functions.push(func);
  }

  addGlobal(name: string, type: IRType, value?: any) {
    this.globals.push({ name, type, value });
  }

  addExtern(name: string, args: IRType[], returnType: IRType) {
    this.externs.push({ name, args, returnType });
  }

  addStruct(name: string, fields: IRType[]) {
    this.structs.push({ name, fields });
  }

  toString(): string {
    let out = "";
    // Structs
    for (const s of this.structs) {
      out += `type ${s.name} = { ... }\n`;
    }
    // Globals
    for (const g of this.globals) {
      out += `global ${g.name}: ${JSON.stringify(g.type)}\n`;
    }
    // Externs
    for (const e of this.externs) {
      out += `extern ${e.name}(...)\n`;
    }
    // Functions
    for (const f of this.functions) {
      out += f.toString() + "\n\n";
    }
    return out;
  }
}
