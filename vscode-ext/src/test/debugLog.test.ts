import { describe, expect, it } from "bun:test";
import { debugLog } from "../services/utils";

describe("LSP debug logging", () => {
  it("does not evaluate lazy messages unless debug logging is enabled", () => {
    const originalDebug = process.env.BPL_LSP_DEBUG;
    const originalError = console.error;
    const messages: string[] = [];
    let evaluations = 0;

    try {
      delete process.env.BPL_LSP_DEBUG;
      console.error = (...args: unknown[]) => {
        messages.push(args.map(String).join(" "));
      };

      debugLog(() => {
        evaluations++;
        return "hidden";
      });

      expect(evaluations).toBe(0);
      expect(messages).toHaveLength(0);

      process.env.BPL_LSP_DEBUG = "1";
      debugLog("visible", () => {
        evaluations++;
        return "payload";
      });

      expect(evaluations).toBe(1);
      expect(messages).toEqual(["visible payload"]);
    } finally {
      if (originalDebug === undefined) {
        delete process.env.BPL_LSP_DEBUG;
      } else {
        process.env.BPL_LSP_DEBUG = originalDebug;
      }
      console.error = originalError;
    }
  });
});
