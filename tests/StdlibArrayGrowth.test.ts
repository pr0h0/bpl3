import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Array.new(-5) asked malloc for a negative size, which became a huge size_t
// and returned null; the array reported a capacity of -5 and the first push
// wrote through the null pointer. push also doubled the capacity in int, so a
// large array wrapped into a small or failed allocation and was written past,
// and neither allocation was ever checked.
test("an array with an impossible capacity does not write through a null", () => {
  expectCorrectnessSuite([
    {
      name: "array-capacity-guards",
      validateLlvm: true,
      source: `
      import [Array] from "std/array.bpl";
      import printf from "std/c.bpl";

      frame main() ret int {
        # A negative capacity is an empty array, as it is for Deque and Queue.
        local a: Array<int> = Array<int>.new(-5);
        if (a.capacity != 0) { return 1; }
        if (a.len() != 0) { return 2; }
        a.push(7);
        if (a.len() != 1) { return 3; }
        if (a.get(0) != 7) { return 4; }

        # Growth from zero and across several doublings keeps every element.
        loop (local i: int = 1; i < 1000; i = i + 1) { a.push(i * 3); }
        if (a.len() != 1000) { return 5; }
        if (a.get(0) != 7) { return 6; }
        loop (local j: int = 1; j < 1000; j = j + 1) {
          if (a.get(j) != (j * 3)) { return 7; }
        }
        if (a.capacity < 1000) { return 8; }

        # A clone of a grown array is independent and equal.
        local copy: Array<int> = a.clone();
        if (copy.len() != a.len()) { return 9; }
        copy.set(0, -1);
        if (a.get(0) != 7) { return 10; }

        a.destroy();
        copy.destroy();
        printf("array ok\\n");
        return 0;
      }`,
      expectedStdout: "array ok\n",
    },
  ]);
}, 120000);

// rangeStep divided by its step before looking at it, so a step of zero ended
// the program with a division by zero. Range.len() answers 0 for that case,
// and rangeStep now agrees. Every row below matches Python's range().
const rangeCases: [number, number, number][] = [
  [0, 10, 1],
  [0, 10, 3],
  [10, 0, -2],
  [0, 0, 1],
  [5, 5, -1],
  [0, 10, 0],
  [-5, 5, 2],
  [5, -5, -3],
  [0, 1, 5],
  [1, 0, 1],
  [0, -10, -1],
  [-3, -1, 1],
  [2147483646, 2147483647, 2],
  [-2147483647, -2147483648, -2],
  [-2147483648, 2147483647, 2147483647],
  [2147483647, -2147483648, -2147483648],
];

function pythonRange(start: number, stop: number, step: number): number[] {
  if (step === 0) return [];
  const out: number[] = [];
  for (let i = start; step > 0 ? i < stop : i > stop; i += step) out.push(i);
  return out;
}

test("rangeStep produces the same values as range() for every step", () => {
  const body = rangeCases
    .map(
      ([start, stop, step]) => `
        { local r: Array<int> = Algorithm.rangeStep(${start}, ${stop}, ${step});
          printf("${start},${stop},${step} %d", r.len());
          loop (local i: int = 0; i < r.len(); i = i + 1) { printf(" %d", r.get(i)); }
          printf("\\n"); r.destroy(); }`,
    )
    .join("\n");
  const expected = rangeCases
    .map(([start, stop, step]) => {
      const values = pythonRange(start, stop, step);
      return `${start},${stop},${step} ${values.length}${values.map((v) => ` ${v}`).join("")}`;
    })
    .join("\n");

  expectCorrectnessSuite([
    {
      name: "range-step",
      validateLlvm: true,
      source: `
      import [Array] from "std/array.bpl";
      import [Algorithm] from "std/algorithm.bpl";
      import printf from "std/c.bpl";

      frame main() ret int {
${body}
        return 0;
      }`,
      expectedStdout: `${expected}\n`,
    },
  ]);
}, 120000);
