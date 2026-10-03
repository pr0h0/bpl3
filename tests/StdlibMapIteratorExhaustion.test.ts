import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Map iterators stay exhausted without advancing or overflowing their bucket index", () => {
  expectCorrectnessSuite([{
    name: "map-iterator-exhaustion",
    validateLlvm: true,
    source: `
      import [Map], [MapIterator], [Pair] from "std/map.bpl";
      import [Option] from "std/option.bpl";
      frame main() ret int {
        local map: Map<int, int> = Map<int, int>.new();
        map.set(1, 10); map.set(2, 20); map.set(3, 30);
        local iterator: MapIterator<int, int> = map.iterator();
        local count: int = 0;
        local sum: int = 0;
        loop {
          local item: Option<Pair<int, int>> = iterator.next();
          if (item.isNone()) { break; }
          local pair: Pair<int, int> = item.unwrap();
          sum = sum + pair.value;
          count = count + 1;
        }
        if (count != 3 || sum != 60) { return 1; }
        # The old iterator kept incrementing even after returning None.
        # Set a reachable exhausted counter to isolate its eventual overflow.
        iterator.bucketIndex = 2147483647;
        if (!iterator.next().isNone() || !iterator.next().isNone()) { return 2; }
        map.clear();
        local empty: MapIterator<int, int> = map.iterator();
        if (!empty.next().isNone()) { return 3; }
        local stoppedAt: int = empty.bucketIndex;
        if (!empty.next().isNone() || empty.bucketIndex != stoppedAt) { return 4; }
        map.destroy();
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
