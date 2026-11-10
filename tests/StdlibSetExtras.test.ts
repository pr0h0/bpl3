import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("builds, compares and filters sets", () => {
  expectCorrectnessSuite([
    {
      name: "set extras",
      validateLlvm: true,
      expectedStdout:
        "size 3 sym 3 T F T\nsuperset T F disjoint T F insert T F\nretain 1 sum 4 after addAll 3\n",
      source: `import [Set] from "std/set.bpl";
import [Array] from "std/array.bpl";
extern printf(fmt: string, ...);
frame b(v: bool) ret string { if (v) { return "T"; } return "F"; }
frame main() ret int {
    local values: Array<int> = Array<int>.new(4);
    values.push(1); values.push(2); values.push(3); values.push(2);
    local a: Set<int> = Set<int>.fromArray(&values);
    local c: Set<int> = Set<int>.new();
    c.add(3); c.add(4);
    local sym: Set<int> = a.symmetricDifference(&c);
    printf("size %d sym %d %s %s %s\\n", a.size(), sym.size(), b(sym.has(1)), b(sym.has(3)), b(sym.has(4)));
    local small: Set<int> = Set<int>.new();
    small.add(1);
    printf("superset %s %s disjoint %s %s insert %s %s\\n", b(a.isSupersetOf(&small)), b(small.isSupersetOf(&a)), b(small.isDisjoint(&c)), b(a.isDisjoint(&c)), b(small.insert(5)), b(small.insert(5)));
    local removed: int = a.retain(|x: int| ret bool { return x != 2; });
    local total: int = 0; local totalPtr: *int = &total;
    a.forEach(|x: int| { *totalPtr = *totalPtr + x; });
    a.addAll(&c);
    printf("retain %d sum %d after addAll %d\\n", removed, total, a.size());
    a.destroy(); c.destroy(); sym.destroy(); small.destroy(); values.destroy();
    return 0;
}
`,
    },
  ]);
}, 120000);
