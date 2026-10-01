import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("heap leaves stop before child-index arithmetic can overflow", () => {
  expectCorrectnessSuite([{
    name: "heap-large-leaf",
    validateLlvm: true,
    source: `
      import [PriorityQueue] from "std/priority_queue.bpl";
      import [Array] from "std/array.bpl";
      frame main() ret int {
        local heap: PriorityQueue<int> = PriorityQueue<int>.new(0);
        # Model a large heap's leaf indices. Leaves have no children, so
        # siftDown must return without reading the backing allocation.
        heap.items.length = 2147483647;
        heap.siftDown(1073741823);
        heap.siftDown(1073741824);
        heap.siftDown(2147483646);
        heap.items.length = 0;
        heap.destroy();
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);

const values = [-2147483648, 2147483647, ...Array.from({length: 80}, (_, i) => (i * 31) % 29 - 14)];
test("priority queues preserve sorted order through growth and repeated removal", () => {
  expectCorrectnessSuite([{
    name: "heap-order-model",
    validateLlvm: true,
    source: `
      import [PriorityQueue] from "std/priority_queue.bpl";
      extern printf(fmt: string, ...);
      import [Array] from "std/array.bpl";
      frame main() ret int {
        local heap: PriorityQueue<int> = PriorityQueue<int>.new(0);
        local values: int[${values.length}] = [${values.map(v => `cast<int>(${v})`).join(", ")}];
        loop (local i: int = 0; i < ${values.length}; i = i + 1) { heap.push(values[i]); }
        loop (!heap.isEmpty()) { printf("%d\\n", heap.pop().unwrap()); }
        if (!heap.pop().isNone()) { return 1; }
        heap.destroy();
        return 0;
      }`,
    expectedStdout: [...values].sort((a, b) => a - b).join("\n") + "\n",
  }]);
}, 60000);
