import type { VariableType } from "../parser/expression/variableDeclarationExpr";

export default class LlvmGenerator {
  private header: string[] = [];
  private output: string[] = [];
  private globals: string[] = [];
  private stringConstants: Map<string, string> = new Map();
  private regCount: number = 0;
  private labelCount: number = 0;
  private sourceFile: string = "";

  constructor() {
    // Standard headers or target info could go here
    this.header.push(
      'target datalayout = "e-m:e-p270:32:32-p271:32:32-p272:64:64-i64:64-f80:128-n8:16:32:64-S128"',
    );
    this.header.push('target triple = "x86_64-unknown-linux-gnu"');
    this.header.push("");
    this.header.push("%struct.__va_list_tag = type { i32, i32, ptr, ptr }");
    this.header.push("");
  }

  setSourceFile(filename: string) {
    this.sourceFile = filename;
  }

  // Emit a raw instruction line
  emit(instr: string) {
    this.output.push(`  ${instr}`);
  }

  // Emit a global definition (outside functions)
  emitGlobal(def: string) {
    if (!this.globals.includes(def)) {
      this.globals.push(def);
    }
  }

  // Emit a label (basic block start)
  emitLabel(label: string) {
    this.output.push(`${label}:`);
  }

  // Generate a unique temporary register name
  generateReg(prefix: string = "tmp"): string {
    return `%${prefix}${this.regCount++}`;
  }

  generateLocal(name: string): string {
    return `${name}_${this.regCount++}`;
  }

  // Generate a unique label name
  generateLabel(prefix: string = "lbl"): string {
    return `${prefix}${this.labelCount++}`;
  }

  // Map BPL types to LLVM types
  mapType(type: VariableType): string {
    if (type.isPointer > 0) {
      return "ptr"; // Opaque pointers in newer LLVM, or "i8*" etc.
    }
    if (type.isArray.length > 0) {
      // Array type: [N x <type>]
      // We need the base type size.
      // For simplicity in this generator, we might treat arrays as pointers in function args,
      // but as array types in allocations.
      // Let's recurse.
      let base = this.mapType({ ...type, isArray: type.isArray.slice(1) });
      return `[${type.isArray[0]} x ${base}]`;
    }

    switch (type.name) {
      case "u8":
      case "i8":
        return "i8";
      case "u16":
      case "i16":
        return "i16";
      case "u32":
      case "i32":
        return "i32";
      case "u64":
      case "i64":
        return "i64";
      case "f32":
        return "float";
      case "f64":
        return "double";
      case "void":
        return "void";
      default:
        // Structs or unknown types
        let name = type.name;
        if (type.genericArgs && type.genericArgs.length > 0) {
          const args = type.genericArgs
            .map((arg) => this.getBplTypeName(arg))
            .join(",");
          name = `${name}<${args}>`;
        }
        if (name.includes("<")) {
          return `%"struct.${name}"`;
        }
        return `%struct.${name}`;
    }
  }

  getBplTypeName(type: VariableType): string {
    let name = type.name;
    if (type.genericArgs && type.genericArgs.length > 0) {
      name += `<${type.genericArgs.map((a) => this.getBplTypeName(a)).join(",")}>`;
    }
    if (type.isPointer) name += "*".repeat(type.isPointer);
    if (type.isArray.length) name += "[]".repeat(type.isArray.length);
    return name;
  }

  // Get default alignment for a type
  getAlignment(type: VariableType): number {
    if (type.isPointer > 0) return 8;
    switch (type.name) {
      case "u8":
        return 1;
      case "u16":
        return 2;
      case "u32":
        return 4;
      case "u64":
        return 8;
      case "f32":
        return 4;
      case "f64":
        return 8;
      default:
        return 8; // Structs usually 8-byte aligned if they contain pointers/u64
    }
  }

  // Add a string constant and return its global variable name (e.g., @.str.0)
  addStringConstant(str: string): string {
    if (this.stringConstants.has(str)) {
      return this.stringConstants.get(str)!;
    }

    const id = this.stringConstants.size;
    const name = `@.str.${id}`;

    // Calculate length and format string for LLVM
    // LLVM strings are like c"hello\00"
    const encoded = str
      .replace(/\\/g, "\\5C")
      .replace(/"/g, "\\22")
      .replace(/\n/g, "\\0A")
      .replace(/\r/g, "\\0D")
      .replace(/\t/g, "\\09");

    const len = str.length + 1; // +1 for null terminator
    const def = `${name} = private unnamed_addr constant [${len} x i8] c"${encoded}\\00", align 1`;

    this.globals.push(def);
    this.stringConstants.set(str, name);

    return name;
  }

  // Helper to get pointer to string constant (getelementptr)
  getStringPtr(str: string): string {
    const globalName = this.addStringConstant(str);
    const len = str.length + 1;
    const reg = this.generateReg("str");
    // Use 'ptr' for pointer type in newer LLVM
    this.emit(
      `${reg} = getelementptr inbounds [${len} x i8], ptr ${globalName}, i64 0, i64 0`,
    );
    return reg;
  }

  build(): string {
    return [...this.header, ...this.globals, "", ...this.output].join("\n");
  }
}
