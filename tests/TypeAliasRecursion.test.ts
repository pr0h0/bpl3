import { test } from "bun:test";
import { expect } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { compileAndRunFull } from "./helpers";

// A generic argument is a type in its own right, so naming an alias inside its
// own argument is not a cycle: `Identity<Identity<int>>` expands finitely to
// `int`. Naming it in the alias body still is a cycle.
test("a generic alias may appear in its own type argument", () => {
  expectCorrectnessSuite([
    {
      name: "nested-generic-alias",
      validateLlvm: true,
      source: `
      import printf from "std/c.bpl";
      type Identity<T> = T;
      type Pair<T> = T[2];

      frame main() ret int {
        local once: Identity<int> = 7;
        local twice: Identity<Identity<int>> = 8;
        local thrice: Identity<Identity<Identity<int>>> = 9;
        local nestedArray: Identity<Pair<int>> = [1, 2];
        printf("%d %d %d %d\\n", once, twice, thrice, nestedArray[1]);
        return 0;
      }`,
      expectedStdout: "7 8 9 2\n",
    },
  ]);
}, 60000);

test("recursive aliases are still rejected", () => {
  // These are rejected today by the type checker rather than by a dedicated
  // cycle diagnostic, so the assertion is that they do not compile. What
  // matters for the nested-argument fix is that they still fail.
  const cases = [
    `type Bad = Bad;
frame main() ret int { local value: Bad = 1; return 0; }`,
    `type A = B;
type B = A;
frame main() ret int { local value: A = 1; return 0; }`,
    `type Bad<T> = Bad<T>;
frame main() ret int { local value: Bad<int> = 1; return 0; }`,
  ];

  for (const source of cases) {
    const result = compileAndRunFull(source);
    expect(result.exitCode).not.toBe(0);
  }
}, 60000);
