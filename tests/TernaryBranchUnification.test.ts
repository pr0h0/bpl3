import { expect, test } from "bun:test";
import { compileAndRun } from "./helpers/compileAndRun";

// BUG-425: ternary branches were joined by a phi without conversion, so mixed
// widths, callables and slices produced invalid LLVM IR or wrong values.
test("ternary branches are converted to their common type", () => {
  const output = compileAndRun(`import printf from "std/c.bpl";
frame dbl(x: int) ret int { return x * 2; }
frame main() ret int {
    local b: bool = true;
    local n: bool = false;
    local u: u8 = 200;
    local i: int = 70000;
    local r1: int = b ? u : i;
    local r2: int = n ? u : i;
    local r3: int = n ? u : 300;
    printf("%d %d %d\\n", r1, r2, r3);
    local l: Lambda<int>(int) = n ? |x: int| ret int { return x + 1; } : dbl;
    local m: Lambda<int>(int) = b ? |x: int| ret int { return x + 1; } : dbl;
    printf("%d %d\\n", l(4), m(4));
    local arr: int[3] = [1, 2, 3];
    local sl: int[] = arr;
    local s2: int[] = n ? sl : arr;
    printf("%d\\n", s2[2]);
    return 0;
}
`);
  expect(output).toBe("200 70000 300\n8 5\n3\n");
});
