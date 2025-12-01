import type AsmGenerator from "../../transpiler/AsmGenerator";
import Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import type BlockExpr from "./blockExpr";
import Expression from "./expr";
import NumberLiteralExpr from "./numberLiteralExpr";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";

export type SwitchCase = {
  value: NumberLiteralExpr;
  body: BlockExpr;
};

export default class SwitchExpr extends Expression {
  constructor(
    public discriminant: Expression,
    public cases: SwitchCase[],
    public defaultCase: BlockExpr | null,
  ) {
    super(ExpressionType.SwitchExpression);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth() + "[ SwitchExpr ]\n";
    this.depth++;
    output += this.getDepth() + " Discriminant:\n";
    output += this.discriminant.toString(depth + 1);

    for (const c of this.cases) {
      output += this.getDepth() + ` Case ${c.value.value}:\n`;
      output += c.body.toString(depth + 1);
    }

    if (this.defaultCase) {
      output += this.getDepth() + " Default:\n";
      output += this.defaultCase.toString(depth + 1);
    }

    this.depth--;
    output += this.getDepth() + "/[ SwitchExpr ]\n";
    return output;
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    if (this.startToken) gen.emitSourceLocation(this.startToken.line);

    const label = gen.generateLabel("switch_");
    const endLabel = `${label}_end`;
    const defaultLabel = this.defaultCase ? `${label}_default` : endLabel;

    // 1. Evaluate discriminant
    this.discriminant.transpile(gen, scope);
    // Result is in RAX

    // 2. Analyze cases for Jump Table
    const caseValues = this.cases.map((c) => ({
      val: Number(c.value.value),
      block: c.body,
      label: gen.generateLabel(`${label}_case_${c.value.value}_`),
    }));

    // Sort by value
    caseValues.sort((a, b) => a.val - b.val);

    if (caseValues.length === 0) {
      // No cases, just evaluate discriminant (for side effects) and exit
      return;
    }

    const minVal = caseValues[0]!.val;
    const maxVal = caseValues[caseValues.length - 1]!.val;
    const range = maxVal - minVal;
    const count = caseValues.length;

    // Heuristic for Jump Table:
    // 1. Range is not too huge (e.g. < 1024) to avoid massive tables for sparse cases like 0 and 1000000
    // 2. Density is reasonable (e.g. > 50%) OR range is small enough (< 64) that density doesn't matter much.
    // For now, let's be generous with jump tables as requested.
    const useJumpTable = range < 256 || (range < 2048 && count / range > 0.5);

    if (useJumpTable) {
      const tableLabel = `${label}_jumptable`;

      // Calculate offset
      gen.emit(
        `sub rax, ${minVal}`,
        `Switch: normalize discriminant (min: ${minVal})`,
      );
      gen.emit(`cmp rax, ${range}`, `Switch: check range (max-min: ${range})`);
      gen.emit(`ja ${defaultLabel}`, `Switch: jump to default if out of range`);

      gen.emit(
        `lea rbx, [rel ${tableLabel}]`,
        `Switch: load jump table address`,
      );
      gen.emit(`jmp [rbx + rax * 8]`, `Switch: indirect jump`);

      // Generate Jump Table
      const tableEntries: string[] = [];
      let currentVal = minVal;
      let caseIdx = 0;

      for (let i = 0; i <= range; i++) {
        const targetVal = minVal + i;
        if (
          caseIdx < caseValues.length &&
          caseValues[caseIdx]!.val === targetVal
        ) {
          tableEntries.push(caseValues[caseIdx]!.label);
          caseIdx++;
        } else {
          tableEntries.push(defaultLabel);
        }
      }

      gen.emitData(tableLabel, "dq", tableEntries.join(", "));
    } else {
      // Fallback: Linear scan (or Binary Search could be implemented here)
      // For now, simple linear scan (O(N))
      // Or better: Binary Search (O(log N))?
      // Let's do linear for simplicity if jump table fails, as user asked for O(1) dispatch specifically.
      // If they asked for O(1), they probably provide dense keys.

      // Linear scan implementation:
      for (const c of caseValues) {
        gen.emit(`cmp rax, ${c.val}`, `Switch: check case ${c.val}`);
        gen.emit(`je ${c.label}`, `Switch: jump to case ${c.val}`);
      }
      gen.emit(`jmp ${defaultLabel}`, `Switch: jump to default`);
    }

    // 3. Generate Case Bodies
    for (const c of caseValues) {
      gen.emitLabel(c.label);
      c.block.transpile(gen, scope);
      gen.emit(`jmp ${endLabel}`, `Switch: break`);
    }

    // 4. Generate Default Body
    if (this.defaultCase) {
      gen.emitLabel(defaultLabel);
      this.defaultCase.transpile(gen, scope);
      gen.emit(`jmp ${endLabel}`, `Switch: break`);
    }

    gen.emitLabel(endLabel);
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    const val = this.discriminant.generateIR(gen, scope);

    const endLabel = gen.generateLabel("switch_end");
    const defaultLabel = this.defaultCase
      ? gen.generateLabel("switch_default")
      : endLabel;

    const cases: { val: number; label: string; block: BlockExpr }[] = [];
    for (const c of this.cases) {
      cases.push({
        val: Number(c.value.value),
        label: gen.generateLabel(`switch_case_${c.value.value}`),
        block: c.body,
      });
    }

    const caseList = cases
      .map((c) => `i64 ${c.val}, label %${c.label}`)
      .join(" ");
    gen.emit(`switch i64 ${val}, label %${defaultLabel} [ ${caseList} ]`);

    for (const c of cases) {
      gen.emitLabel(c.label);
      c.block.generateIR(gen, scope);
      gen.emit(`br label %${endLabel}`);
    }

    if (this.defaultCase) {
      gen.emitLabel(defaultLabel);
      this.defaultCase.generateIR(gen, scope);
      gen.emit(`br label %${endLabel}`);
    }

    gen.emitLabel(endLabel);
    return "";
  }
}
