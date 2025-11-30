import { Optimizer } from "./optimizer/Optimizer";

export default class AsmGenerator {
  private text: string[] = []; // Code
  private data: string[] = []; // Globals
  private rodata: string[] = []; // Read-only data
  private bss: string[] = []; // Uninitialized
  private precompute: string[] = []; // Precomputed instructions
  private globalDefinitions: string[] = [];
  private importDefinitions: string[] = [];
  private labelCount: number = 0;
  private initLabel: string;
  private optimizer: Optimizer;
  private sourceFile: string = "";

  constructor(optimizationLevel: number = 3) {
    this.initLabel = "_init_" + Math.random().toString(36).substring(2, 15);
    this.optimizer = new Optimizer(optimizationLevel);
  }

  setSourceFile(filename: string) {
    this.sourceFile = filename;
  }

  emitSourceLocation(line: number) {
    if (this.sourceFile && line > 0) {
      this.text.push(`%line ${line} "${this.sourceFile}"`);
    }
  }

  isPrecomputeBlock: boolean = false;
  startPrecomputeBlock() {
    this.isPrecomputeBlock = true;
  }
  endPrecomputeBlock() {
    this.isPrecomputeBlock = false;
  }

  emitGlobalDefinition(definition: string) {
    this.globalDefinitions.push(definition);
  }

  emitImportStatement(statement: string) {
    this.importDefinitions.push(statement);
  }

  // Helper to emit indented instructions
  emit(instr: string, comment: string = "") {
    const cmt = comment ? ` ; ${comment}` : "";
    if (this.isPrecomputeBlock) {
      this.precompute.push(`    ${instr}${cmt}`);
    } else {
      this.text.push(`    ${instr}${cmt}`);
    }
  }

  emitLabel(label: string) {
    this.text.push(`${label}:`);
  }

  // For global variables like: var x = 10;
  emitData(label: string, type: string, value: string | number) {
    this.data.push(`${label} ${type} ${value}`);
  }

  emitRoData(label: string, type: string, value: string) {
    this.rodata.push(`${label} ${type} ${value}`);
  }

  // For uninitialized globals: var x;
  emitBss(label: string, type: string, size: number) {
    this.bss.push(`${label} ${type} ${size}`);
  }

  generateLabel(prefix: string = "L"): string {
    return `${prefix}${this.labelCount++}`;
  }

  build(): string {
    const hasPrecompute = this.precompute.length > 0;

    if (hasPrecompute) {
      this.globalDefinitions.push(`global ${this.initLabel}`);
    }

    const initSection = hasPrecompute
      ? ["section .init_array", `dq ${this.initLabel}`]
      : [];

    const precomputeBlock = hasPrecompute
      ? [`${this.initLabel}:`, ...this.precompute, "    ret"]
      : [];

    return [
      "default rel",
      ...this.importDefinitions,
      "section .rodata",
      ...this.rodata,
      "section .data",
      ...this.data,
      "section .bss",
      ...this.bss,
      ...initSection,
      "section .text",
      ...this.globalDefinitions,
      ...precomputeBlock,
      ...this.optimizer.optimize(this.text),
    ].join("\n");
  }
}
