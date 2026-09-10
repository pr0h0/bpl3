import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("matches an array model for mixed deque operations", () => {
  const model: number[] = [];
  const statements: string[] = [];
  const output: number[] = [];
  let seed = 12345;
  for (let i = 0; i < 160; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const op = (seed >>> 16) % 6;
    if (op <= 1) {
      model.unshift(i);
      statements.push(`d.pushFront(${i});`);
    } else if (op <= 3) {
      model.push(i);
      statements.push(`d.pushBack(${i});`);
    } else if (op === 4) {
      output.push(model.shift() ?? -1);
      statements.push('printf("%d\\n", d.popFront().unwrapOr(-1));');
    } else {
      output.push(model.pop() ?? -1);
      statements.push('printf("%d\\n", d.popBack().unwrapOr(-1));');
    }
  }
  expectCorrectnessSuite([
    {
      name: "deque mixed operations",
      validateLlvm: true,
      expectedStdout: [...output, ...model].map((n) => `${n}\n`).join(""),
      source: `
      import [Deque], [DequeIterator] from "std/deque.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        local d: Deque<int> = Deque<int>.new(1);
        ${statements.join("\n")}
        local it: DequeIterator<int> = d.iterator();
        loop (local i: int = 0; i < d.size(); i = i + 1) {
          local value: int = it.next().unwrap();
          if (value != d.get(i).unwrap()) { return 1; }
          printf("%d\\n", value);
        }
        if (it.next().isSome()) { return 2; }
        d.destroy(); return 0;
      }
    `,
    },
  ]);
}, 60000);

it("supports empty boundaries, reserve, independent clones, records, and reuse", () => {
  expectCorrectnessSuite([
    {
      name: "deque boundaries",
      validateLlvm: true,
      expectedStdout: "deque ok\n",
      source: `
      import [Deque] from "std";
      extern printf(fmt: string, ...);
      struct Entry { value: int }
      frame main() ret int {
        local d: Deque<Entry> = Deque<Entry>.new(-1);
        if (d.popFront().isSome() || d.popBack().isSome()) { return 1; }
        if (d.peekFront().isSome() || d.peekBack().isSome()) { return 2; }
        if (d.set(0, Entry { value: 1 }) || d.get(-1).isSome()) { return 3; }
        d.pushFront(Entry { value: 10 }); d.pushBack(Entry { value: 20 });
        d.reserve(100);
        if (d.capacity() < 100 || d.size() != 2) { return 4; }
        local copy: Deque<Entry> = d.clone();
        if (!copy.set(0, Entry { value: 30 })) { return 5; }
        local original: Entry = d.peekFront().unwrap();
        local changed: Entry = copy.peekFront().unwrap();
        local last: Entry = copy.peekBack().unwrap();
        if (original.value != 10 || changed.value != 30 || last.value != 20) { return 6; }
        d.clear(); if (!d.isEmpty() || d.capacity() < 100) { return 7; }
        d.destroy(); d.destroy(); d.pushBack(Entry { value: 40 });
        local reused: Entry = d.popFront().unwrap();
        if (reused.value != 40) { return 8; }
        d.destroy(); copy.destroy();
        local empty: Deque<int> = Deque<int>.new();
        empty.reserve(-1); empty.destroy();
        printf("deque ok\\n"); return 0;
      }
    `,
    },
  ]);
}, 60000);
