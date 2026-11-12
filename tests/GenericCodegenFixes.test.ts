import { test } from "bun:test";

import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Found while expanding the standard library (BUG-600, BUG-601, BUG-603).

// spec: R-FN-8, R-LAMBDA-1
test("generic lambda fields, an `entry` parameter and shared type parameter names", () => {
  expectCorrectnessSuite([
    {
      // BUG-600
      name: "lambda-field-of-generic-struct",
      validateLlvm: true,
      source: `extern printf(fmt: string, ...);
struct Holder<T> {
    step: Lambda<T>(),
    frame call(this: *Holder<T>) ret T {
        return this.step();
    }
}
frame main() ret int {
    local h: Holder<int> = Holder<int> { step: || ret int { return 3; } };
    local g: Holder<long> = Holder<long> { step: || ret long { return cast<long>(4); } };
    printf("%d %lld\\n", h.call(), g.call());
    return 0;
}
`,
      expectedStdout: "3 4\n",
    },
    {
      // BUG-601
      name: "parameter-named-entry",
      validateLlvm: true,
      source: `extern printf(fmt: string, ...);
frame f(entry: int) ret int { return entry + 1; }
struct S { frame g(this: *S, entry: int) ret int { return entry * 2; } }
frame main() ret int {
    local s: S = S {};
    local l: Lambda<int>(int) = |entry: int| ret int { return entry - 1; };
    printf("%d %d %d\\n", f(2), s.g(3), l(5));
    return 0;
}
`,
      expectedStdout: "3 6 4\n",
    },
    {
      // BUG-603
      name: "callee-type-parameter-named-like-the-callers",
      validateLlvm: true,
      source: `extern printf(fmt: string, ...);
struct Wrap<T> { value: T, }
frame id<T>(x: T) ret T { return x; }
frame make<T>(producer: Lambda<T>()) ret T { return producer(); }
frame outer<T>(value: T) ret Wrap<T> {
    local w: Wrap<T> = Wrap<T> { value: value };
    local again: Wrap<T> = id<Wrap<T>>(w);
    return make<Wrap<T>>(|| ret Wrap<T> {
        return Wrap<T> { value: again.value };
    });
}
frame main() ret int {
    local w: Wrap<int> = outer<int>(7);
    local l: Wrap<long> = outer<long>(cast<long>(9));
    printf("%d %lld\\n", w.value, l.value);
    return 0;
}
`,
      expectedStdout: "7 9\n",
    },
  ]);
}, 180000);
