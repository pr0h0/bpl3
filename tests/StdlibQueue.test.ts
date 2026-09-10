import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("resets destroyed queues and preserves FIFO order through wraparound and reuse", () => {
  expectCorrectnessSuite([
    {
      name: "queue lifecycle",
      validateLlvm: true,
      expectedStdout: "queue ok\n",
      source: `
      import [Queue] from "std/queue.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        local q: Queue<int> = Queue<int>.new(3);
        q.enqueue(1); q.enqueue(2); q.enqueue(3);
        if (q.dequeue().unwrap() != 1) { return 1; }
        q.enqueue(4); q.enqueue(5);
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
