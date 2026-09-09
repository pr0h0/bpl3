import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("restores exception handlers when break and continue exit a try scope", () => {
  expectCorrectnessSuite([{
    name: "try handler lifetime on loop exits",
    validateLlvm: true,
    expectedStdout: "break defer\nouter 7\ncontinue defer\nouter 8\n",
    source: `
      extern printf(fmt: string, ...);
      frame main() ret int {
        try {
          loop {
            try { defer printf("break defer\\n"); break; }
            catch { printf("stale break handler\\n"); return 1; }
          }
          throw 7;
        } catch (e: int) { printf("outer %d\\n", e); }
        try {
          loop (local i: int = 0; i < 1; i = i + 1) {
            try { defer printf("continue defer\\n"); continue; }
            catch { printf("stale continue handler\\n"); return 1; }
          }
          throw 8;
        } catch (e: int) { printf("outer %d\\n", e); }
        return 0;
      }
    `,
  }]);
}, 60000);

it("restores try handlers on function returns and match yields", () => {
  expectCorrectnessSuite([{
    name: "try handler lifetime on value exits",
    validateLlvm: true,
    expectedStdout: "3 4 9\nouter 11\n",
    source: `
      extern printf(fmt: string, ...);
      frame leave(flag: bool) ret int {
        try { if (flag) { return 3; } return 4; }
        catch { return -1; }
        return -2;
      }
      frame main() ret int {
        try {
          local a: int = leave(true);
          local b: int = leave(false);
          local m: int = match (true) {
            true => {
              try { return 9; }
              catch { printf("stale yield handler\\n"); return -1; }
              return -2;
            },
            false => 0,
          };
          printf("%d %d %d\\n", a, b, m);
          throw 11;
        } catch (e: int) { printf("outer %d\\n", e); }
        return 0;
      }
    `,
  }]);
}, 60000);

it("retains handlers for inner loop exits and exceptions during deferred cleanup", () => {
  expectCorrectnessSuite([{
    name: "try cleanup boundaries",
    validateLlvm: true,
    expectedStdout: "inner 5\ndeferred 6\nouter 7\n",
    source: `
      extern printf(fmt: string, ...);
      frame main() ret int {
        try {
          try { loop { break; } throw 5; }
          catch (e: int) { printf("inner %d\\n", e); }
          try { defer { throw 6; } }
          catch (e: int) { printf("deferred %d\\n", e); }
          throw 7;
        } catch (e: int) { printf("outer %d\\n", e); }
        return 0;
      }
    `,
  }]);
}, 60000);
