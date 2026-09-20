import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Every shape a sort tends to be wrong about: already ordered, reversed, all
// equal, heavy duplicates, wide random values, and an organ pipe. Each is run
// through all three integer sorts and checked against the order computed here.
const shapes: Record<string, (n: number) => number[]> = {
  sorted: (n) => Array.from({ length: n }, (_, i) => i),
  reversed: (n) => Array.from({ length: n }, (_, i) => n - i),
  equal: (n) => Array.from({ length: n }, () => 7),
  duplicates: (n) => Array.from({ length: n }, (_, i) => ((i * 7) % 5) - 2),
  wide: (n) => Array.from({ length: n }, (_, i) => ((i * 2654435761) % 2000003) - 1000000),
  organPipe: (n) => [
    ...Array.from({ length: Math.floor(n / 2) }, (_, i) => i),
    ...Array.from({ length: Math.ceil(n / 2) }, (_, i) => Math.ceil(n / 2) - i),
  ],
};

// Sizes either side of the cutoff where the sort stops recursing and finishes
// with insertion sort, and either side of a power of two.
const sizes = [0, 1, 2, 3, 5, 11, 12, 13, 17, 32, 33, 64, 100];

const cases: { values: number[]; id: number }[] = [];
for (const size of sizes) {
  for (const build of Object.values(shapes)) {
    cases.push({ values: build(size), id: cases.length });
  }
}

const body: string[] = [];
const expected: string[] = [];
for (const { values, id } of cases) {
  const n = values.length;
  if (n > 0) {
    body.push(`  local v${id}: int[${n}] = [${values.join(", ")}];`);
  }
  for (const [tag, call] of [
    ["asc", "Algorithm.sortAsc(&a)"],
    ["desc", "Algorithm.sortDesc(&a)"],
    ["quick", "Algorithm.quickSort(&a)"],
  ] as const) {
    body.push(
      `  { local a: Array<int> = Array<int>.new(${Math.max(n, 1)});`,
      n > 0 ? `    fill(&a, &v${id}[0], ${n});` : "",
      `    ${call};`,
      `    dump("${tag}", ${id}, &a); a.destroy(); }`,
    );
    const order = [...values].sort((x, y) => (tag === "desc" ? y - x : x - y));
    expected.push(`${tag} ${id}${order.map((v) => ` ${v}`).join("")}`);
  }
}

test("every integer sort orders every shape of input", () => {
  expectCorrectnessSuite([
    {
      name: "sorting-shapes",
      validateLlvm: true,
      source: `
      import [Array] from "std/array.bpl";
      import [Algorithm] from "std/algorithm.bpl";
      import printf from "std/c.bpl";

      frame fill(a: *Array<int>, values: *int, n: int) {
        loop (local i: int = 0; i < n; i = i + 1) { a.push(*(values + i)); }
      }

      frame dump(tag: string, id: int, a: *Array<int>) {
        printf("%s %d", tag, id);
        loop (local i: int = 0; i < a.len(); i = i + 1) { printf(" %d", a.get(i)); }
        printf("\\n");
      }

      frame main() ret int {
${body.filter((line) => line !== "").join("\n")}
        return 0;
      }`,
      expectedStdout: `${expected.join("\n")}\n`,
    },
  ]);
}, 180000);

// quickSort took the last element as its pivot, so an already-sorted array was
// its worst case: each partition peeled off one element and the recursion went
// as deep as the array was long. 50000 ordered elements overflowed the stack.
// The bubble sorts behind sortAsc and sortDesc did not crash but needed n^2
// comparisons, so the same array took billions of them.
test("sorting a large array stays within the stack and finishes quickly", () => {
  expectCorrectnessSuite([
    {
      name: "sorting-at-scale",
      validateLlvm: true,
      source: `
      import [Array] from "std/array.bpl";
      import [Algorithm] from "std/algorithm.bpl";
      import printf from "std/c.bpl";

      # 0: ordered, 1: reversed, 2: all equal, 3: scattered.
      frame build(n: int, mode: int) ret Array<int> {
        local a: Array<int> = Array<int>.new(n);
        loop (local i: int = 0; i < n; i = i + 1) {
          if (mode == 0) { a.push(i); }
          else if (mode == 1) { a.push(n - i); }
          else if (mode == 2) { a.push(7); }
          else { a.push((i * 2654435761) % 1000); }
        }
        return a;
      }

      frame main() ret int {
        local n: int = 50000;
        local failures: int = 0;

        loop (local mode: int = 0; mode < 4; mode = mode + 1) {
          local quick: Array<int> = build(n, mode);
          Algorithm.quickSort(&quick);
          if (!Algorithm.isSorted(&quick)) { failures = failures + 1; }

          local heap: Array<int> = build(n, mode);
          Algorithm.sortAsc(&heap);
          if (!Algorithm.isSorted(&heap)) { failures = failures + 1; }

          # The two sorts must agree element for element, not merely each
          # report itself sorted.
          if (!Algorithm.equals(&quick, &heap)) { failures = failures + 1; }

          local down: Array<int> = build(n, mode);
          Algorithm.sortDesc(&down);
          loop (local i: int = 1; i < n; i = i + 1) {
            if (down.get(i - 1) < down.get(i)) { failures = failures + 1; }
          }
          # Descending is the ascending order reversed.
          loop (local j: int = 0; j < n; j = j + 1) {
            if (down.get(j) != heap.get((n - 1) - j)) { failures = failures + 1; }
          }

          quick.destroy(); heap.destroy(); down.destroy();
        }

        printf("%d\\n", failures);
        return 0;
      }`,
      expectedStdout: "0\n",
    },
  ]);
}, 180000);

test("float sorting and binary search agree with the ordering", () => {
  expectCorrectnessSuite([
    {
      name: "sorting-floats-and-search",
      validateLlvm: true,
      source: `
      import [Array] from "std/array.bpl";
      import [Algorithm] from "std/algorithm.bpl";
      import printf from "std/c.bpl";

      frame main() ret int {
        local failures: int = 0;

        # Descending input is the worst case for the sort that was here.
        local f: Array<float> = Array<float>.new(1000);
        loop (local i: int = 0; i < 1000; i = i + 1) {
          f.push(cast<float>(1000 - i) / 7.0);
        }
        Algorithm.sortAsc(&f);
        loop (local i: int = 1; i < 1000; i = i + 1) {
          if (f.get(i - 1) > f.get(i)) { failures = failures + 1; }
        }
        if (f.get(0) != (1.0 / 7.0)) { failures = failures + 1; }

        # Every element of a sorted array must be found, and the index
        # returned must hold the value asked for.
        local ints: Array<int> = Array<int>.new(8);
        loop (local k: int = 0; k < 500; k = k + 1) { ints.push(k * 3); }
        loop (local k: int = 0; k < 500; k = k + 1) {
          local at: int = Algorithm.binarySearch(&ints, k * 3);
          if (at < 0) { failures = failures + 1; }
          else { if (ints.get(at) != (k * 3)) { failures = failures + 1; } }
          # A value between two elements is absent.
          if (Algorithm.binarySearch(&ints, (k * 3) + 1) != -1) {
            failures = failures + 1;
          }
        }
        if (Algorithm.binarySearch(&ints, -1) != -1) { failures = failures + 1; }

        local none: Array<int> = Array<int>.new(1);
        if (Algorithm.binarySearch(&none, 0) != -1) { failures = failures + 1; }

        printf("%d\\n", failures);
        f.destroy(); ints.destroy(); none.destroy();
        return 0;
      }`,
      expectedStdout: "0\n",
    },
  ]);
}, 120000);
