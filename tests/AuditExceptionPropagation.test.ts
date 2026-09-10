import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";

test("unmatched typed catches propagate through scopes and function calls", () => {
  expectCorrectnessSuite([
    {
      name: "typed catch propagation and cleanup",
      validateLlvm: true,
      expectedStdout:
        "inner defer\nfunction defer\ncaller defer\nouter 42\nfloat 1.75\ncatch all\n",
      source: `
      extern printf(fmt: string, ...);
      frame raise() {
        defer printf("function defer\\n");
        try {
          defer printf("inner defer\\n");
          throw 42;
        } catch (e: bool) { printf("wrong bool %d\\n", e); }
        printf("wrong fallthrough\\n");
      }
      frame main() ret int {
        try {
          defer printf("caller defer\\n");
          raise();
          printf("wrong return\\n");
        } catch (e: int) { printf("outer %d\\n", e); }
        try {
          try { throw 1.75; }
          catch (e: int) { printf("wrong int %d\\n", e); }
          catch (e: bool) { printf("wrong bool %d\\n", e); }
        } catch (e: float) { printf("float %.2f\\n", e); }
        try {
          try { throw 7; } catch (e: bool) { printf("wrong %d\\n", e); }
        } catch { printf("catch all\\n"); }
        return 0;
      }
    `,
    },
  ]);
}, 60000);

test("an unmatched exception without an enclosing handler fails explicitly", () => {
  expectRuntimeFailureSuite([
    {
      name: "unmatched exception is uncaught",
      expectedMessage: "Uncaught exception",
      source: `
      extern printf(fmt: string, ...);
      frame main() ret int {
        try { throw 42; } catch (e: bool) { printf("wrong %d\\n", e); }
        return 0;
      }
    `,
    },
  ]);
}, 60000);
