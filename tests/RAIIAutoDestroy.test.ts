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
});
