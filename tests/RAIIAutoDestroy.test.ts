import { describe, expect, it } from "bun:test";

import { compileAndRun } from "./helpers";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

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
  it("destroys owned array elements and struct fields", () => {
    expectCorrectnessSuite([
      {
        name: "auto-destroy-owned-elements-and-fields",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...) ret int;

struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void {
    printf("destroy %d\\n", this.value);
  }
}

struct Holder {
  first: Resource,
  tag: int,
  second: Resource,
}

struct Owner {
  inner: Resource,
  tag: int,
  @[auto_destroy]
  frame destroy(this: *Owner) ret void {
    printf("owner %d\\n", this.tag);
  }
}

frame elements() ret void {
  local items: Resource[2];
  items[0].value = 10;
  items[1].value = 11;
}

frame grid() ret void {
  local cells: Resource[2][2];
  cells[0][0].value = 20;
  cells[0][1].value = 21;
  cells[1][0].value = 22;
  cells[1][1].value = 23;
}

frame fields() ret void {
  local holder: Holder;
  holder.first.value = 30;
  holder.second.value = 31;
}

frame ownerFirst() ret void {
  local owner: Owner;
  owner.inner.value = 40;
  owner.tag = 41;
}

frame main() ret int {
  elements();
  grid();
  fields();
  ownerFirst();
  printf("done\\n");
  return 0;
}`,
        expectedStdout: [
          // Elements and fields are destroyed in reverse declaration order.
          "destroy 11",
          "destroy 10",
          "destroy 23",
          "destroy 22",
          "destroy 21",
          "destroy 20",
          "destroy 31",
          "destroy 30",
          // A value's own destructor runs before the fields it owns.
          "owner 41",
          "destroy 40",
          "done",
          "",
        ].join("\n"),
      },
    ]);
  }, 60000);

  it("destroys owned elements and fields when a throw leaves their scope", () => {
    expectCorrectnessSuite([
      {
        name: "auto-destroy-owned-throw",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...) ret int;

struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void {
    printf("destroy %d\\n", this.value);
  }
}

struct Holder {
  only: Resource,
}

frame throwsHoldingElements() ret int {
  local items: Resource[2];
  items[0].value = 50;
  items[1].value = 51;
  local holder: Holder;
  holder.only.value = 52;
  throw 7;
}

frame main() ret int {
  try {
    throwsHoldingElements();
  } catch (e: int) {
    printf("caught %d\\n", e);
  }
  return 0;
}`,
        expectedStdout: [
          "destroy 52",
          "destroy 51",
          "destroy 50",
          "caught 7",
          "",
        ].join("\n"),
      },
    ]);
  }, 60000);

  it("does not destroy the fields of a local moved by return", () => {
    expectCorrectnessSuite([
      {
        name: "auto-destroy-moved-fields",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...) ret int;

struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void {
    printf("destroy %d\\n", this.value);
  }
}

struct Holder {
  only: Resource,
}

frame makeHolder() ret Holder {
  local holder: Holder;
  holder.only.value = 60;
  return holder;
}

frame main() ret int {
  local holder: Holder = makeHolder();
  printf("held %d\\n", holder.only.value);
  return 0;
}`,
        // The returned value is moved, so its field is destroyed once, by main.
        expectedStdout: ["held 60", "destroy 60", ""].join("\n"),
      },
    ]);
  }, 60000);

  it("zeroes an uninitialized local before its destructor reads it", () => {
    expectCorrectnessSuite([
      {
        name: "auto-destroy-zeroed-storage",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...) ret int;

struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void {
    printf("destroy %d\\n", this.value);
  }
}

frame noise() ret void {
  local pad: int[32];
  loop (local i: int = 0; i < 32; i = i + 1) {
    pad[i] = 777;
  }
}

frame untouched() ret void {
  local items: Resource[2];
  if (items[1].value != 0) {
    printf("stale %d\\n", items[1].value);
  }
}

frame main() ret int {
  noise();
  untouched();
  printf("done\\n");
  return 0;
}`,
        // Without zeroing, the destructor would read whatever noise() left.
        expectedStdout: ["destroy 0", "destroy 0", "done", ""].join("\n"),
      },
    ]);
  }, 60000);
});
