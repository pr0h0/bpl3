/**
 * C calling-convention lowering for extern functions whose signatures pass or
 * return C-compatible structs by value.
 *
 * BPL code calls an internal wrapper with the ordinary LLVM aggregate
 * signature. The wrapper converts values to the platform C ABI (register
 * coercion, indirect copies, sret) and calls the real symbol. Classification
 * mirrors clang for each supported target; tests/CAbiLowering.test.ts compares
 * the lowered declarations with clang's output.
 */
import {
  LLVMTypeLayout,
  alignTo,
  splitLlvmAggregateFields,
} from "../LLVMTypeLayout";
import { parseTargetTriple } from "../../../common/TargetTriple";

export type CAbiKind =
  | "x86_64-sysv"
  | "x86_64-win64"
  | "aarch64-aapcs"
  | "aarch64-darwin"
  | "i386-sysv"
  | "wasm";

export function getCAbiKind(target?: string): CAbiKind {
  if (target === undefined) return "x86_64-sysv";
  const parsed = parseTargetTriple(target);
  const arch = parsed?.arch ?? "";
  const lower = target.toLowerCase();
  if (arch === "wasm32" || arch === "wasm64") return "wasm";
  if (arch === "i686" || arch === "i386") return "i386-sysv";
  if (arch === "aarch64" || arch === "arm64") {
    return /darwin|macos|ios/.test(lower) ? "aarch64-darwin" : "aarch64-aapcs";
  }
  if (/windows|win32|mingw/.test(lower)) return "x86_64-win64";
  return "x86_64-sysv";
}

type LeafKind = "int" | "ptr" | "float" | "double";

interface Leaf {
  offset: number;
  size: number;
  kind: LeafKind;
}

/** One value loaded from (or stored to) the aggregate's bytes. */
interface Part {
  offset: number;
  type: string;
}

/** One lowered LLVM parameter, assembled from one or more parts. */
interface LoweredParam {
  type: string;
  attributes: string;
  parts: Part[];
}

type ArgLowering =
  | { kind: "direct" }
  | { kind: "coerce"; params: LoweredParam[] }
  | { kind: "indirect"; byval: boolean; alignment: number };

type ReturnLowering =
  | { kind: "direct" }
  | { kind: "coerce"; type: string; parts: Part[] }
  | { kind: "sret"; alignment: number };

export interface CAbiSignature {
  name: string;
  returnType: string;
  paramTypes: string[];
}

export interface LoweredExtern {
  wrapperName: string;
  declaration: string;
  wrapper: string[];
}

export function isByValueAggregate(type: string): boolean {
  if (type.endsWith("*")) return false;
  return type.startsWith("%struct.") || type.startsWith("%enum.");
}

export function needsCAbiLowering(signature: CAbiSignature): boolean {
  return (
    isByValueAggregate(signature.returnType) ||
    signature.paramTypes.some(isByValueAggregate)
  );
}

export function getCAbiWrapperName(name: string): string {
  return `__bpl_cabi.${name}`;
}

export class CAbiLowering {
  constructor(
    private readonly abi: CAbiKind,
    private readonly layout: LLVMTypeLayout,
    private readonly resolveNamed: (name: string) => string,
  ) {}

  lower(signature: CAbiSignature): LoweredExtern {
    const ret = this.classifyReturn(signature.returnType);
    const args = this.classifyArguments(
      signature.paramTypes,
      ret.kind === "sret",
    );
    return {
      wrapperName: getCAbiWrapperName(signature.name),
      declaration: this.emitDeclaration(signature, ret, args),
      wrapper: this.emitWrapper(signature, ret, args),
    };
  }

  // ---------------------------------------------------------------------
  // Classification
  // ---------------------------------------------------------------------

  private leaves(type: string, base = 0, out: Leaf[] = []): Leaf[] {
    type = type.trim();
    if (type.endsWith("*") || type === "ptr") {
      out.push({ offset: base, size: this.layout.get(type).size, kind: "ptr" });
      return out;
    }
    if (type === "float" || type === "double") {
      out.push({ offset: base, size: type === "float" ? 4 : 8, kind: type });
      return out;
    }
    const integer = /^i(\d+)$/.exec(type);
    if (integer) {
      const size = this.layout.get(type).size;
      if (size > 8) unsupported(`integer type ${type}`);
      out.push({ offset: base, size, kind: "int" });
      return out;
    }
    const array = /^\[(\d+) x (.*)\]$/.exec(type);
    if (array) {
      const element = array[2]!;
      const elementSize = this.layout.get(element).size;
      for (let i = 0; i < Number(array[1]); i++) {
        this.leaves(element, base + i * elementSize, out);
      }
      return out;
    }
    if (type.startsWith("<{")) unsupported(`packed struct ${type}`);
    if (type.startsWith("{")) {
      const layout = this.layout.get(type);
      splitLlvmAggregateFields(type).forEach((field, index) =>
        this.leaves(field, base + layout.offsets![index]!, out),
      );
      return out;
    }
    if (type.startsWith("%")) {
      return this.leaves(this.resolveNamed(type), base, out);
    }
    return unsupported(`type ${type}`);
  }

  private aggregateInfo(type: string) {
    const layout = this.layout.get(type);
    const leaves = this.leaves(type);
    if (layout.size === 0 || leaves.length === 0) {
      unsupported(`empty struct ${type}`);
    }
    if (layout.alignment > 8) unsupported(`over-aligned struct ${type}`);
    return { size: layout.size, alignment: layout.alignment, leaves };
  }

  /** Payload-free enums are C enums: an `int` value. */
  private isScalarEnum(type: string): boolean {
    return (
      type.startsWith("%enum.") && this.resolveNamed(type).trim() === "{ i32 }"
    );
  }

  private classifyReturn(type: string): ReturnLowering {
    if (!isByValueAggregate(type)) return { kind: "direct" };
    if (this.isScalarEnum(type)) {
      return {
        kind: "coerce",
        type: "i32",
        parts: [{ offset: 0, type: "i32" }],
      };
    }
    const info = this.aggregateInfo(type);
    switch (this.abi) {
      case "x86_64-sysv": {
        const pieces = this.x86Pieces(info);
        if (!pieces) return { kind: "sret", alignment: info.alignment };
        return pieces.length === 1
          ? { kind: "coerce", type: pieces[0]!.type, parts: pieces }
          : {
              kind: "coerce",
              type: `{ ${pieces.map((p) => p.type).join(", ")} }`,
              parts: pieces,
            };
      }
      case "aarch64-aapcs":
      case "aarch64-darwin": {
        const hfa = homogeneousFloatingAggregate(info);
        if (hfa) return { kind: "coerce", type, parts: [] };
        if (info.size <= 8) {
          const intType = `i${info.size * 8}`;
          return {
            kind: "coerce",
            type: intType,
            parts: [{ offset: 0, type: intType }],
          };
        }
        if (info.size <= 16) {
          return {
            kind: "coerce",
            type: "[2 x i64]",
            parts: [
              { offset: 0, type: "i64" },
              { offset: 8, type: "i64" },
            ],
          };
        }
        return { kind: "sret", alignment: info.alignment };
      }
      case "x86_64-win64": {
        if ([1, 2, 4, 8].includes(info.size)) {
          const intType = `i${info.size * 8}`;
          return {
            kind: "coerce",
            type: intType,
            parts: [{ offset: 0, type: intType }],
          };
        }
        return { kind: "sret", alignment: info.alignment };
      }
      case "i386-sysv":
        return { kind: "sret", alignment: info.alignment };
      case "wasm": {
        const element = singleElement(info);
        if (element) {
          return {
            kind: "coerce",
            type: element.type,
            parts: [element],
          };
        }
        return { kind: "sret", alignment: info.alignment };
      }
    }
  }

  private classifyArguments(types: string[], hasSret: boolean): ArgLowering[] {
    // x86-64 SysV passes a struct in memory when its register classes do not
    // all fit in the remaining registers, so track register use in order.
    let freeInt = 6 - (hasSret ? 1 : 0);
    let freeSse = 8;
    return types.map((type): ArgLowering => {
      if (!isByValueAggregate(type)) {
        if (this.abi === "x86_64-sysv") {
          if (type === "float" || type === "double") {
            if (freeSse > 0) freeSse--;
          } else if (freeInt > 0) {
            freeInt--;
          }
        }
        return { kind: "direct" };
      }
      if (this.isScalarEnum(type)) {
        if (this.abi === "x86_64-sysv" && freeInt > 0) freeInt--;
        return {
          kind: "coerce",
          params: [single("i32", 0)],
        };
      }
      const info = this.aggregateInfo(type);
      switch (this.abi) {
        case "x86_64-sysv": {
          const pieces = this.x86Pieces(info);
          if (pieces) {
            const needInt = pieces.filter((p) => !isSseType(p.type)).length;
            const needSse = pieces.length - needInt;
            if (needInt <= freeInt && needSse <= freeSse) {
              freeInt -= needInt;
              freeSse -= needSse;
              return {
                kind: "coerce",
                params: pieces.map((p) => single(p.type, p.offset)),
              };
            }
          }
          // With no integer registers left, clang passes eightbyte-sized
          // structs as a stack integer rather than a byval copy.
          if (freeInt === 0 && info.size <= 8) {
            return { kind: "coerce", params: [single(`i${info.size * 8}`, 0)] };
          }
          return { kind: "indirect", byval: true, alignment: info.alignment };
        }
        case "aarch64-aapcs":
        case "aarch64-darwin": {
          const hfa = homogeneousFloatingAggregate(info);
          if (hfa) {
            return {
              kind: "coerce",
              params: [
                {
                  type: `[${hfa.count} x ${hfa.type}]`,
                  attributes:
                    this.abi === "aarch64-aapcs" ? "alignstack(8)" : "",
                  parts: Array.from({ length: hfa.count }, (_, i) => ({
                    offset: i * hfa.size,
                    type: hfa.type,
                  })),
                },
              ],
            };
          }
          if (info.size <= 8) {
            return { kind: "coerce", params: [single("i64", 0)] };
          }
          if (info.size <= 16) {
            return {
              kind: "coerce",
              params: [
                {
                  type: "[2 x i64]",
                  attributes: "",
                  parts: [
                    { offset: 0, type: "i64" },
                    { offset: 8, type: "i64" },
                  ],
                },
              ],
            };
          }
          return { kind: "indirect", byval: false, alignment: info.alignment };
        }
        case "x86_64-win64":
          if ([1, 2, 4, 8].includes(info.size)) {
            return {
              kind: "coerce",
              params: [single(`i${info.size * 8}`, 0)],
            };
          }
          return { kind: "indirect", byval: false, alignment: info.alignment };
        case "i386-sysv": {
          const expanded = this.i386Expansion(type, info.size);
          if (expanded) return { kind: "coerce", params: expanded };
          return { kind: "indirect", byval: true, alignment: 4 };
        }
        case "wasm": {
          const element = singleElement(info);
          if (element) {
            return {
              kind: "coerce",
              params: [single(element.type, element.offset)],
            };
          }
          return { kind: "indirect", byval: true, alignment: info.alignment };
        }
      }
    });
  }

  /** x86-64 SysV eightbyte classification; undefined means MEMORY. */
  private x86Pieces(info: {
    size: number;
    leaves: Leaf[];
  }): Part[] | undefined {
    if (info.size > 16) return undefined;
    const pieces: Part[] = [];
    for (let start = 0; start < info.size; start += 8) {
      const inside = info.leaves.filter(
        (leaf) => leaf.offset >= start && leaf.offset < start + 8,
      );
      if (inside.length === 0) continue;
      if (inside.some((leaf) => leaf.offset + leaf.size > start + 8)) {
        return undefined;
      }
      const end = Math.max(...inside.map((l) => l.offset + l.size)) - start;
      const sse = inside.every(
        (l) => l.kind === "float" || l.kind === "double",
      );
      let type: string;
      if (!sse) {
        const only = inside.length === 1 ? inside[0]! : undefined;
        type =
          only?.kind === "ptr" && only.offset === start && only.size === 8
            ? "i8*"
            : `i${end * 8}`;
      } else if (
        inside.length === 1 &&
        inside[0]!.kind === "float" &&
        end <= 4
      ) {
        type = "float";
      } else if (
        inside.length === 2 &&
        inside.every((l) => l.kind === "float") &&
        inside[0]!.offset === start &&
        inside[1]!.offset === start + 4
      ) {
        type = "<2 x float>";
      } else {
        type = "double";
      }
      pieces.push({ offset: start, type });
    }
    return pieces;
  }

  /** i386 SysV splits small flat structs of word-sized fields into scalars. */
  private i386Expansion(
    type: string,
    size: number,
  ): LoweredParam[] | undefined {
    if (size > 16) return undefined;
    const body = type.startsWith("%") ? this.resolveNamed(type) : type;
    if (!body.trim().startsWith("{")) return undefined;
    const fields = splitLlvmAggregateFields(body.trim());
    const offsets = this.layout.get(body).offsets!;
    let expected = 0;
    const params: LoweredParam[] = [];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]!;
      const scalar =
        field === "i32" ||
        field === "i64" ||
        field === "float" ||
        field === "double" ||
        field.endsWith("*");
      if (!scalar || offsets[i] !== expected) return undefined;
      params.push(single(field, offsets[i]!));
      expected += this.layout.get(field).size;
    }
    return expected === size ? params : undefined;
  }

  private partSize(type: string): number {
    return type === "<2 x float>" ? 8 : this.layout.get(type).size;
  }

  // ---------------------------------------------------------------------
  // Emission
  // ---------------------------------------------------------------------

  private emitDeclaration(
    signature: CAbiSignature,
    ret: ReturnLowering,
    args: ArgLowering[],
  ): string {
    const params: string[] = [];
    let returnType = signature.returnType;
    if (ret.kind === "sret") {
      returnType = "void";
      params.push(
        `${signature.returnType}* sret(${signature.returnType}) align ${ret.alignment}`,
      );
    } else if (ret.kind === "coerce") {
      returnType = ret.type;
    }
    args.forEach((arg, index) => {
      const type = signature.paramTypes[index]!;
      if (arg.kind === "direct") params.push(type);
      else if (arg.kind === "indirect") params.push(indirectParam(type, arg));
      else {
        for (const param of arg.params) {
          params.push(
            param.attributes ? `${param.type} ${param.attributes}` : param.type,
          );
        }
      }
    });
    return `declare ${returnType} @${signature.name}(${params.join(", ")})`;
  }

  private emitWrapper(
    signature: CAbiSignature,
    ret: ReturnLowering,
    args: ArgLowering[],
  ): string[] {
    const lines: string[] = [];
    let counter = 0;
    const temp = () => `%t${counter++}`;
    const wrapperParams = signature.paramTypes
      .map((type, index) => `${type} %a${index}`)
      .join(", ");
    lines.push(
      `define internal ${signature.returnType} @${getCAbiWrapperName(signature.name)}(${wrapperParams}) {`,
    );
    lines.push("entry:");

    /** Copies a value into a zero-padded byte buffer large enough for parts. */
    const bytesOf = (type: string, value: string, parts: Part[]) => {
      const layout = this.layout.get(type);
      const extent = Math.max(
        layout.size,
        ...parts.map((p) => p.offset + this.partSize(p.type)),
      );
      const size = alignTo(extent, 8);
      const buffer = temp();
      lines.push(`  ${buffer} = alloca [${size} x i8], align 8`);
      lines.push(
        `  store [${size} x i8] zeroinitializer, [${size} x i8]* ${buffer}, align 8`,
      );
      const cast = temp();
      lines.push(`  ${cast} = bitcast [${size} x i8]* ${buffer} to ${type}*`);
      lines.push(`  store ${type} ${value}, ${type}* ${cast}, align 1`);
      return { buffer, size };
    };
    const partPointer = (buffer: string, size: number, part: Part) => {
      const gep = temp();
      lines.push(
        `  ${gep} = getelementptr inbounds [${size} x i8], [${size} x i8]* ${buffer}, i64 0, i64 ${part.offset}`,
      );
      const cast = temp();
      lines.push(`  ${cast} = bitcast i8* ${gep} to ${part.type}*`);
      return cast;
    };

    const callArgs: string[] = [];
    let sretSlot = "";
    if (ret.kind === "sret") {
      sretSlot = temp();
      const type = signature.returnType;
      lines.push(`  ${sretSlot} = alloca ${type}, align ${ret.alignment}`);
      callArgs.push(
        `${type}* sret(${type}) align ${ret.alignment} ${sretSlot}`,
      );
    }

    args.forEach((arg, index) => {
      const type = signature.paramTypes[index]!;
      const value = `%a${index}`;
      if (arg.kind === "direct") {
        callArgs.push(`${type} ${value}`);
        return;
      }
      if (arg.kind === "indirect") {
        const copy = temp();
        lines.push(`  ${copy} = alloca ${type}, align ${arg.alignment}`);
        lines.push(`  store ${type} ${value}, ${type}* ${copy}`);
        callArgs.push(`${indirectParam(type, arg)} ${copy}`);
        return;
      }
      const allParts = arg.params.flatMap((param) => param.parts);
      const { buffer, size } = bytesOf(type, value, allParts);
      for (const param of arg.params) {
        const loaded = param.parts.map((part) => {
          const pointer = partPointer(buffer, size, part);
          const result = temp();
          lines.push(
            `  ${result} = load ${part.type}, ${part.type}* ${pointer}, align 1`,
          );
          return result;
        });
        let operand = loaded[0]!;
        if (param.parts.length !== 1 || param.type !== param.parts[0]!.type) {
          let aggregate = "undef";
          param.parts.forEach((part, partIndex) => {
            const next = temp();
            lines.push(
              `  ${next} = insertvalue ${param.type} ${aggregate}, ${part.type} ${loaded[partIndex]}, ${partIndex}`,
            );
            aggregate = next;
          });
          operand = aggregate;
        }
        const prefix = param.attributes
          ? `${param.type} ${param.attributes}`
          : param.type;
        callArgs.push(`${prefix} ${operand}`);
      }
    });

    const callee = `@${signature.name}`;
    const argList = callArgs.join(", ");
    if (ret.kind === "direct") {
      if (signature.returnType === "void") {
        lines.push(`  call void ${callee}(${argList})`, "  ret void");
      } else {
        const result = temp();
        lines.push(
          `  ${result} = call ${signature.returnType} ${callee}(${argList})`,
          `  ret ${signature.returnType} ${result}`,
        );
      }
    } else if (ret.kind === "sret") {
      const result = temp();
      lines.push(
        `  call void ${callee}(${argList})`,
        `  ${result} = load ${signature.returnType}, ${signature.returnType}* ${sretSlot}`,
        `  ret ${signature.returnType} ${result}`,
      );
    } else if (ret.parts.length === 0) {
      // The C return type is the BPL struct type itself (AArch64 HFA).
      const result = temp();
      lines.push(
        `  ${result} = call ${ret.type} ${callee}(${argList})`,
        `  ret ${signature.returnType} ${result}`,
      );
    } else {
      const raw = temp();
      lines.push(`  ${raw} = call ${ret.type} ${callee}(${argList})`);
      const layout = this.layout.get(signature.returnType);
      const extent = Math.max(
        layout.size,
        ...ret.parts.map((p) => p.offset + this.partSize(p.type)),
      );
      const size = alignTo(extent, 8);
      const buffer = temp();
      lines.push(`  ${buffer} = alloca [${size} x i8], align 8`);
      lines.push(
        `  store [${size} x i8] zeroinitializer, [${size} x i8]* ${buffer}, align 8`,
      );
      ret.parts.forEach((part, partIndex) => {
        let value = raw;
        if (ret.parts.length !== 1 || ret.type !== part.type) {
          value = temp();
          lines.push(
            `  ${value} = extractvalue ${ret.type} ${raw}, ${partIndex}`,
          );
        }
        const pointer = partPointer(buffer, size, part);
        lines.push(
          `  store ${part.type} ${value}, ${part.type}* ${pointer}, align 1`,
        );
      });
      const cast = temp();
      const result = temp();
      lines.push(
        `  ${cast} = bitcast [${size} x i8]* ${buffer} to ${signature.returnType}*`,
        `  ${result} = load ${signature.returnType}, ${signature.returnType}* ${cast}, align 1`,
        `  ret ${signature.returnType} ${result}`,
      );
    }
    lines.push("}");
    return lines;
  }
}

function single(type: string, offset: number): LoweredParam {
  return { type, attributes: "", parts: [{ offset, type }] };
}

function isSseType(type: string): boolean {
  return type === "float" || type === "double" || type === "<2 x float>";
}

function indirectParam(
  type: string,
  arg: { byval: boolean; alignment: number },
): string {
  return arg.byval
    ? `${type}* byval(${type}) align ${arg.alignment}`
    : `${type}*`;
}

function homogeneousFloatingAggregate(info: {
  size: number;
  leaves: Leaf[];
}): { type: "float" | "double"; size: number; count: number } | undefined {
  const first = info.leaves[0];
  if (!first || (first.kind !== "float" && first.kind !== "double")) {
    return undefined;
  }
  const count = info.leaves.length;
  if (count > 4) return undefined;
  const uniform = info.leaves.every(
    (leaf, index) =>
      leaf.kind === first.kind && leaf.offset === index * first.size,
  );
  if (!uniform || info.size !== count * first.size) return undefined;
  return { type: first.kind, size: first.size, count };
}

function singleElement(info: {
  size: number;
  leaves: Leaf[];
}): Part | undefined {
  if (info.leaves.length !== 1) return undefined;
  const leaf = info.leaves[0]!;
  if (leaf.size !== info.size) return undefined;
  if (leaf.kind === "int") return { offset: 0, type: `i${leaf.size * 8}` };
  return { offset: 0, type: leaf.kind === "ptr" ? "i8*" : leaf.kind };
}

function unsupported(what: string): never {
  throw new CAbiUnsupportedError(`Unsupported ${what} in C ABI boundary`);
}

export class CAbiUnsupportedError extends Error {}
