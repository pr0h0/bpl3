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
