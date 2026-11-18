import { describe, expect, it } from "bun:test";

import { compileAndRun, compileToLLVM } from "./helpers";

// BUG-824: a loop that only reads a global pointer reads a local copy, so the
// global is loaded (and null-checked) once instead of on every iteration.
function functionBody(ir: string, name: string): string {
  const match = ir.match(
    new RegExp(`^define[^\\n]*@${name}[^\\n]*\\{[\\s\\S]*?^\\}`, "m"),
  );
  expect(match).not.toBeNull();
  return match![0];
}

function globalLoads(body: string, global: string): number {
  return body.split("\n").filter((line) => line.includes(`** @${global}`))
    .length;
}

function compile(source: string, optimizationLevel = 2): string {
  return compileToLLVM(source, "loop_global_snapshots.bpl", {
    optimizationLevel,
  });
}

const TABLE = `
global TAB: *int = nullptr;

frame main() ret int {
    return 0;
}
`;

describe("loop snapshots of global pointers", () => {
  it("reads a global pointer through a copy made before the loop", () => {
    const ir = compile(`${TABLE}
      frame scale(t: *int, n: int) {
          loop (local i: int = 0; i < n; i = i + 1) {
              t[i] = TAB[i] + 1;
          }
      }
    `);
    const body = functionBody(ir, "scale_");
    expect(body).toContain("%TAB.copy_ptr");
    expect(globalLoads(body, "TAB")).toBe(1);
    const loop = body.slice(body.indexOf("cond."));
    expect(globalLoads(loop, "TAB")).toBe(0);
  });

  it("keeps reading the global at -O0", () => {
    const body = functionBody(
      compile(
        `${TABLE}
        frame scale(t: *int, n: int) {
            loop (local i: int = 0; i < n; i = i + 1) {
                t[i] = TAB[i];
            }
        }
      `,
        0,
      ),
      "scale_",
    );
    expect(body).not.toContain("copy_ptr");
  });

  const unsafeLoops: [string, string][] = [
    [
      "the loop calls a function",
      `frame reset() { TAB = nullptr; }
       frame scale(t: *int, n: int) {
           loop (local i: int = 0; i < n; i = i + 1) {
               t[i] = TAB[i];
               reset();
           }
       }`,
    ],
    [
      "the loop assigns the global",
      `frame scale(t: *int, n: int) {
           loop (local i: int = 0; i < n; i = i + 1) {
               t[i] = TAB[i];
               TAB = t;
           }
       }`,
    ],
    [
      "the loop declares a lambda",
      `frame scale(t: *int, n: int) {
           loop (local i: int = 0; i < n; i = i + 1) {
               local read: Lambda<int>() = || ret int { return TAB[0]; };
               t[i] = TAB[i] + read();
           }
       }`,
    ],
    [
      "the global's address is taken anywhere",
      `global SLOT: **int = nullptr;
       frame keep() { SLOT = &TAB; }
       frame scale(t: *int, n: int) {
           loop (local i: int = 0; i < n; i = i + 1) {
               t[i] = TAB[i];
           }
       }`,
    ],
    [
      "the global is exported",
      `export TAB;
       frame scale(t: *int, n: int) {
           loop (local i: int = 0; i < n; i = i + 1) {
               t[i] = TAB[i];
           }
       }`,
    ],
  ];
  for (const [reason, source] of unsafeLoops) {
    it(`does not copy the global when ${reason}`, () => {
      const body = functionBody(compile(`${TABLE}\n${source}`), "scale_");
      expect(body).not.toContain("TAB.copy_ptr");
    });
  }

  it("copies only pointer globals that are not const", () => {
    const body = functionBody(
      compile(`${TABLE}
        global COUNT: int = 3;
        frame scale(t: *int) {
            loop (local i: int = 0; i < COUNT; i = i + 1) {
                t[i] = TAB[i];
            }
        }
      `),
      "scale_",
    );
    expect(body).toContain("TAB.copy_ptr");
    expect(body).not.toContain("COUNT.copy_ptr");
  });

  it("copies once for nested loops and again on each outer iteration", () => {
    const body = functionBody(
      compile(`${TABLE}
        frame sum(n: int) ret int {
            local total: int = 0;
            loop (local i: int = 0; i < n; i = i + 1) {
                loop (local j: int = 0; j < n; j = j + 1) {
                    total = total + TAB[i * n + j];
                }
            }
            return total;
        }
      `),
      "sum_",
    );
    expect((body.match(/TAB\.copy_ptr\.\d+ = alloca/g) ?? []).length).toBe(1);
  });

  it("computes the same results as reading the global", () => {
    const output = compileAndRun(
      `
      extern printf(fmt: string, ...) ret int;
      global TAB: *int = nullptr;
      global OTHER: *int = nullptr;

      frame fill(t: *int, n: int) {
          loop (local i: int = 0; i < n; i = i + 1) {
              t[i] = TAB[i] * 2;
          }
      }

      frame swapEach(t: *int, n: int) {
          loop (local i: int = 0; i < n; i = i + 1) {
              t[i] = TAB[0];
              local held: *int = TAB;
              TAB = OTHER;
              OTHER = held;
          }
      }

      frame main() ret int {
          local a: int[4] = [1, 2, 3, 4];
          local b: int[4] = [9, 9, 9, 9];
          local out: int[4] = [0, 0, 0, 0];
          TAB = &a[0];
          OTHER = &b[0];
          fill(&out[0], 4);
          printf("%d %d %d %d\\n", out[0], out[1], out[2], out[3]);
          swapEach(&out[0], 4);
          printf("%d %d %d %d\\n", out[0], out[1], out[2], out[3]);
          return 0;
      }
    `,
      { args: ["-O", "2"] },
    );
    expect(output).toBe("2 4 6 8\n1 9 1 9\n");
  });
});
