import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const parent = `
struct Parent<T> {
  frame value(this: *Parent<T>) ret T { return cast<T>(1); }
  frame take(this: *Parent<T>, input: T) ret T { return input; }
}
struct Child<T>: Parent<T> {
  frame value(this: *Child<T>) ret T { return cast<T>(2); }
  frame take(this: *Child<T>, _input: T) ret T { return cast<T>(2); }
}
`;

test("generic parent pointer dispatches inside a free function", () => {
  expectCorrectnessSuite([
    {
      name: "generic-parent-free-function",
      source:
        parent +
        `
    frame read(value: *Parent<int>) ret int { return value.value(); }
    frame main() ret int {
      local child: Child<int>;
      local base: *Parent<int> = &child;
      if (base.value() != 2 || read(base) != 2) { return 1; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("generic method arguments retain override dispatch inside a free function", () => {
  expectCorrectnessSuite([
    {
      name: "generic-parent-argument-free-function",
      source:
        parent +
        `
    frame read(value: *Parent<int>) ret int { return value.take(41); }
    frame main() ret int {
      local child: Child<int>;
      local base: *Parent<int> = &child;
      if (base.take(41) != 2 || read(base) != 2) { return 1; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("generic parent aliases retain virtual dispatch inside a free function", () => {
  expectCorrectnessSuite([
    {
      name: "generic-parent-alias-free-function",
      source:
        parent +
        `
    type IntegerParent = Parent<int>;
    frame read(value: *IntegerParent) ret int { return value.value(); }
    frame main() ret int {
      local child: Child<int>;
      local base: *IntegerParent = &child;
      if (read(base) != 2) { return 1; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("logical Array getters retain override dispatch inside a free function", () => {
  expectCorrectnessSuite([
    {
      name: "logical-array-free-function",
      source: `
    import [Array] from "std/array.bpl";
    struct LogicalArray<T>: Array<T> {
      frame get(this: *LogicalArray<T>, _index: int) ret T { return cast<T>(2); }
    }
    frame read(value: *Array<float>) ret float { return value.get(0); }
    frame main() ret int {
      local child: LogicalArray<float>;
      child.data = nullptr;
      child.capacity = 0;
      child.length = 0;
      child.push(1.0);
      local base: *Array<float> = &child;
      local direct: float = base.get(0);
      local indirect: float = read(base);
      child.destroy();
      if (direct != 2.0 || indirect != 2.0) { return 1; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("non-generic parent dispatch through free functions remains valid", () => {
  expectCorrectnessSuite([
    {
      name: "plain-parent-free-function",
      source: `
    struct Parent { frame value(this: *Parent) ret int { return 1; } }
    struct Child: Parent { frame value(this: *Child) ret int { return 2; } }
    frame read(value: *Parent) ret int { return value.value(); }
    frame main() ret int {
      local child: Child;
      if (read(&child) != 2) { return 1; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("inherited generic methods preserve differently named class arguments", () => {
  expectCorrectnessSuite([
    {
      name: "inherited-generic-argument-bindings",
      source: `
    struct Parent<T> {
      frame echo(this: *Parent<T>, input: T) ret T { return input; }
    }
    struct Child<U>: Parent<U> {}
    frame read(value: *Child<int>) ret int { return value.echo(41); }
    frame main() ret int {
      local child: Child<int>;
      if (read(&child) != 41) { return 1; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("transitive generic parents preserve virtual overrides in free functions", () => {
  expectCorrectnessSuite([
    {
      name: "transitive-generic-virtual-dispatch",
      source: `
    struct Parent<T> { frame value(this: *Parent<T>) ret T { return cast<T>(1); } }
    struct Middle<U>: Parent<U> {}
    struct Child<V>: Middle<V> {
      frame value(this: *Child<V>) ret V { return cast<V>(2); }
    }
    frame read(value: *Parent<int>) ret int { return value.value(); }
    frame main() ret int {
      local child: Child<int>;
      if (read(&child) != 2) { return 1; }
      return 0;
    }`,
    },
  ]);
}, 60000);
