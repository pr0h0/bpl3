import { expect, test } from "bun:test";
import { compileAndRun } from "./helpers/compileAndRun";

// BUG-454: JSON.parse built objects in zeroed memory without a vtable, so the
// first method call on a parsed Array<T> or user struct crashed.
test("objects built by JSON.parse support method calls", () => {
  const output = compileAndRun(`import printf from "std/c.bpl";
import [JSON] from "std/json.bpl";
import [Array] from "std/array.bpl";
struct Pt { x: int, y: int, frame sum(this: *Pt) ret int { return this.x + this.y; } }
struct Box { items: Array<int>, pt: Pt, ptp: *Pt, }
frame main() ret int {
    local t: *Array<int> = JSON.parse<Array<int>>("[3,4]");
    printf("%d %d\\n", t.len(), t.get(1));
    local b: *Box = JSON.parse<Box>("{\\"items\\":[1,2,3],\\"pt\\":{\\"x\\":1,\\"y\\":2},\\"ptp\\":{\\"x\\":5,\\"y\\":6}}");
    printf("%d %d %d\\n", b.items.len(), b.pt.sum(), b.ptp.sum());
    local pts: *Array<Pt> = JSON.parse<Array<Pt>>("[{\\"x\\":1,\\"y\\":1},{\\"x\\":2,\\"y\\":3}]");
    local second: Pt = pts.get(1);
    printf("%d\\n", second.sum());
    return 0;
}
`);
  expect(output).toBe("2 4\n3 3 11\n5\n");
});

// BUG-457: string reflection data depended on generation order and on whether
// Array<string> methods were used, so string arrays parsed as numbers.
test("JSON.parse<Array<string>> works alongside *char fields and Array methods", () => {
  const output = compileAndRun(`import printf from "std/c.bpl";
import [JSON] from "std/json.bpl";
import [Array] from "std/array.bpl";
import [TypeInfo] from "std/reflection.bpl";
struct Raw { p: *char, }
frame main() ret int {
    local info: *TypeInfo = typeof<Raw>();
    local s: *Array<string> = JSON.parse<Array<string>>("[\\"x\\",\\"y\\"]");
    if (s == nullptr) { return 1; }
    printf("%d %d %s\\n", info.num_fields, s.len(), s.get(1));
    return 0;
}
`);
  expect(output).toBe("1 2 y\n");
});

// `Box<string>` and `Box<*char>` share an LLVM layout; their TypeInfo must not
// be shared, whichever is reflected first.
test.each([
  ["string first", "string", "*char"],
  ["*char first", "*char", "string"],
])("generic string arguments reflect as strings (%s)", (_, first, second) => {
  const output = compileAndRun(`import printf from "std/c.bpl";
import [TypeInfo] from "std/reflection.bpl";
struct Box<T> { v: T, }
frame kindOf(info: *TypeInfo) ret int { return cast<int>(info.fields[0].type_info.kind); }
frame main() ret int {
    local a: *TypeInfo = typeof<Box<${first}>>();
    local b: *TypeInfo = typeof<Box<${second}>>();
    printf("%d %d\\n", kindOf(a), kindOf(b));
    return 0;
}
`);
  expect(output).toBe(first === "string" ? "0 3\n" : "3 0\n");
});
