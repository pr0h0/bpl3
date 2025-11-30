import type { IOptimizationRule } from "./OptimizerRule";
import { MovToPushPopRule } from "./rules/MovToPushPopRule";
import { MovToPushRule } from "./rules/MovToPushRule";
import { RedundantPushPopRule } from "./rules/RedundantPushPopRule";
import { MovZeroRule } from "./rules/MovZeroRule";
import { MovRegToSameRegRule } from "./rules/MovRegToSameRegRule";
import { AddSubZeroRule } from "./rules/AddSubZeroRule";
import { JmpNextLabelRule } from "./rules/JmpNextLabelRule";
import { CmpZeroRule } from "./rules/CmpZeroRule";
import { MulByOneRule } from "./rules/MulByOneRule";
import { MulByZeroRule } from "./rules/MulByZeroRule";
import { IncDecRule } from "./rules/IncDecRule";
import { PushPopMoveRule } from "./rules/PushPopMoveRule";
import { DeadCodeRule } from "./rules/DeadCodeRule";
import { MovConstToMemRule } from "./rules/MovConstToMemRule";

export class Optimizer {
  private rules: IOptimizationRule[] = [];

  constructor(level: number = 3) {
    if (level >= 1) {
      this.rules.push(new MovRegToSameRegRule());
      this.rules.push(new MovZeroRule());
      this.rules.push(new AddSubZeroRule());
      this.rules.push(new MulByOneRule());
      this.rules.push(new MulByZeroRule());
      this.rules.push(new IncDecRule());
    }

    if (level >= 2) {
      this.rules.push(new RedundantPushPopRule());
      this.rules.push(new JmpNextLabelRule());
      this.rules.push(new CmpZeroRule());
      this.rules.push(new MovConstToMemRule());
    }

    if (level >= 3) {
      this.rules.push(new DeadCodeRule());
      this.rules.push(new MovToPushPopRule());
      this.rules.push(new MovToPushRule());
      this.rules.push(new PushPopMoveRule());
    }

    this.sortRules();
  }
  public addRule(rule: IOptimizationRule) {
    this.rules.push(rule);
    this.sortRules();
  }

  private sortRules() {
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  public optimize(lines: string[]): string[] {
    let optimized = [...lines];
    let changed = true;

    while (changed) {
      changed = false;
      const newLines: string[] = [];

      for (let i = 0; i < optimized.length; i++) {
        const line = optimized[i];
        if (!line) continue;

        let ruleApplied = false;
        for (const rule of this.rules) {
          if (rule.canApply(optimized, i)) {
            const result = rule.apply(optimized, i);
            if (result.newLines) {
              newLines.push(...result.newLines);
            }
            i += result.skipCount - 1; // -1 because loop increments i
            changed = true;
            ruleApplied = true;
            break; // Apply one rule at a time per position
          }
        }

        if (!ruleApplied) {
          newLines.push(line);
        }
      }
      optimized = newLines;
    }
    return optimized;
  }
}
