export default class AsmGenerator {
  private text: string[] = []; // Code
  private data: string[] = []; // Globals
  private rodata: string[] = []; // Read-only data
  private bss: string[] = []; // Uninitialized
  private precompute: string[] = []; // Precomputed instructions
  private labelCount: number = 0;

  isPrecomputeBlock: boolean = false;
  startPrecomputeBlock() {
    this.isPrecomputeBlock = true;
  }
  endPrecomputeBlock() {
    this.isPrecomputeBlock = false;
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
  emitData(label: string, value: string | number) {
    this.data.push(`${label} dq ${value}`);
  }

  emitRoData(label: string, value: string) {
    this.rodata.push(`${label} db ${value}`);
  }

  // For uninitialized globals: var x;
  emitBss(label: string, size: number) {
    this.bss.push(`${label} resb ${size}`);
  }

  generateLabel(prefix: string = "L"): string {
    return `${prefix}${this.labelCount++}`;
  }

  build(): string {
    return [
      "section .rodata",
      ...this.rodata,
      "section .data",
      ...this.data,
      "section .bss",
      ...this.bss,
      "section .text",
      "_precompute:",
      ...this.precompute,
      "global _start",
      ...this.text,
    ].join("\n");
  }
}
