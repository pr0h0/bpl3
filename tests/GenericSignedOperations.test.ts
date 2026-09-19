import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// A type parameter names no type of its own, so a signedness check by name
// answered "unsigned" for it, and every operation that depends on signedness
// silently took the unsigned form inside a generic frame.
test("signed operations keep their sign through a type parameter", () => {
  expectCorrectnessSuite([
    {
      name: "generic-signed-operations",
      validateLlvm: true,
      source: `
      import printf from "std/c.bpl";

      frame lessThan<T>(a: T, b: T) ret bool { return a < b; }
      frame greaterThan<T>(a: T, b: T) ret bool { return a > b; }
      frame atMost<T>(a: T, b: T) ret bool { return a <= b; }
      frame divide<T>(a: T, b: T) ret T { return a / b; }
      frame widen<T>(a: T) ret long { return cast<long>(a); }
      frame smaller<T>(a: T, b: T) ret T {
        if (a < b) { return a; }
        return b;
      }

      frame main() ret int {
        # Each of these was the unsigned answer before: false, true, false,
        # 2147483644, 4294967291, and 3.
        printf("%d %d %d %d %ld %d\\n",
          cast<int>(lessThan<int>(-2, 1)),
          cast<int>(greaterThan<int>(1, -2)),
          cast<int>(atMost<int>(-2, -2)),
          divide<int>(-7, 2),
          widen<int>(-5),
          smaller<int>(-2, 3));

        # The same through other signed widths, and unsigned left alone.
        printf("%d %d %d %d\\n",
          cast<int>(lessThan<long>(cast<long>(-2), cast<long>(1))),
          cast<int>(lessThan<i8>(cast<i8>(-2), cast<i8>(1))),
          cast<int>(lessThan<u32>(cast<u32>(1), cast<u32>(2))),
          cast<int>(lessThan<float>(-2.5, 1.0)));
        return 0;
      }`,
      expectedStdout: "1 1 1 -3 -5 -2\n1 1 1 1\n",
    },
  ]);
}, 60000);

// The priority queue compares values of its element type, so negative
// elements sank instead of rising: the smallest came out last.
test("a priority queue orders negative elements correctly", () => {
  expectCorrectnessSuite([
    {
      name: "priority-queue-negative",
      validateLlvm: true,
      source: `
      import [PriorityQueue] from "std/priority_queue.bpl";
      import [Option] from "std/option.bpl";
      import printf from "std/c.bpl";

      frame value(held: Option<int>) ret int {
        return match (held) {
          Option<int>.Some(found) => found,
          Option<int>.None => -999,
        };
      }

      frame main() ret int {
        local queue: PriorityQueue<int> = PriorityQueue<int>.new(4);
        local data: int[11] = [5, 3, 9, 1, 7, 3, 8, 0, -2, 12, 6];
        loop (local i: int = 0; i < 11; i = i + 1) {
          queue.push(data[i]);
        }
        printf("%d", value(queue.peek()));
        loop (local j: int = 0; j < 11; j = j + 1) {
          printf(" %d", value(queue.pop()));
        }
        printf(" %d\\n", value(queue.pop()));
        return 0;
      }`,
      expectedStdout: "-2 -2 0 1 3 3 5 6 7 8 9 12 -999\n",
    },
  ]);
}, 60000);
