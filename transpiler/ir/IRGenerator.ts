import Scope from "../Scope";
import { IRBlock } from "./IRBlock";
import { IRFunction } from "./IRFunction";
import {
  AllocaInst,
  BinaryInst,
  BranchInst,
  CallInst,
  CastInst,
  CondBranchInst,
  GetElementPtrInst,
  InlineAsmInst,
  IRInstruction,
  IROpcode,
  LoadInst,
  ReturnInst,
  StoreInst,
  SwitchInst,
} from "./IRInstruction";
import { IRModule } from "./IRModule";

import type { IRType } from "./IRType";
import type { TypeInfo } from "../Scope";
import type { VariableType } from "../../parser/expression/variableDeclarationExpr";

export class IRGenerator {
  public module: IRModule;
  public currentFunction: IRFunction | null = null;
  public currentBlock: IRBlock | null = null;
  private tempCount: number = 0;
  private labelCount: number = 0;
  private stringConstants: Map<string, string> = new Map();

  constructor() {
    this.module = new IRModule();
  }

  // --- Module Level ---

  createFunction(
    name: string,
    args: { name: string; type: IRType }[],
    returnType: IRType,
    isVariadic: boolean = false, // Add this
  ): IRFunction {
    const func = new IRFunction(name, args, returnType, isVariadic);
    this.module.addFunction(func);
    this.currentFunction = func;
    return func;
  }

  ensureIntrinsic(
    name: string,
    args: { name: string; type: IRType }[],
    returnType: IRType,
  ) {
    if (this.module.functions.some((f) => f.name === name)) return;
    const func = new IRFunction(name, args, returnType);
    this.module.addFunction(func);
  }

  // --- Block Level ---

  createBlock(labelPrefix: string = "block"): IRBlock {
    const label = `${labelPrefix}_${this.labelCount++}`;
    const block = new IRBlock(label);
    if (this.currentFunction) {
      this.currentFunction.addBlock(block);
    }
    return block;
  }

  setBlock(block: IRBlock) {
    this.currentBlock = block;
  }

  // --- Instruction Emission ---

  emit(inst: IRInstruction) {
    if (!this.currentBlock) {
      throw new Error("Cannot emit instruction without a current block");
    }
    this.currentBlock.add(inst);
  }

  // --- Helpers ---

  getTemp(prefix: string = "t"): string {
    return `%${prefix}_${this.tempCount++}`;
  }

  // Helper to emit binary op
  emitBinary(
    opcode: IROpcode | string,
    type: IRType | string,
    left: string,
    right: string,
  ): string {
    let op: IROpcode;
    if (typeof opcode === "string") {
      switch (opcode) {
        case "add":
          op = IROpcode.ADD;
          break;
        case "sub":
          op = IROpcode.SUB;
          break;
        case "mul":
          op = IROpcode.MUL;
          break;
        case "div":
          op = IROpcode.DIV;
          break;
        case "mod":
          op = IROpcode.MOD;
          break;
        case "and":
          op = IROpcode.AND;
          break;
        case "or":
          op = IROpcode.OR;
          break;
        case "xor":
          op = IROpcode.XOR;
          break;
        case "shl":
          op = IROpcode.SHL;
          break;
        case "shr":
          op = IROpcode.SHR;
          break;
        case "eq":
          op = IROpcode.EQ;
          break;
        case "ne":
          op = IROpcode.NE;
          break;
        case "lt":
          op = IROpcode.LT;
          break;
        case "gt":
          op = IROpcode.GT;
          break;
        case "le":
          op = IROpcode.LE;
          break;
        case "ge":
          op = IROpcode.GE;
          break;
        default:
          throw new Error(`Unknown binary opcode string: ${opcode}`);
      }
    } else {
      op = opcode;
    }

    let irType: IRType;
    if (typeof type === "string") {
      if (type === "i64") irType = { type: "i64" };
      else if (type === "i32") irType = { type: "i32" };
      else if (type === "f64") irType = { type: "f64" };
      else if (type === "f32") irType = { type: "f32" };
      else if (type === "i8") irType = { type: "i8" };
      else if (type === "i1")
        irType = { type: "i1" }; // Boolean
      else irType = { type: "i64" };
    } else {
      irType = type;
    }

    const dest = this.getTemp();
    this.emit(new BinaryInst(op, irType, left, right, dest));
    return dest;
  }

  // Helper to emit switch
  emitSwitch(
    value: string,
    defaultLabel: string,
    cases: { val: number; label: string }[],
  ) {
    this.emit(new SwitchInst(value, defaultLabel, cases));
  }

  // Helper to emit inline asm
  emitInlineAsm(asm: string, constraints: string, args: string[]) {
    this.emit(new InlineAsmInst(asm, constraints, args));
  }

  // Helper to emit alloca
  emitAlloca(type: IRType, name: string = "var"): string {
    const dest = `%${name}_${this.tempCount++}`; // Use % for local vars
    this.emit(new AllocaInst(type, dest));
    return dest;
  }

  // Helper to emit load
  emitLoad(type: IRType, ptr: string): string {
    const dest = this.getTemp("load");
    this.emit(new LoadInst(type, ptr, dest));
    return dest;
  }

  // Helper to emit store
  emitStore(type: IRType, value: string, ptr: string) {
    this.emit(new StoreInst(type, value, ptr));
  }

  // Helper to emit return
  emitReturn(value: string | null = null, type: IRType = { type: "void" }) {
    this.emit(new ReturnInst(value, type));
  }

  // Helper to emit call
  emitCall(
    funcName: string,
    args: { value: string; type: IRType }[],
    returnType: IRType,
  ): string | null {
    if (returnType.type === "void") {
      this.emit(new CallInst(funcName, args, returnType, null));
      return null;
    } else {
      const dest = this.getTemp("call");
      this.emit(new CallInst(funcName, args, returnType, dest));
      return dest;
    }
  }

  // Helper to emit branch
  emitBranch(label: string) {
    this.emit(new BranchInst(label));
  }

  // Helper to emit cond branch
  emitCondBranch(cond: string, trueLabel: string, falseLabel: string) {
    this.emit(new CondBranchInst(cond, trueLabel, falseLabel));
  }

  // Helper to emit GEP
  emitGEP(
    baseType: IRType,
    ptr: string,
    indices: (string | { value: string; type: string })[],
  ): string {
    const dest = this.getTemp("gep");
    const typedIndices = indices.map((i, idx) => {
      if (typeof i === "string") {
        // First index is always i64 (for array of structs)
        // Second+ indices are i32 (for struct field access)
        return { value: i, type: idx === 0 ? "i64" : "i32" };
      }
      return i;
    });
    this.emit(new GetElementPtrInst(baseType, ptr, typedIndices, dest));
    return dest;
  }

  // Helper to emit Cast
  emitCast(
    opcode: IROpcode,
    value: string,
    destType: IRType,
    srcType: IRType = { type: "i1" },
  ): string {
    const dest = this.getTemp("cast");
    this.emit(new CastInst(opcode, value, srcType, destType, dest));
    return dest;
  }

  // Cast helpers for explicit cast<T>(expr)
  emitBitcast(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(new CastInst(IROpcode.BITCAST, value, srcType, destType, dest));
    return dest;
  }

  emitTrunc(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(new CastInst(IROpcode.TRUNC, value, srcType, destType, dest));
    return dest;
  }

  emitZExt(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(new CastInst(IROpcode.ZEXT, value, srcType, destType, dest));
    return dest;
  }

  emitSExt(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(new CastInst(IROpcode.SEXT, value, srcType, destType, dest));
    return dest;
  }

  emitFPTrunc(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(new CastInst(IROpcode.FP_TRUNC, value, srcType, destType, dest));
    return dest;
  }

  emitFPExt(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(new CastInst(IROpcode.FP_EXT, value, srcType, destType, dest));
    return dest;
  }

  emitFPToSI(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(new CastInst(IROpcode.FP_TO_SI, value, srcType, destType, dest));
    return dest;
  }

  emitFPToUI(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(new CastInst(IROpcode.FP_TO_UI, value, srcType, destType, dest));
    return dest;
  }

  emitSIToFP(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(new CastInst(IROpcode.SI_TO_FP, value, srcType, destType, dest));
    return dest;
  }

  emitUIToFP(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(new CastInst(IROpcode.UI_TO_FP, value, srcType, destType, dest));
    return dest;
  }

  emitPtrToInt(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(
      new CastInst(IROpcode.PTR_TO_INT, value, srcType, destType, dest),
    );
    return dest;
  }

  emitIntToPtr(value: string, srcType: IRType, destType: IRType): string {
    const dest = this.getTemp("cast");
    this.emit(
      new CastInst(IROpcode.INT_TO_PTR, value, srcType, destType, dest),
    );
    return dest;
  }

  getIRType(type: VariableType): IRType {
    if (type.isPointer > 0) {
      const base = this.getIRType({ ...type, isPointer: type.isPointer - 1 });
      return { type: "pointer", base };
    }
    if (type.isArray.length > 0) {
      const base = this.getIRType({ ...type, isArray: type.isArray.slice(1) });
      const size = type.isArray[0];
      if (size === undefined) {
        throw new Error("Array size must be defined");
      }
      return { type: "array", base, size };
    }

    switch (type.name) {
      case "void":
        return { type: "void" };
      case "u8":
      case "i8":
        return { type: "i8" };
      case "u16":
      case "i16":
        return { type: "i16" };
      case "u32":
      case "i32":
        return { type: "i32" };
      case "u64":
      case "i64":
        return { type: "i64" };
      case "f32":
        return { type: "f32" };
      case "f64":
        return { type: "f64" };
      default:
        let name = type.name;
        if (type.genericArgs && type.genericArgs.length > 0) {
          name = this.getCanonicalTypeName(type);
        }
        return { type: "struct", name: name, fields: [] };
    }
  }

  private getCanonicalTypeName(type: VariableType): string {
    let name = type.name;
    if (type.genericArgs && type.genericArgs.length > 0) {
      name += `<${type.genericArgs.map((a) => this.getCanonicalTypeName(a)).join(",")}>`;
    }
    return name;
  }

  addStringConstant(str: string): string {
    if (this.stringConstants.has(str)) {
      return this.stringConstants.get(str)!;
    }
    const name = `@.str.${this.stringConstants.size}`;
    const len = str.length + 1;
    const type: IRType = { type: "array", base: { type: "i8" }, size: len };

    this.module.addGlobal(name, type, str);
    this.stringConstants.set(str, name);
    return name;
  }

  getStringPtr(str: string): string {
    const globalName = this.addStringConstant(str);
    const len = str.length + 1;
    const type: IRType = { type: "array", base: { type: "i8" }, size: len };
    return this.emitGEP(type, globalName, ["0", "0"]);
  }

  registerStruct(typeInfo: TypeInfo, scope: Scope) {
    if (this.module.structs.some((s) => s.name === typeInfo.name)) return;

    const fields: IRType[] = [];
    for (const member of typeInfo.members.values()) {
      const varType: VariableType = {
        name: member.name,
        isPointer: member.isPointer,
        isArray: member.isArray,
      };

      if (member.isPointer === 0 && !member.isPrimitive) {
        const memberTypeInfo = scope.resolveType(member.name);
        if (memberTypeInfo) {
          this.registerStruct(memberTypeInfo, scope);
        }
      }

      fields.push(this.getIRType(varType));
    }

    this.module.addStruct(typeInfo.name, fields);
  }
}
