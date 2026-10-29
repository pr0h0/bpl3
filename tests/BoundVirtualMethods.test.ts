import { test } from "bun:test";
import {
  expectCleanFailureSuite,
  expectCorrectnessSuite,
} from "./helpers/compilerCorrectness";

const generic = `
struct Parent<T> {
  frame value(this: *Parent<T>) ret T { return cast<T>(1); }
}
struct Child<T>: Parent<T> {
  frame value(this: *Child<T>) ret T { return cast<T>(2); }
}
`;

test("bound generic parent methods retain the derived override", () => {
  expectCorrectnessSuite([
    {
      name: "bound-generic-parent-override",
      source:
        generic +
        `
    frame read(value: *Parent<int>) ret int {
      local call: Lambda<int>() = value.value;
      return call();
    }
    frame main() ret int {
      local child: Child<int>;
      local base: *Parent<int> = &child;
      local call: Lambda<int>() = base.value;
      if (call() != 2 || read(base) != 2) { return 1; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("bound non-generic parent methods retain the derived override", () => {
  expectCorrectnessSuite([
    {
      name: "bound-plain-parent-override",
      source: `
    struct Parent { frame value(this: *Parent) ret int { return 1; } }
    struct Child: Parent { frame value(this: *Child) ret int { return 2; } }
    frame main() ret int {
      local child: Child;
      local base: *Parent = &child;
      local call: Lambda<int>() = base.value;
      if (call() != 2) { return 1; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("bound virtual value receivers copy the derived layout on each call", () => {
  expectCorrectnessSuite([
    {
      name: "bound-virtual-value-receiver",
      source: `
    struct Parent {
      item: int,
      frame value(this: Parent) ret int { return this.item; }
    }
    struct Child: Parent {
      extra: int,
      frame value(this: Child) ret int { this.item = this.item + this.extra; return this.item; }
    }
    frame main() ret int {
      local child: Child;
      child.item = 3; child.extra = 7;
      local base: *Parent = &child;
      local call: Lambda<int>() = base.value;
      if (call() != 10 || child.item != 3) { return 1; }
      child.extra = 11;
      if (call() != 14 || child.item != 3) { return 2; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("bound virtual receivers are evaluated once and borrow the selected object", () => {
  expectCorrectnessSuite([
    {
      name: "bound-virtual-receiver-once",
      source:
        generic +
        `
    global evaluations: int = 0;
    frame receiver(value: *Parent<int>) ret *Parent<int> {
      evaluations = evaluations + 1; return value;
    }
    frame main() ret int {
      local child: Child<int>;
      local base: *Parent<int> = &child;
      local call: Lambda<int>() = receiver(base).value;
      base = nullptr;
      if (call() != 2 || call() != 2 || evaluations != 1) { return 1; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("bound generic pointer aliases preserve virtual dispatch and null diagnostics", () => {
  expectCorrectnessSuite([
    {
      name: "bound-virtual-alias-null",
      source:
        generic +
        `
    type ParentRef = *Parent<int>;
    frame receiver(value: ParentRef) ret ParentRef { return value; }
    frame main() ret int {
      local child: Child<int>;
      local base: ParentRef = &child;
      local call: Lambda<int>() = receiver(base).value;
      if (call() != 2) { return 1; }
      base = nullptr;
      local caught: bool = false;
      try { local invalid: Lambda<int>() = base.value; invalid(); }
      catch (_error: NullAccessError) { caught = true; }
      if (!caught) { return 2; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("bound virtual methods retain arguments in their checked signature", () => {
  expectCorrectnessSuite([
    {
      name: "bound-virtual-arguments",
      source: `
    struct Parent {
      frame value(this: *Parent, _input: int) ret int { return 1; }
    }
    struct Child: Parent {
      frame value(this: *Child, _input: int) ret int { return 2; }
    }
    frame main() ret int {
      local child: Child;
      local base: *Parent = &child;
      local integer: Lambda<int>(int) = base.value;
      if (integer(41) != 2) { return 1; }
      return 0;
    }`,
    },
  ]);
}, 60000);

test("variadic value receiver methods are rejected at declaration", () => {
  expectCleanFailureSuite([
    {
      name: "bound-virtual-variadic-value",
      source: `
    struct Value {
      frame sum(this: Value, values: ...int, count: int) ret int {
        return values[0] + count;
      }
    }
    frame main() ret int {
      local value: Value;
      local call: Lambda<int>(int, int) = value.sum;
      return call(1, 0);
    }`,
      expectedMessage: "cannot have a native variadic parameter",
    },
  ]);
}, 30000);
