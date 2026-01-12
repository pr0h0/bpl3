import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";

describe("Path", () => {
  it("should normalize paths", () => {
    const program = `
        import [Path] from "std/path.bpl";
        import [String] from "std/string.bpl";
        import [Array] from "std/array.bpl";
        extern printf(fmt: string, ...) ret int;

        frame main() ret int {
            local p1: String = Path.normalize("/a/b/../c");
            printf("Norm1: %s\\n", p1.cstr());
            
            local p2: String = Path.normalize("a/./b");
            printf("Norm2: %s\\n", p2.cstr());
            
            p1.destroy();
            p2.destroy();
            return 0;
        }
        `;
    const result = runBpl(program, "path_test");
    if (result.exitCode !== 0) console.error(result.stderr);
    expect(result.stdout).toContain("Norm1: /a/c");
    expect(result.stdout).toContain("Norm2: a/b");
  });
});
