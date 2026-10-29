import { expect, test } from "bun:test";
import { compileAndRun } from "./helpers/compileAndRun";

// BUG-460: Map.__eq__ and Array.indexOf/contains compared string values by
// pointer, so equal but separately allocated strings were unequal.
test("string values compare by content in Map equality and Array search", () => {
  const output = compileAndRun(`import printf from "std/c.bpl";
import [Map] from "std/map.bpl";
import [Array] from "std/array.bpl";
extern strdup(s: string) ret string;
frame main() ret int {
    local a: Map<int, string> = Map<int, string>.new(4);
    local b: Map<int, string> = Map<int, string>.new(4);
    a.set(1, strdup("hello"));
    b.set(1, strdup("hello"));
    local c: Map<int, string> = Map<int, string>.new(4);
    c.set(1, strdup("world"));
    local xs: Array<string> = Array<string>.new(2);
    xs.push(strdup("x"));
    xs.push(nullptr);
    local ns: Array<int> = Array<int>.new(2);
    ns.push(5);
    printf("%d %d %d %d %d %d\\n", cast<int>(a == b), cast<int>(a == c),
        xs.indexOf(strdup("x")), xs.indexOf(nullptr),
        cast<int>(xs.contains(strdup("y"))), ns.indexOf(5));
    return 0;
}
`);
  expect(output).toBe("1 0 0 1 0 0\n");
});
