import { describe, it, expect } from "bun:test";
import { Optimizer } from "../transpiler/optimizer/Optimizer";
import { DeadCodeRule } from "../transpiler/optimizer/rules/DeadCodeRule";
import { MovRegToSameRegRule } from "../transpiler/optimizer/rules/MovRegToSameRegRule";

describe("Optimizer", () => {
  describe("DeadCodeRule", () => {
    it("should remove code after unconditional jump", () => {
      const rule = new DeadCodeRule();
      const lines = [
        "jmp label",
        "mov rax, 1", // Dead code
        "label:",
        "ret",
      ];

      expect(rule.canApply(lines, 0)).toBe(true);

      const result = rule.apply(lines, 0);
      expect(result.newLines).toEqual(["jmp label"]);
      expect(result.skipCount).toBe(2);
    });

    it("should not remove label after jump", () => {
      const rule = new DeadCodeRule();
      const lines = ["jmp label", "label:", "ret"];
      expect(rule.canApply(lines, 0)).toBe(false);
    });
  });

  describe("MovRegToSameRegRule", () => {
    it("should remove mov rax, rax", () => {
      const rule = new MovRegToSameRegRule();
      const lines = ["mov rax, rax"];
      expect(rule.canApply(lines, 0)).toBe(true);
      const result = rule.apply(lines, 0);
      expect(result.newLines).toEqual([]);
      expect(result.skipCount).toBe(1);
    });
  });

  describe("Full Optimizer", () => {
    it("should apply multiple rules", () => {
      const optimizer = new Optimizer(3); // O3 includes all rules
      const input = [
        "mov rax, rax",
        "jmp end",
        "mov rbx, 1",
        "end:",
        "ret",
      ];
      const output = optimizer.optimize(input);
      // mov rax, rax -> removed
      // jmp end -> removed (JmpNextLabelRule)
      // mov rbx, 1 -> removed (DeadCodeRule)
      // end: -> kept
      // ret -> kept

      expect(output).toEqual(["end:", "ret"]);
    });
  });
});
