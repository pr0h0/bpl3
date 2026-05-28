import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { ModuleCache } from "../compiler/middleend/ModuleCache";

const EMPTY_MAIN_IR = `
  define i32 @main() {
  entry:
    ret i32 0
  }
`;

describe("ModuleCache", () => {
  it("keeps separate object cache entries per optimization level", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-module-cache-"));

    try {
      const cache = new ModuleCache(dir);
      const o0 = cache.compileModule(
        "main.bpl",
        "frame main() ret int { return 0; }",
        EMPTY_MAIN_IR,
        false,
        undefined,
        0,
      );
      const o3 = cache.compileModule(
        "main.bpl",
        "frame main() ret int { return 0; }",
        EMPTY_MAIN_IR,
        false,
        undefined,
        3,
      );

      expect(o3).not.toBe(o0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
