import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";
import * as path from "path";

describe("Semantic Types", () => {
  it("should compile type definitions", () => {
    const srcDir = path.resolve(process.cwd(), "src");
    const typesPath = path.join(srcDir, "types.bpl");

    const code = `
        import [Type] from "${typesPath}";
        import [TypeKind] from "${typesPath}";
        import [String] from "std/string.bpl";
        
        frame main() ret int {
            local t: Type;
            t.kind = TypeKind.Int;
            t.size = 4;
            t.name = String.new("int");
            
            if (t.isInteger()) {
                return 0;
            }
            return 1;
        }
    `;

    const result = runBpl(code, "types_test");
    if (result.exitCode !== 0) console.error(result.stderr);
    expect(result.exitCode).toBe(0);
  });
});
