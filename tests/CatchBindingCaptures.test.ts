import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// BUG-481: deferred code and lambdas inside a catch clause could not capture
// the clause's variable. A `defer` failed with "Cannot resolve type for
// captured variable", and a lambda loaded from an undefined pointer.
it("captures a catch variable in deferred code and lambdas", () => {
  expectCorrectnessSuite([
    {
      name: "catch binding captured by defer and lambdas",
      validateLlvm: true,
      expectedStdout:
        "loop 7\nloop 7\nlambda 10\nstruct 5\nint lambda 6\ndouble 7\nouter 99\n",
      source: `
      extern printf(fmt: string, ...);
      struct Err {
          code: int,
      }
      frame main() ret int {
          local e: long = cast<long>(99);
          try {
              throw 7;
          } catch (e: int) {
              local i: int = 0;
              loop (i < 2) {
                  i = i + 1;
                  defer printf("loop %d\\n", e);
              }
          }
          try {
              throw Err { code: 5 };
          } catch (e: Err) {
              defer printf("struct %d\\n", e.code);
              local f: Lambda<int>() = || ret int {
                  return e.code * 2;
              };
              printf("lambda %d\\n", f());
          }
          try {
              throw 3;
          } catch (e: int) {
              local g: Lambda<int>() = || ret int {
                  return e * 2;
              };
              printf("int lambda %d\\n", g());
          }
          try {
              throw 3.5;
          } catch (e: double) {
              defer printf("double %d\\n", cast<int>(e * 2.0));
          }
          printf("outer %lld\\n", e);
          return 0;
      }
    `,
    },
  ]);
}, 60000);
