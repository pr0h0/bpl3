import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("preserves map insertion, replacement, and removal laws for default keys", () => {
  expectCorrectnessSuite([{
    name: "default map keys",
    validateLlvm: true,
    expectedStdout: "1 1 1\n0\n1 1\n1 1\n1 1\n",
    source: `
      import [Map] from "std/map.bpl";
      extern printf(fmt: string, ...);
      extern nan(tag: string) ret float;
      struct Key { code: int }
      frame main() ret int {
        local b: Map<bool, int> = Map<bool, int>.new();
        b.set(true, 1); b.set(true, 2);
        printf("%d %d %d\\n", b.has(true), b.size(), b.remove(true));
        printf("%d\\n", b.has(true)); b.destroy();
        local k: Map<Key, int> = Map<Key, int>.new();
        k.set(Key { code: 7 }, 1); k.set(Key { code: 7 }, 2);
        printf("%d %d\\n", k.has(Key { code: 7 }), k.size()); k.destroy();
        local f: Map<float, int> = Map<float, int>.new();
        f.set(0.0, 1); f.set(-0.0, 2);
        printf("%d %d\\n", f.has(-0.0), f.size());
        f.clear(); f.set(nan(""), 3); f.set(nan(""), 4);
        printf("%d %d\\n", f.has(nan("")), f.size()); f.destroy();
        return 0;
      }
    `,
  }]);
}, 60000);

it("supports narrow integer and f32 keys without losing updates", () => {
  const types = ["i8", "u8", "i16", "u16", "int", "uint", "long", "ulong", "f32"];
  expectCorrectnessSuite([{
    name: "numeric map key matrix",
    expectedStdout: types.map(() => "1 1\n").join(""),
    source: `import [Map] from "std/map.bpl"; extern printf(fmt: string, ...);
      frame main() ret int {
        ${types.map((type, i) => `
          local m${i}: Map<${type}, int> = Map<${type}, int>.new();
          m${i}.set(cast<${type}>(7), 1); m${i}.set(cast<${type}>(7), 2);
          printf("%d %d\\n", m${i}.has(cast<${type}>(7)), m${i}.size()); m${i}.destroy();
        `).join("\n")}
        return 0;
      }`,
  }]);
}, 60000);

it("rehashes without losing values, updates, custom collisions, or removals", () => {
  expectCorrectnessSuite([{
    name: "map growth and reserve",
    validateLlvm: true,
    expectedStdout: "130 1 1\n130 1\n65 0 1\n0 0\n40 1\n",
    source: `
      import [Map] from "std/map.bpl";
      import [Option] from "std/option.bpl";
      extern printf(fmt: string, ...);
      frame hash(key: *int) ret u64 { return cast<u64>(*key % 3); }
      frame equal(a: *int, b: *int) ret bool { return *a == *b; }
      frame main() ret int {
        local m: Map<int, int> = Map<int, int>.new();
        loop (local i: int = 0; i < 130; i = i + 1) { m.set(i, i + 1); }
        local present: bool = true;
        loop (local i: int = 0; i < 130; i = i + 1) { local value: Option<int> = m.get(i); present = present && value.unwrap() == i + 1; }
        printf("%d %d %d\\n", m.size(), m.bucketCount() >= 174, present);
        local before: int = m.bucketCount();
        loop (local i: int = 0; i < 130; i = i + 1) { m.set(i, i + 2); }
        printf("%d %d\\n", m.size(), m.bucketCount() == before);
        m.reserve(1000);
        loop (local i: int = 0; i < 130; i = i + 1) {
          local value: Option<int> = m.get(i);
          if (value.unwrap() != i + 2) { return 1; }
        }
        loop (local i: int = 0; i < 65; i = i + 1) { m.remove(i); }
        printf("%d %d %d\\n", m.size(), m.has(0), m.has(129));
        m.clear(); printf("%d %d\\n", m.size(), m.has(129)); m.destroy();
        local c: Map<int, int> = Map<int, int>.new(16, hash, equal);
        loop (local i: int = 0; i < 40; i = i + 1) { c.set(i, i); }
        c.reserve(100);
        present = true;
        loop (local i: int = 0; i < 40; i = i + 1) { present = present && c.has(i); }
        printf("%d %d\\n", c.size(), present); c.destroy();
        return 0;
      }
    `,
  }]);
}, 60000);
