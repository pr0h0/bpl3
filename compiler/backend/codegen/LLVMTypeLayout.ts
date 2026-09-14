/** Byte layout for the LLVM types emitted by BPL, using the selected data layout.
 * Runtime sizeof/reflection still use LLVM constant expressions directly. */
export interface TypeLayout {
  size: number;
  alignment: number;
  offsets?: number[];
}
export const alignTo = (size: number, alignment: number): number =>
  Math.ceil(size / alignment) * alignment;

export class LLVMTypeLayout {
  constructor(
    private readonly dataLayout: string,
    private readonly lookup: (name: string) => string,
  ) {}

  aggregate(fields: TypeLayout[], packed = false): TypeLayout {
    let size = 0,
      alignment = 1;
    const offsets: number[] = [];
    for (const field of fields) {
      const align = packed ? 1 : field.alignment;
      size = alignTo(size, align);
      offsets.push(size);
      size += field.size;
      alignment = Math.max(alignment, align);
    }
    return { size: alignTo(size, alignment), alignment, offsets };
  }

  get(type: string, visiting = new Set<string>()): TypeLayout {
    type = type.trim();
    if (type.endsWith("*") || type === "ptr") {
      const pointer = this.dataLayout.match(/(?:^|-)p(?:0)?:([0-9]+):([0-9]+)/);
      return {
        size: Number(pointer?.[1] ?? 64) / 8,
        alignment: Number(pointer?.[2] ?? 64) / 8,
      };
    }
    if (type === "void") return { size: 0, alignment: 1 };
    const scalar = /^(?:i([0-9]+)|(float|double))$/.exec(type);
    if (scalar) {
      const floatingBits = type === "float" ? 32 : 64;
      const bits = scalar[1] ? Number(scalar[1]) : floatingBits;
      const prefix = scalar[1] ? "i" : "f";
      const explicit = this.dataLayout.match(
        new RegExp(`(?:^|-)${prefix}${bits}:([0-9]+)`),
      );
      // LLVM's default i64 ABI alignment is 32 bits; supported 64-bit BPL
      // targets and wasm explicitly override it to 64 bits.
      const fallback = prefix === "i" ? Math.min(Math.max(bits, 8), 32) : bits;
      const alignment = Number(explicit?.[1] ?? fallback) / 8;
      return { size: alignTo(Math.ceil(bits / 8), alignment), alignment };
    }
    const array = /^\[(\d+) x (.*)\]$/.exec(type);
    if (array) {
      const element = this.get(array[2]!, visiting);
      const size = Number(array[1]) * element.size;
      if (!Number.isSafeInteger(size))
        throw new Error(`LLVM array layout exceeds exact size range: ${type}`);
      return { size, alignment: element.alignment };
    }
    const packed = type.startsWith("<{") && type.endsWith("}>");
    if (packed || (type.startsWith("{") && type.endsWith("}"))) {
      const body = type.slice(packed ? 2 : 1, packed ? -2 : -1);
      const fields: string[] = [];
      let start = 0,
        depth = 0;
      for (let i = 0; i < body.length; i++) {
        if ("([{<".includes(body[i]!)) depth++;
        else if (")]}>".includes(body[i]!)) depth--;
        else if (body[i] === "," && depth === 0) {
          fields.push(body.slice(start, i));
          start = i + 1;
        }
      }
      if (body.slice(start).trim()) fields.push(body.slice(start));
      return this.aggregate(
        fields.map((field) => this.get(field, visiting)),
        packed,
      );
    }
    if (type.startsWith("%")) {
      if (visiting.has(type))
        throw new Error(`Recursive by-value LLVM type: ${type}`);
      const next = new Set(visiting);
      next.add(type);
      return this.get(this.lookup(type), next);
    }
    throw new Error(`Unsupported LLVM layout type: ${type}`);
  }
}
