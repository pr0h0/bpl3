import { describe, expect, it } from "bun:test";

import { compileAndRun } from "./helpers";

describe("RAII automatic destroy", () => {
  it("destroys value locals when a scope falls through", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      global destroyed: int = 0;

      struct Resource {
        value: int,
        @[auto_destroy]
        frame destroy(this: *Resource) ret void {
          destroyed = destroyed + this.value;
        }
      }

      frame scoped() ret void {
        local resource: Resource;
        resource.value = 3;
      }

      frame main() ret int {
        scoped();
        printf("%d\\n", destroyed);
        return 0;
      }
    `);

    expect(output).toBe("3\n");
  });

  it("destroys value locals before an early return", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      global destroyed: int = 0;

      struct Resource {
        value: int,
        @[auto_destroy]
        frame destroy(this: *Resource) ret void {
          destroyed = destroyed + this.value;
        }
      }

      frame early() ret int {
        local resource: Resource;
        resource.value = 5;
        return 9;
      }

      frame main() ret int {
        local result: int = early();
        printf("%d:%d\\n", result, destroyed);
        return 0;
      }
    `);

    expect(output).toBe("9:5\n");
  });

  it("does not destroy a local moved by direct return", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      global destroyed: int = 0;

      struct Resource {
        value: int,
        @[auto_destroy]
        frame destroy(this: *Resource) ret void {
          destroyed = destroyed + this.value;
        }
      }

      frame makeResource() ret Resource {
        local resource: Resource;
        resource.value = 11;
        return resource;
      }

      frame main() ret int {
        local resource: Resource = makeResource();
        printf("%d:%d\\n", resource.value, destroyed);
        return 0;
      }
    `);

    expect(output).toBe("11:0\n");
  });

  it("does not destroy locals whose destructor is not explicitly marked", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      global destroyed: int = 0;

      struct Resource {
        value: int,
        frame destroy(this: *Resource) ret void {
          destroyed = destroyed + this.value;
        }
      }

      frame scoped() ret void {
        local resource: Resource;
        resource.value = 7;
      }

      frame main() ret int {
        scoped();
        printf("%d\\n", destroyed);
        return 0;
      }
    `);

    expect(output).toBe("0\n");
  });

  it("destroys value locals when a throw leaves their scope", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      struct Resource {
        value: int,
        @[auto_destroy]
        frame destroy(this: *Resource) ret void {
          printf("destroy %d\\n", this.value);
        }
      }

      frame throwsAfterAcquiring() ret int {
        local held: Resource;
        held.value = 1;
        throw 5;
      }

      frame throwsInsideTry() ret int {
        local outer: Resource;
        outer.value = 2;
        try {
          local inner: Resource;
          inner.value = 3;
          throw 6;
        } catch (e: int) {
          printf("caught %d\\n", e);
        }
        return 0;
      }

      frame movesIntoThrow() ret int {
        local moved: Resource;
        moved.value = 4;
        local kept: Resource;
        kept.value = 5;
        throw moved;
      }

      frame loopThrow() ret int {
        loop (local i: int = 0; i < 3; i += 1) {
          local each: Resource;
          each.value = 10 + i;
          if (i == 1) { throw 7; }
        }
        return 0;
      }

      frame main() ret int {
        try { throwsAfterAcquiring(); } catch (e: int) { printf("caught %d\\n", e); }
        throwsInsideTry();
        try { movesIntoThrow(); } catch (r: Resource) { printf("caught res %d\\n", r.value); }
        try { loopThrow(); } catch (e: int) { printf("caught %d\\n", e); }
        return 0;
      }
    `);

    expect(output).toBe(
      [
        "destroy 1",
        "caught 5",
        "destroy 3",
        "caught 6",
        "destroy 2",
        "destroy 5",
        "caught res 4",
        "destroy 10",
        "destroy 11",
        "caught 7",
        "",
      ].join("\n"),
    );
  });
});
