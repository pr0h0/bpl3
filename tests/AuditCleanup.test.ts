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


it("cleans nested match yields without destroying enclosing scopes or moved values", () => {
  expectCorrectnessSuite([{
    name: "match yield scope cleanup",
    validateLlvm: true,
    expectedStdout: "nested\narm\nvalue=7\nenum\nstring\ntuple\nchecks=3\nresource=9\ndestroy 9\nfunction\n",
    source: `
      extern printf(fmt: string, ...);
      enum Choice { Yes, No }
      struct Resource {
        id: int,
        @[auto_destroy] frame destroy(this: *Resource) { printf("destroy %d\\n", this.id); }
      }
      frame main() ret int {
        defer printf("function\\n");
        local n: int = match (true) {
          true => {
            defer printf("arm\\n");
            local inner: int = match (1) {
              1 => { defer printf("nested\\n"); return 7; },
              _ => 0,
            };
            if (inner == 7) { return inner; }
            return 0;
          },
          false => 0,
        };
        printf("value=%d\\n", n);
        local e: int = match (Choice.Yes) {
          Choice.Yes => { defer printf("enum\\n"); return 1; },
          Choice.No => 0,
        };
        local s: int = match ("a") {
          "a" => { defer printf("string\\n"); return 1; },
          _ => 0,
        };
        local t: int = match ((1, true)) {
          (1, true) => { defer printf("tuple\\n"); return 1; },
          _ => 0,
        };
        printf("checks=%d\\n", e + s + t);
        local r: Resource = match (true) {
          true => { local a: Resource = Resource { id: 9 }; return a; },
          false => Resource { id: 0 },
        };
        printf("resource=%d\\n", r.id);
        return 0;
      }
    `,
  }]);
}, 60000);

it("keeps return-transfer exclusions local to each branch", () => {
  expectCorrectnessSuite([{
    name: "conditional resource return",
    validateLlvm: true,
    expectedStdout: "destroy 2\nchosen 1\ndestroy 1\ndestroy 1\nchosen 2\ndestroy 2\n",
    source: `
      extern printf(fmt: string, ...);
      struct Resource {
        id: int,
        @[auto_destroy] frame destroy(this: *Resource) { printf("destroy %d\\n", this.id); }
      }
      frame choose(flag: bool) ret Resource {
        local a: Resource = Resource { id: 1 };
        local b: Resource = Resource { id: 2 };
        if (flag) { if (a.id == 1) { return (a); } }
        return b;
      }
      frame main() ret int {
        { local a: Resource = choose(true); printf("chosen %d\\n", a.id); }
        { local b: Resource = choose(false); printf("chosen %d\\n", b.id); }
        return 0;
      }
    `,
  }]);
}, 60000);
