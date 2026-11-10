import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("extends Array and Map with sequence and entry operations", () => {
  expectCorrectnessSuite([
    {
      name: "array and map extras",
      validateLlvm: true,
      expectedStdout:
        "extend 24 first 1 last 6\nreverse: 6 5 4 3 2 1\nswap: 1 5 4 3 2 6\nslice: 5 4 3\nempty slice 0\nrotate: 4 3 2 6 1 5\nrotate back: 1 5 4 3 2 6\nretain removed 3\nkept: 4 2 6\ndedup 3: 1 2 3 1\nlastIndexOf 3 count 2 sorted 0\nsearch 4 -6 -11 point 4\nmin 1 max 3 swapRemove 0 len 9 first 90\nfill 7 cap 9\nreserve 100 9\npoints dedupBy 1\nstrings dedup 1\nmap 20 4 1 null\ncounts 3 1 1\nretain 1 sum 8 entries 3 merged 6 empty F\n",
      source: `import [Array] from "std/array.bpl";
import [Map], [Pair] from "std/map.bpl";
import [Option] from "std/option.bpl";
extern printf(fmt: string, ...);
struct Point { x: int, y: int }
frame show(label: string, a: *Array<int>) {
    printf("%s:", label);
    loop (local i: int = 0; i < a.length; i = i + 1) { printf(" %d", a.get(i)); }
    printf("\\n");
}
frame cmp(a: int, b: int) ret int { return a - b; }
frame main() ret int {
    local a: Array<int> = Array<int>.new(0);
    loop (local i: int = 1; i <= 6; i = i + 1) { a.push(i); }
    local copy: Array<int> = a.clone();
    a.extend(&copy);
    a.extend(&a);
    printf("extend %d first %d last %d\\n", a.length, a.first().unwrap(), a.last().unwrap());
    a.truncate(6);
    a.reverse(); show("reverse", &a);
    a.swap(0, 5); show("swap", &a);
    local s: Array<int> = a.slice(1, 4); show("slice", &s); s.destroy();
    local empty: Array<int> = a.slice(5, 2); printf("empty slice %d\\n", empty.length); empty.destroy();
    a.rotateLeft(2); show("rotate", &a);
    a.rotateLeft(-2); show("rotate back", &a);
    local removed: int = a.retain(|x: int| ret bool { return (x % 2) == 0; });
    printf("retain removed %d\\n", removed); show("kept", &a);
    local d: Array<int> = Array<int>.new(4);
    d.push(1); d.push(1); d.push(2); d.push(2); d.push(2); d.push(3); d.push(1);
    printf("dedup %d", d.dedup()); show("", &d);
    printf("lastIndexOf %d count %d sorted %d\\n", d.lastIndexOf(1), d.countWhere(|x: int| ret bool { return x > 1; }), d.isSortedBy(cmp));
    local sorted: Array<int> = Array<int>.new(4);
    loop (local i: int = 0; i < 10; i = i + 1) { sorted.push(i * 10); }
    printf("search %d %d %d point %d\\n", sorted.binarySearchBy(|x: int| ret int { return x - 40; }), sorted.binarySearchBy(|x: int| ret int { return x - 45; }), sorted.binarySearchBy(|x: int| ret int { return x - 1000; }), sorted.partitionPoint(|x: int| ret bool { return x < 35; }));
    printf("min %d max %d swapRemove %d len %d first %d\\n", d.minBy(cmp).unwrap(), d.maxBy(cmp).unwrap(), sorted.swapRemove(0), sorted.length, sorted.get(0));
    sorted.fill(7); sorted.shrinkToFit();
    printf("fill %d cap %d\\n", sorted.get(8), sorted.capacity);
    sorted.reserve(100);
    printf("reserve %d %d\\n", sorted.capacity, sorted.length);
    local pts: Array<Point> = Array<Point>.new(2);
    pts.push(Point { x: 1, y: 2 }); pts.push(Point { x: 1, y: 2 }); pts.push(Point { x: 3, y: 4 });
    printf("points dedupBy %d\\n", pts.dedupBy(|p: Point, q: Point| ret bool { return (p.x == q.x) && (p.y == q.y); }));
    local words: Array<string> = Array<string>.new(2);
    words.push("a"); words.push("a"); words.push("b");
    printf("strings dedup %d\\n", words.dedup());
    local m: Map<string, int> = Map<string, int>.new();
    m.set("a", 1); m.set("b", 2); m.set("c", 3);
    local ref: *int = m.getRef("b");
    *ref = 20;
    local inserted: *int = m.getOrInsert("d", 4);
    local kept: *int = m.getOrInsert("a", 99);
    printf("map %d %d %d %s\\n", m.get("b").unwrap(), *inserted, *kept, (m.getRef("zz") == nullptr) ? "null" : "ref");
    local counts: Map<string, int> = Map<string, int>.new();
    local text: string[5] = ["x", "y", "x", "x", "z"];
    loop (local i: int = 0; i < 5; i = i + 1) { counts.update(text[i], 0, |n: int| ret int { return n + 1; }); }
    printf("counts %d %d %d\\n", counts.get("x").unwrap(), counts.get("y").unwrap(), counts.get("z").unwrap());
    local gone: int = m.retain(|k: string, v: int| ret bool { return v < 10; });
    local total: int = 0; local totalPtr: *int = &total;
    m.forEach(|k: string, v: int| { *totalPtr = *totalPtr + v; });
    local es: Array<Pair<string, int>> = m.entries();
    m.merge(&counts);
    printf("retain %d sum %d entries %d merged %d empty %s\\n", gone, total, es.length, m.size(), m.isEmpty() ? "T" : "F");
    es.destroy(); m.destroy(); counts.destroy();
    return 0;
}
`,
    },
  ]);
}, 120000);
