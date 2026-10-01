import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("resets destroyed queues and preserves FIFO order through wraparound and reuse", () => {
  expectCorrectnessSuite([
    {
      name: "queue lifecycle",
      validateLlvm: true,
      expectedStdout: "queue ok\n",
      source: `
      import [Queue], [QueueIterator] from "std/queue.bpl";
      extern printf(fmt: string, ...);
      import [Array] from "std/array.bpl";
      frame main() ret int {
        local q: Queue<int> = Queue<int>.new(3);
        q.enqueue(1); q.enqueue(2); q.enqueue(3);
        if (q.dequeue().unwrap() != 1) { return 1; }
        q.enqueue(4);
        local wrapped: QueueIterator<int> = q.iterator();
        loop (local expected: int = 2; expected <= 4; expected = expected + 1) {
          if (wrapped.next().unwrap() != expected) { return 8; }
        }
        if (!wrapped.next().isNone()) { return 9; }
        q.enqueue(5);
        loop (local i: int = 2; i <= 5; i = i + 1) {
          if (q.dequeue().unwrap() != i) { return 2; }
        }
        q.enqueue(9); q.destroy();
        if (!q.isEmpty() || q.size() != 0 || q.peek().isSome()) { return 3; }
        q.destroy(); q.enqueue(10);
        if (q.dequeue().unwrap() != 10) { return 4; }
        q.clear(); q.enqueue(11);
        if (q.dequeue().unwrap() != 11) { return 5; }
        q.destroy();
        local z: Queue<int> = Queue<int>.new(0);
        z.enqueue(12);
        if (z.dequeue().unwrap() != 12) { return 6; }
        z.destroy();
        local n: Queue<int> = Queue<int>.new(-7);
        n.enqueue(13);
        if (n.dequeue().unwrap() != 13) { return 7; }
        n.destroy(); printf("queue ok\\n"); return 0;
      }
    `,
    },
  ]);
}, 60000);

it("refuses impossible queue growth before changing its storage", () => {
  expectCorrectnessSuite([{
    name: "queue-growth-limit",
    validateLlvm: true,
    source: `
      import [Queue] from "std/queue.bpl";
      extern strcmp(a: string, b: string) ret int;
      import [Array] from "std/array.bpl";
      frame main() ret int {
        local q: Queue<int> = Queue<int>.new(0);
        # Model the capacity boundary without allocating billions of slots.
        # A full-capacity resize must reject before reading any elements.
        q.inner.capacity = 2147483647;
        local caught: bool = false;
        try { q.resize(); }
        catch (error: string) { caught = strcmp(error, "Queue capacity exceeded") == 0; }
        if (!caught) { return 1; }
        if (q.inner.capacity != 2147483647) { return 2; }
        q.inner.capacity = 0;
        q.enqueue(7);
        if (q.dequeue().unwrap() != 7) { return 3; }
        q.destroy();
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);

it("queue iteration computes wrapped indices without signed overflow", () => {
  expectCorrectnessSuite([{
    name: "queue-large-wrap-index",
    validateLlvm: true,
    source: `
      import [Queue], [QueueIterator] from "std/queue.bpl";
      import [Array] from "std/array.bpl";
      frame main() ret int {
        local q: Queue<int> = Queue<int>.new(4);
        q.enqueue(11); q.enqueue(22); q.enqueue(33);
        # Isolate the index arithmetic: this one iterator step maps to slot 1
        # in our real four-slot storage. No large allocation is necessary.
        q.inner.capacity = 2147483647;
        q.head = 2147483646;
        local it: QueueIterator<int> = q.iterator();
        it.index = 2;
        if (it.next().unwrap() != 22) { return 1; }
        q.inner.capacity = 4;
        q.destroy();
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
