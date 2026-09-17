import { describe, expect, it } from "bun:test";

import { compileAndRun } from "./helpers";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

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
        // The handler owns the caught value and destroys it on exit.
        "destroy 4",
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
  it("destroys owned values reached through generic type arguments", () => {
    expectCorrectnessSuite([
      {
        name: "auto-destroy-generic-arguments",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...) ret int;

struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void {
    printf("destroy %d\\n", this.value);
  }
}

struct Box<T> {
  item: T,
}

struct Pair<A, B> {
  left: A,
  right: B,
}

frame boxed() ret void {
  local box: Box<Resource>;
  box.item.value = 70;
}

frame nested() ret void {
  local box: Box<Box<Resource>>;
  box.item.item.value = 71;
}

frame paired() ret void {
  local pair: Pair<int, Resource>;
  pair.left = 1;
  pair.right.value = 72;
  printf("left %d\\n", pair.left);
}

frame elements() ret void {
  local boxes: Box<Resource>[2];
  boxes[0].item.value = 73;
  boxes[1].item.value = 74;
}

frame holdsTypeParameter<T>(seed: int) ret int {
  local held: T;
  local probe: *T = &held;
  return seed + cast<int>(probe != nullptr);
}

frame main() ret int {
  boxed();
  nested();
  paired();
  elements();
  # The type parameter is only known for this instance, and its value is
  # never assigned, so the zeroed storage is what gets destroyed.
  printf("held %d\\n", holdsTypeParameter<Resource>(10));
  printf("done\\n");
  return 0;
}`,
        expectedStdout: [
          "destroy 70",
          "destroy 71",
          "left 1",
          "destroy 72",
          "destroy 74",
          "destroy 73",
          "destroy 0",
          "held 11",
          "done",
          "",
        ].join("\n"),
      },
    ]);
  }, 60000);
  it("destroys owned tuple elements and destructured locals", () => {
    expectCorrectnessSuite([
      {
        name: "auto-destroy-tuples",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...) ret int;

struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void {
    printf("d%d ", this.value);
  }
}

struct Pair {
  left: Resource,
  right: Resource,
}

frame tuples() ret void {
  local a: Resource;
  a.value = 1;
  local b: Resource;
  b.value = 2;
  local both: (Resource, int, Resource) = (a, 9, b);
  local (ta: Resource, tn: int, tb: Resource) = both;
  printf("t%d%d%d ", ta.value, tn, tb.value);
}

frame destructured() ret void {
  local p: Pair;
  p.left.value = 4;
  p.right.value = 5;
  local (x: Resource, y: Resource) = (p.left, p.right);
  printf("x%d y%d ", x.value, y.value);
}

frame main() ret int {
  tuples();
  printf("| ");
  destructured();
  printf("\\n");
  return 0;
}`,
        // Each copy is destroyed once, in reverse declaration order: the
        // destructured locals, then the tuple's elements, then the originals.
        expectedStdout: "t192 d2 d1 d2 d1 d2 d1 | x4 y5 d5 d4 d5 d4 \n",
      },
    ]);
  }, 60000);

  it("rejects an enum payload that owns a destructor", () => {
    expectCheckDiagnostics([
      {
        name: "auto-destroy-enum-tuple-payload",
        source: `struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void { this.value = 0; }
}
enum Slot { Has(Resource), Empty }
frame main() ret int {
  local s: Slot = Slot.Empty;
  return match (s) { Slot.Has(r) => r.value, Slot.Empty => 0, };
}`,
        code: "BPL_AUTO_DESTROY_ENUM_PAYLOAD",
      },
      {
        name: "auto-destroy-enum-generic-argument",
        // The declaration cannot see what T stands for, so the instantiation
        // is what reveals the owning payload.
        source: `struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void { this.value = 0; }
}
enum Slot<T> { Has(T), Empty }
frame main() ret int {
  local s: Slot<Resource> = Slot<Resource>.Empty;
  return match (s) { Slot<Resource>.Has(r) => r.value, Slot<Resource>.Empty => 0, };
}`,
        code: "BPL_AUTO_DESTROY_ENUM_PAYLOAD",
      },
      {
        name: "auto-destroy-enum-safe-instantiation-first",
        // A safe instantiation must not stand in for an unsafe one: the two
        // differ only by pointer depth, which a name-only key discards.
        source: `struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void { this.value = 0; }
}
enum Slot<T> { Has(T), Empty }
frame main() ret int {
  local safe: Slot<*Resource> = Slot<*Resource>.Empty;
  local bad: Slot<Resource> = Slot<Resource>.Empty;
  return match (safe) { Slot<*Resource>.Has(r) => 1, Slot<*Resource>.Empty => 0, }
    + match (bad) { Slot<Resource>.Has(r) => r.value, Slot<Resource>.Empty => 0, };
}`,
        code: "BPL_AUTO_DESTROY_ENUM_PAYLOAD",
      },
      {
        name: "auto-destroy-enum-nested-argument-differs",
        // Box<int> and Box<Resource> differ only in a nested argument.
        source: `struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void { this.value = 0; }
}
struct Box<T> { value: T }
enum Slot<T> { Has(T), Empty }
frame main() ret int {
  local safe: Slot<Box<int>> = Slot<Box<int>>.Empty;
  local bad: Slot<Box<Resource>> = Slot<Box<Resource>>.Empty;
  return match (safe) { Slot<Box<int>>.Has(b) => b.value, Slot<Box<int>>.Empty => 0, }
    + match (bad) { Slot<Box<Resource>>.Has(b) => b.value.value, Slot<Box<Resource>>.Empty => 0, };
}`,
        code: "BPL_AUTO_DESTROY_ENUM_PAYLOAD",
      },
      {
        name: "auto-destroy-enum-nested-wrapper-substitution",
        // The parameter sits two wrappers deep in the payload type.
        source: `struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void { this.value = 0; }
}
struct Box<T> { value: T }
enum Slot<T> { Has(Box<Box<T>>), Empty }
frame main() ret int {
  local bad: Slot<Resource> = Slot<Resource>.Empty;
  return match (bad) {
    Slot<Resource>.Has(b) => b.value.value.value,
    Slot<Resource>.Empty => 0,
  };
}`,
        code: "BPL_AUTO_DESTROY_ENUM_PAYLOAD",
      },
      {
        name: "auto-destroy-enum-generic-wrapper",
        source: `struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void { this.value = 0; }
}
struct Box<T> { value: T }
enum Slot { Has(Box<Resource>), Empty }
frame main() ret int {
  local s: Slot = Slot.Empty;
  return match (s) { Slot.Has(b) => b.value.value, Slot.Empty => 0, };
}`,
        code: "BPL_AUTO_DESTROY_ENUM_PAYLOAD",
      },
      {
        name: "auto-destroy-enum-alias-payload",
        source: `struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void { this.value = 0; }
}
type Held = Resource;
enum Slot { Has(Held), Empty }
frame main() ret int {
  local s: Slot = Slot.Empty;
  return match (s) { Slot.Has(r) => r.value, Slot.Empty => 0, };
}`,
        code: "BPL_AUTO_DESTROY_ENUM_PAYLOAD",
      },
      {
        name: "auto-destroy-enum-struct-payload",
        source: `struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void { this.value = 0; }
}
struct Holder { inner: Resource }
enum Slot { Has { held: Holder }, Empty }
frame main() ret int {
  local s: Slot = Slot.Empty;
  return match (s) { Slot.Has { held: h } => h.inner.value, Slot.Empty => 0, };
}`,
        code: "BPL_AUTO_DESTROY_ENUM_PAYLOAD",
      },
    ]);
  }, 60000);
  // A by-value argument is a bitwise copy, and BPL has no move semantics, so
  // destroying the callee's copy double-frees whatever the caller still owns.
  // Callee-side parameter cleanup is therefore withheld until copying an owning
  // value is rejected; see BUG-367.
  it.skip("destroys a by-value parameter when the callee returns", () => {
    expectCorrectnessSuite([
      {
        name: "auto-destroy-parameters",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...) ret int;

struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void {
    printf("d%d ", this.value);
  }
  frame consume(this: *Resource, other: Resource) ret int {
    return this.value + other.value;
  }
}

frame passThrough(r: Resource) ret Resource {
  return r;
}

frame two(a: Resource, b: Resource) ret int {
  return a.value + b.value;
}

frame throwsHolding(r: Resource) ret int {
  if (r.value > 0) { throw 5; }
  return 0;
}

frame main() ret int {
  local x: Resource;
  x.value = 1;
  local y: Resource;
  y.value = 2;
  {
    # The parameter is returned, so the callee moves it instead of destroying it.
    local moved: Resource = passThrough(x);
    printf("moved%d ", moved.value);
  }
  printf("| ");
  # 'this' is a pointer and is not owned; the by-value argument is.
  printf("m%d ", x.consume(y));
  printf("| ");
  printf("n%d ", two(x, y));
  printf("| ");
  try { throwsHolding(x); } catch (e: int) { printf("c%d ", e); }
  printf("| end\\n");
  return 0;
}`,
        // main's own locals are destroyed after the final newline is printed.
        expectedStdout: "moved1 d1 | d2 m3 | d2 d1 n3 | d1 c5 | end\nd2 d1 ",
      },
    ]);
  }, 60000);
  it("destroys a caught value when its handler exits", () => {
    expectCorrectnessSuite([
      {
        name: "auto-destroy-catch-binding",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...) ret int;

struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void {
    printf("d%d ", this.value);
  }
}

frame make(value: int) ret Resource {
  local r: Resource;
  r.value = value;
  return r;
}

frame thrower(value: int) ret int {
  throw make(value);
}

frame main() ret int {
  try {
    try {
      thrower(7);
    } catch (first: Resource) {
      printf("f%d ", first.value);
      # The handler is left by a throw, and its binding is still destroyed.
      throw make(8);
    }
  } catch (second: Resource) {
    printf("s%d ", second.value);
  }
  printf("| ");
  try {
    thrower(9);
  } catch (e: int) {
    printf("never ");
  } catch (r: Resource) {
    printf("r%d ", r.value);
  }
  printf("end\\n");
  return 0;
}`,
        expectedStdout: "f7 d7 s8 d8 | r9 d9 end\n",
      },
    ]);
  }, 60000);
  it("allows an enum payload that only borrows an owning type", () => {
    expectCorrectnessSuite([
      {
        name: "auto-destroy-enum-slice-payload",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...) ret int;

struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void {
    printf("d%d ", this.value);
  }
}

# A slice borrows its elements, so the enum owns nothing and cleanup has
# nothing to select from the tag.
enum Slot { Has(Resource[]), Empty }

frame describe(s: Slot) ret int {
  return match (s) {
    Slot.Has(items) => items[0].value,
    Slot.Empty => 0,
  };
}

frame main() ret int {
  local items: Resource[2];
  items[0].value = 1;
  items[1].value = 2;
  local held: Slot = Slot.Has(items);
  printf("%d %d | ", describe(held), describe(Slot.Empty));
  return 0;
}`,
        // Only the array's own elements are destroyed, in reverse order.
        expectedStdout: "1 0 | d2 d1 ",
      },
    ]);
  }, 60000);
  it("destroys an owner nested under repeated generic wrappers", () => {
    expectCorrectnessSuite([
      {
        name: "auto-destroy-repeated-wrappers",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...) ret int;

struct Resource {
  value: int,
  @[auto_destroy]
  frame destroy(this: *Resource) ret void {
    printf("d%d ", this.value);
  }
}

struct Box<T> { value: T }
struct Pair<A, B> { first: A, second: B }

frame main() ret int {
  # Each wrapper repeats the same declaration, so a cycle guard that keys on
  # names alone mistakes the field for its own enclosing type.
  local deep: Box<Box<Box<Resource>>>;
  deep.value.value.value.value = 9;

  local mixed: Pair<Box<int>, Box<Resource>>;
  mixed.second.value.value = 2;

  local both: Pair<Box<Resource>, Box<Resource>>;
  both.first.value.value = 3;
  both.second.value.value = 4;

  printf("| ");
  return 0;
}`,
        expectedStdout: "| d4 d3 d2 d9 ",
      },
    ]);
  }, 60000);
});
