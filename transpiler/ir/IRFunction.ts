import { IRBlock } from "./IRBlock";

import type { IRType } from "./IRType";

export class IRFunction {
  public blocks: IRBlock[] = [];

  constructor(
    public name: string,
    public args: { name: string; type: IRType }[],
    public returnType: IRType,
    public isVariadic: boolean = false, // Add this
  ) {}

  addBlock(block: IRBlock) {
    this.blocks.push(block);
  }

  toString(): string {
    const argsStr = this.args
      .map((a) => `${a.name}: ${JSON.stringify(a.type)}`)
      .join(", ");
    const signatureArgs = this.isVariadic
      ? argsStr
        ? argsStr + ", ..."
        : "..."
      : argsStr;
    return (
      `define ${this.name}(${signatureArgs}) -> ${JSON.stringify(this.returnType)} {\n` +
      this.blocks.map((b) => b.toString()).join("\n") +
      "\n}"
    );
  }
}
