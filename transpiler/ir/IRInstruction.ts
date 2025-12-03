import type { IRType } from "./IRType";
import { IROpcode } from "./IROpcode";

export { IROpcode };

export abstract class IRInstruction {
  constructor(public opcode: IROpcode) {}
  abstract toString(): string;
}

export class BinaryInst extends IRInstruction {
  constructor(
    opcode: IROpcode,
    public type: IRType, // Added type
    public left: string, // Operand (variable name or literal)
    public right: string,
    public dest: string,
  ) {
    super(opcode);
  }
  toString(): string {
    let opStr = IROpcode[this.opcode];
    switch (this.opcode) {
      case IROpcode.ADD:
        opStr = "add";
        break;
      case IROpcode.SUB:
        opStr = "sub";
        break;
      case IROpcode.MUL:
        opStr = "mul";
        break;
      case IROpcode.DIV:
        opStr = "sdiv";
        break; // Default to signed div for now
      case IROpcode.MOD:
        opStr = "srem";
        break;
      case IROpcode.AND:
        opStr = "and";
        break;
      case IROpcode.OR:
        opStr = "or";
        break;
      case IROpcode.XOR:
        opStr = "xor";
        break;
      case IROpcode.SHL:
        opStr = "shl";
        break;
      case IROpcode.SHR:
        opStr = "ashr";
        break; // Default to arithmetic shift
      case IROpcode.EQ:
        opStr = "icmp eq";
        break;
      case IROpcode.NE:
        opStr = "icmp ne";
        break;
      case IROpcode.LT:
        opStr = "icmp slt";
        break;
      case IROpcode.GT:
        opStr = "icmp sgt";
        break;
      case IROpcode.LE:
        opStr = "icmp sle";
        break;
      case IROpcode.GE:
        opStr = "icmp sge";
        break;
      case IROpcode.FADD:
        opStr = "fadd";
        break;
      case IROpcode.FSUB:
        opStr = "fsub";
        break;
      case IROpcode.FMUL:
        opStr = "fmul";
        break;
      case IROpcode.FDIV:
        opStr = "fdiv";
        break;
      case IROpcode.FMOD:
        opStr = "frem";
        break;
      case IROpcode.FOEQ:
        opStr = "fcmp oeq";
        break;
      case IROpcode.FONE:
        opStr = "fcmp one";
        break;
      case IROpcode.FOLT:
        opStr = "fcmp olt";
        break;
      case IROpcode.FOGT:
        opStr = "fcmp ogt";
        break;
      case IROpcode.FOLE:
        opStr = "fcmp ole";
        break;
      case IROpcode.FOGE:
        opStr = "fcmp oge";
        break;
    }
    return `${this.dest} = ${opStr} ${JSON.stringify(this.type)} ${this.left}, ${this.right}`;
  }
}

export class AllocaInst extends IRInstruction {
  constructor(
    public type: IRType,
    public dest: string,
  ) {
    super(IROpcode.ALLOCA);
  }
  toString(): string {
    return `${this.dest} = alloca ${JSON.stringify(this.type)}`;
  }
}

export class LoadInst extends IRInstruction {
  constructor(
    public type: IRType,
    public ptr: string,
    public dest: string,
  ) {
    super(IROpcode.LOAD);
  }
  toString(): string {
    return `${this.dest} = load ${JSON.stringify(this.type)}, ${this.ptr}`;
  }
}

export class StoreInst extends IRInstruction {
  constructor(
    public type: IRType,
    public value: string,
    public ptr: string,
  ) {
    super(IROpcode.STORE);
  }
  toString(): string {
    return `store ${JSON.stringify(this.type)} ${this.value}, ${this.ptr}`;
  }
}

export class CallInst extends IRInstruction {
  constructor(
    public funcName: string,
    public args: { value: string; type: IRType }[], // Updated args
    public returnType: IRType, // Added returnType
    public dest: string | null, // null if void
    public functionSignature?: string, // Added
  ) {
    super(IROpcode.CALL);
  }
  toString(): string {
    const d = this.dest ? `${this.dest} = ` : "";
    const argsStr = this.args
      .map((a) => `${JSON.stringify(a.type)} ${a.value}`)
      .join(", ");
    return `${d}call ${JSON.stringify(this.returnType)} ${this.funcName}(${argsStr})`;
  }
}

export class ReturnInst extends IRInstruction {
  constructor(
    public value: string | null,
    public type: IRType = { type: "void" },
  ) {
    super(IROpcode.RET);
  }
  toString(): string {
    return `ret ${this.value ? JSON.stringify(this.type) + " " + this.value : "void"}`;
  }
}

export class BranchInst extends IRInstruction {
  constructor(public label: string) {
    super(IROpcode.BR);
  }
  toString(): string {
    return `br ${this.label}`;
  }
}

export class CondBranchInst extends IRInstruction {
  constructor(
    public cond: string,
    public trueLabel: string,
    public falseLabel: string,
  ) {
    super(IROpcode.COND_BR);
  }
  toString(): string {
    return `br ${this.cond}, ${this.trueLabel}, ${this.falseLabel}`;
  }
}

export class SwitchInst extends IRInstruction {
  constructor(
    public value: string,
    public defaultLabel: string,
    public cases: { val: number; label: string }[],
  ) {
    super(IROpcode.SWITCH);
  }
  toString(): string {
    const casesStr = this.cases.map((c) => `${c.val} -> ${c.label}`).join(", ");
    return `switch ${this.value}, default ${this.defaultLabel} [${casesStr}]`;
  }
}

export class InlineAsmInst extends IRInstruction {
  constructor(
    public asm: string,
    public constraints: string,
    public args: string[],
  ) {
    super(IROpcode.INLINE_ASM);
  }
  toString(): string {
    return `asm "${this.asm}" constraints "${this.constraints}" args [${this.args.join(", ")}]`;
  }
}

export class GetElementPtrInst extends IRInstruction {
  constructor(
    public baseType: IRType,
    public ptr: string,
    public indices: { value: string; type: string }[],
    public dest: string,
  ) {
    super(IROpcode.GET_ELEMENT_PTR);
  }
  toString(): string {
    return `${this.dest} = gep ${JSON.stringify(this.baseType)}, ${this.ptr}, [${this.indices.map((i) => `${i.type} ${i.value}`).join(", ")}]`;
  }
}

export class CastInst extends IRInstruction {
  constructor(
    opcode: IROpcode,
    public value: string,
    public srcType: IRType,
    public destType: IRType,
    public dest: string,
  ) {
    super(opcode);
  }
  toString(): string {
    let opStr = IROpcode[this.opcode];
    switch (this.opcode) {
      case IROpcode.SEXT:
        opStr = "sext";
        break;
      case IROpcode.ZEXT:
        opStr = "zext";
        break;
      case IROpcode.TRUNC:
        opStr = "trunc";
        break;
      case IROpcode.BITCAST:
        opStr = "bitcast";
        break;
      case IROpcode.FP_TO_SI:
        opStr = "fptosi";
        break;
      case IROpcode.FP_TO_UI:
        opStr = "fptoui";
        break;
      case IROpcode.SI_TO_FP:
        opStr = "sitofp";
        break;
      case IROpcode.UI_TO_FP:
        opStr = "uitofp";
        break;
      case IROpcode.FP_EXT:
        opStr = "fpext";
        break;
      case IROpcode.FP_TRUNC:
        opStr = "fptrunc";
        break;
      case IROpcode.PTR_TO_INT:
        opStr = "ptrtoint";
        break;
      case IROpcode.INT_TO_PTR:
        opStr = "inttoptr";
        break;
    }
    return `${this.dest} = ${opStr} ${JSON.stringify(this.srcType)} ${this.value} to ${JSON.stringify(this.destType)}`;
  }
}
