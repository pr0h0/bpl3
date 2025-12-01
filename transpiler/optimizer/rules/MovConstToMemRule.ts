import type { IOptimizationRule, OptimizationResult } from "../OptimizerRule";
import { parseLine } from "../Utils";

export class MovConstToMemRule implements IOptimizationRule {
  priority = 50;

  private getNextInstructionIndex(lines: string[], startIndex: number): number {
    let idx = startIndex;
    while (idx < lines.length) {
      const l = parseLine(lines[idx]!);
      if (l.code && !l.code.startsWith("%")) {
        return idx;
      }
      idx++;
    }
    return -1;
  }

  private getSubRegisters(reg: string): string[] {
    const map: Record<string, string[]> = {
      rax: ["eax", "ax", "al"],
      rbx: ["ebx", "bx", "bl"],
      rcx: ["ecx", "cx", "cl"],
      rdx: ["edx", "dx", "dl"],
      rsi: ["esi", "si", "sil"],
      rdi: ["edi", "di", "dil"],
      rbp: ["ebp", "bp", "bpl"],
      rsp: ["esp", "sp", "spl"],
      r8: ["r8d", "r8w", "r8b"],
      r9: ["r9d", "r9w", "r9b"],
      r10: ["r10d", "r10w", "r10b"],
      r11: ["r11d", "r11w", "r11b"],
      r12: ["r12d", "r12w", "r12b"],
      r13: ["r13d", "r13w", "r13b"],
      r14: ["r14d", "r14w", "r14b"],
      r15: ["r15d", "r15w", "r15b"],
    };
    return map[reg] || [];
  }

  private getSize(reg: string): string {
    if (["rax", "rbx", "rcx", "rdx", "rsi", "rdi", "rbp", "rsp"].includes(reg))
      return "qword";
    if (reg.match(/^r\d+$/)) return "qword";

    if (["eax", "ebx", "ecx", "edx", "esi", "edi", "ebp", "esp"].includes(reg))
      return "dword";
    if (reg.match(/^r\d+d$/)) return "dword";

    if (["ax", "bx", "cx", "dx", "si", "di", "bp", "sp"].includes(reg))
      return "word";
    if (reg.match(/^r\d+w$/)) return "word";

    if (
      [
        "al",
        "bl",
        "cl",
        "dl",
        "sil",
        "dil",
        "bpl",
        "spl",
        "ah",
        "bh",
        "ch",
        "dh",
      ].includes(reg)
    )
      return "byte";
    if (reg.match(/^r\d+b$/)) return "byte";

    return "qword";
  }

  canApply(lines: string[], index: number): boolean {
    const line1 = parseLine(lines[index]!);

    // Match "mov reg, imm"
    const match1 = line1.code.match(
      /^mov\s+([a-z0-9]+),\s+(-?\d+|0x[0-9a-fA-F]+)$/,
    );
    if (!match1) return false;

    const reg = match1[1]!;
    const immStr = match1[2]!;
    const imm = Number(immStr);

    // Check if immediate fits in 32-bit signed integer (x86-64 limitation for mov mem, imm)
    if (isNaN(imm) || imm < -2147483648 || imm > 2147483647) return false;

    const nextIdx = this.getNextInstructionIndex(lines, index + 1);
    if (nextIdx === -1) return false;

    const line2 = parseLine(lines[nextIdx]!);

    // Match "mov [mem], reg" or sub-register
    const subRegs = this.getSubRegisters(reg);
    const allRegs = [reg, ...subRegs];
    // Escape all regs
    const allRegsEscaped = allRegs
      .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");

    const match2 = line2.code.match(
      new RegExp(`^mov\\s+(\\[.+\\]),\\s+(${allRegsEscaped})$`),
    );

    if (!match2) return false;
    const dest = match2[1]!;
    // const usedReg = match2[2]!; // Not needed here

    // Check if dest uses reg (e.g. mov [rax], rax)
    if (dest.includes(reg)) return false;

    // Safety check: Is reg dead after this?
    const regEscaped = reg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let safetyIdx = nextIdx + 1;
    while (safetyIdx < lines.length) {
      const nextLine = parseLine(lines[safetyIdx]!);

      if (!nextLine.code || nextLine.code.startsWith("%")) {
        safetyIdx++;
        continue;
      }

      // If we hit a label or control flow change, assume unsafe
      if (
        nextLine.code.endsWith(":") ||
        nextLine.code.startsWith("j") ||
        nextLine.code.startsWith("call") ||
        nextLine.code.startsWith("ret")
      ) {
        return false;
      }

      // Check if it overwrites reg
      if (nextLine.code.match(new RegExp(`^mov\\s+${regEscaped},`)))
        return true;
      if (
        nextLine.code.match(
          new RegExp(`^xor\\s+${regEscaped},\\s+${regEscaped}$`),
        )
      )
        return true;
      if (nextLine.code.match(new RegExp(`^pop\\s+${regEscaped}$`)))
        return true;
      if (nextLine.code.match(new RegExp(`^lea\\s+${regEscaped},`)))
        return true;

      // If it reads reg, or does something else, we assume unsafe
      return false;
    }

    return false;
  }

  apply(lines: string[], index: number): OptimizationResult {
    const line1 = parseLine(lines[index]!);
    const match1 = line1.code.match(
      /^mov\s+([a-z0-9]+),\s+(-?\d+|0x[0-9a-fA-F]+)$/,
    );
    const reg = match1![1]!;
    const imm = match1![2]!;

    const nextIdx = this.getNextInstructionIndex(lines, index + 1);
    const line2 = parseLine(lines[nextIdx]!);

    const subRegs = this.getSubRegisters(reg);
    const allRegs = [reg, ...subRegs];
    const allRegsEscaped = allRegs
      .map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");

    const match2 = line2.code.match(
      new RegExp(`^mov\\s+(\\[.+\\]),\\s+(${allRegsEscaped})$`),
    );
    const dest = match2![1]!;
    const usedReg = match2![2]!;
    const size = this.getSize(usedReg);

    const intermediateLines = lines.slice(index + 1, nextIdx);
    const newLine = `    mov ${size} ${dest}, ${imm} ; optimized mov const to mem`;

    return {
      newLines: [...intermediateLines, newLine],
      skipCount: nextIdx - index + 1,
    };
  }
}
