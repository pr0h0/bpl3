import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Map reserve preserves collision chains when a custom hasher throws", () => {
  expectCorrectnessSuite([{
    name: "map-rehash-callback-failure",
    validateLlvm: true,
    source: `
      import [Map] from "std/map.bpl";
      import [Option] from "std/option.bpl";
      global hashCalls: int = 0;
      global failAt: int = 0;
      global failWithInt: bool = false;
      frame hash(key: *int) ret u64 {
        if (*key < 0) { return cast<u64>(1); }
        hashCalls = hashCalls + 1;
        if (hashCalls == failAt) {
          if (failWithInt) { throw 123; }
          throw "hash failed";
        }
        return cast<u64>(0);
      }
      frame equal(a: *int, b: *int) ret bool { return *a == *b; }
      frame main() ret int {
        local map: Map<int, int> = Map<int, int>.new(16, hash, equal);
        loop (local key: int = 1; key <= 3; key = key + 1) { map.set(key, key * 10); }
        loop (local scenario: int = 0; scenario < 6; scenario = scenario + 1) {
          hashCalls = 0;
          failAt = (scenario % 3) + 1;
          failWithInt = scenario >= 3;
          local caught: bool = false;
          try { map.reserve(100); }
          catch (error: int) { caught = failWithInt && error == 123; }
          catch (error: string) { caught = !failWithInt && error != nullptr; }
          failAt = 0;
          if (!caught || map.count != 3 || map.bucketCount() != 16) { return 1; }
          loop (local key: int = 1; key <= 3; key = key + 1) {
            local value: Option<int> = map.get(key);
            if (value.isNone() || value.unwrap() != key * 10) { return 2; }
          }
        }
        map.reserve(100);
        if (map.bucketCount() < 134 || map.count != 3) { return 3; }
        loop (local key: int = 1; key <= 3; key = key + 1) {
          if (map.get(key).unwrap() != key * 10) { return 4; }
        }
        map.destroy();
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
