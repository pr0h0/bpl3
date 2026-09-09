import { describe, it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

describe("Audit scope-exit regressions", () => {
  it("runs case cleanup before numeric and string fallthrough in LIFO order", () => {
    expectCorrectnessSuite([{
      name: "fallthrough cleanup",
      validateLlvm: true,
      expectedStdout: "one\ninner\nsecond\nfirst\ntwo\ncase-two\nthree\nstring\nnext\nouter\n",
      source: `
        extern printf(fmt: string, ...);
        frame main() ret int {
          defer printf("outer\\n");
          switch (1) {
            case 1:
              defer printf("first\\n");
              defer printf("second\\n");
              printf("one\\n");
              { defer printf("inner\\n"); }
              fallthrough;
            case 2:
              defer printf("case-two\\n");
              printf("two\\n");
              fallthrough;
            default: printf("three\\n"); break;
          }
          switch ("a") {
            case "a": defer printf("string\\n"); fallthrough;
            default: printf("next\\n"); break;
          }
          return 0;
        }
      `,
    }]);
  }, 60000);
});
