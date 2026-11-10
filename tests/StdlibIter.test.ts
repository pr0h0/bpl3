import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { expectTrackedAllocations } from "./helpers/trackedAllocations";

const HEADER = `
import [Iter], [Peekable], [Zipped], [Enumerated], iterEnumerate, iterChunks, iterRange, iterRangeStep, iterRangeOf, iterCounter, iterChars, iterArray, sumInt, sumLong, sumFloat, minInt, maxInt from "std/iter.bpl";
import [Array], [ArrayIterator] from "std/array.bpl";
import [Range] from "std/range.bpl";
import [Option] from "std/option.bpl";
extern printf(fmt: string, ...);
frame show(label: string, values: Array<int>) {
  printf("%s:", label);
  loop (local i: int = 0; i < values.length; i = i + 1) { printf(" %d", values.get(i)); }
  printf("\\n");
}
`;

it("chains lazy adapters over ranges, arrays and iterators", () => {
  expectCorrectnessSuite([
    {
      name: "iterator adapters",
      validateLlvm: true,
      expectedStdout: [
        "map filter: 0 4 16 36 64",
        "skip take: 7 8 9 10",
        "zip: 1a 2b 3c",
        "step range: 10 7 4 1",
        "enumerate: 0=7 1=8 2=9",
        "flat: 1 2 2 3 3 3",
        "peek 1 1 2 none",
        "chunk: 0 1 2",
        "chunk: 3 4 5",
        "chunk: 6",
        "chain: 3 4 -2 -1",
        "while: 1 2 3 | 4 5 1",
        "stepBy: 0 3 6 9",
        "scan: 1 3 6 10",
        "dedup: 1 2 3 1",
        "filterMap: 20 40",
        "array: 5 6 7",
        "from iterator: 50 60 70",
        "pointer: 9 8",
        "successors: 1 2 4 8 16",
        "once empty: 42 none",
        "repeatN: 7 7 7",
        "range of: 2 4 6",
        "inspect sum 6 seen 3",
        "",
      ].join("\n"),
      source: `${HEADER}
      frame main() ret int {
        local mapped: Iter<int> = iterRange(0, 10).map<int>(|x: int| ret int { return x * x; }).filter(|x: int| ret bool { return (x % 2) == 0; });
        local a: Array<int> = mapped.collect(); show("map filter", a); a.destroy(); mapped.destroy();
        local st: Iter<int> = iterCounter(5).skip(2).take(4);
        local b: Array<int> = st.collect(); show("skip take", b); b.destroy(); st.destroy();
        local z: Iter<Zipped<int, char>> = iterRange(1, 10).zip<char>(iterChars("abc"));
        printf("zip:");
        loop {
          local p: Option<Zipped<int, char>> = z.next();
          if (p.isNone()) { break; }
          local q: Zipped<int, char> = p.unwrap();
          printf(" %d%c", q.first, q.second);
        }
        printf("\\n"); z.destroy();
        local r: Iter<int> = iterRangeStep(10, 0, -3);
        local c: Array<int> = r.collect(); show("step range", c); c.destroy(); r.destroy();
        local e: Iter<Enumerated<int>> = iterEnumerate<int>(iterRange(7, 10));
        printf("enumerate:");
        e.forEach(|item: Enumerated<int>| { printf(" %d=%d", item.index, item.value); });
        printf("\\n"); e.destroy();
        local fm: Iter<int> = iterRange(1, 4).flatMap<int>(|n: int| ret Iter<int> { return Iter<int>.repeatN(n, n); });
        local d: Array<int> = fm.collect(); show("flat", d); d.destroy(); fm.destroy();
        local pk: Peekable<int> = iterRange(1, 3).peekable();
        local p1: int = pk.peek().unwrap();
        local p2: int = pk.next().unwrap();
        local p3: int = pk.next().unwrap();
        printf("peek %d %d %d %s\\n", p1, p2, p3, pk.next().isNone() ? "none" : "some");
        pk.destroy();
        local ch: Iter<Array<int>> = iterChunks<int>(iterRange(0, 7), 3);
        loop {
          local chunk: Option<Array<int>> = ch.next();
          if (chunk.isNone()) { break; }
          local values: Array<int> = chunk.unwrap();
          show("chunk", values); values.destroy();
        }
        ch.destroy();
        local chained: Iter<int> = iterRange(3, 5).chain(iterRange(-2, 0));
        local f: Array<int> = chained.collect(); show("chain", f); f.destroy(); chained.destroy();
        local source: Array<int> = Array<int>.new(4);
        source.push(1); source.push(2); source.push(3); source.push(4); source.push(5); source.push(1);
        local tw: Iter<int> = Iter<int>.fromArray(&source).takeWhile(|x: int| ret bool { return x < 4; });
        local sw: Iter<int> = Iter<int>.fromArray(&source).skipWhile(|x: int| ret bool { return x < 4; });
        local g: Array<int> = tw.collect(); local h: Array<int> = sw.collect();
        printf("while: %d %d %d | %d %d %d\\n", g.get(0), g.get(1), g.get(2), h.get(0), h.get(1), h.get(2));
        g.destroy(); h.destroy(); tw.destroy(); sw.destroy();
        local sb: Iter<int> = iterRange(0, 11).stepBy(3);
        local i1: Array<int> = sb.collect(); show("stepBy", i1); i1.destroy(); sb.destroy();
        local sc: Iter<int> = iterRange(1, 5).scan<int>(0, |acc: int, x: int| ret int { return acc + x; });
        local i2: Array<int> = sc.collect(); show("scan", i2); i2.destroy(); sc.destroy();
        local dups: Array<int> = Array<int>.new(4);
        dups.push(1); dups.push(1); dups.push(2); dups.push(3); dups.push(3); dups.push(1);
        local dd: Iter<int> = iterArray<int>(&dups).dedupBy(|x: int, y: int| ret bool { return x == y; });
        local i3: Array<int> = dd.collect(); show("dedup", i3); i3.destroy(); dd.destroy();
        local fmp: Iter<int> = iterRange(1, 5).filterMap<int>(|x: int| ret Option<int> {
          if ((x % 2) == 0) { return Option<int>.Some(x * 10); }
          return Option<int>.None;
        });
        local i4: Array<int> = fmp.collect(); show("filterMap", i4); i4.destroy(); fmp.destroy();
        local arr: Array<int> = Array<int>.new(2); arr.push(5); arr.push(6); arr.push(7);
        local ai: Iter<int> = Iter<int>.fromArray(&arr);
        local i5: Array<int> = ai.collect(); show("array", i5); i5.destroy(); ai.destroy();
        local fi: Iter<int> = Iter<int>.fromIterator<ArrayIterator<int>>(arr.iterator()).map<int>(|x: int| ret int { return x * 10; });
        local i6: Array<int> = fi.collect(); show("from iterator", i6); i6.destroy(); fi.destroy();
        local raw: int[2] = [9, 8];
        local pi: Iter<int> = Iter<int>.fromPointer(&raw[0], 2);
        local i7: Array<int> = pi.collect(); show("pointer", i7); i7.destroy(); pi.destroy();
        local su: Iter<int> = Iter<int>.successors(1, |x: int| ret Option<int> {
          if (x >= 16) { return Option<int>.None; }
          return Option<int>.Some(x * 2);
        });
        local i8: Array<int> = su.collect(); show("successors", i8); i8.destroy(); su.destroy();
        local on: Iter<int> = Iter<int>.once(42).chain(Iter<int>.empty());
        local first: int = on.next().unwrap();
        printf("once empty: %d %s\\n", first, on.next().isNone() ? "none" : "some");
        on.destroy();
        local rn: Iter<int> = Iter<int>.repeatN(7, 3);
        local i9: Array<int> = rn.collect(); show("repeatN", i9); i9.destroy(); rn.destroy();
        local ro: Iter<int> = iterRangeOf(Range.new(2, 7, 2));
        local i10: Array<int> = ro.collect(); show("range of", i10); i10.destroy(); ro.destroy();
        local seen: int = 0; local seenPtr: *int = &seen;
        local ins: Iter<int> = iterRange(1, 4).inspect(|x: int| { *seenPtr = *seenPtr + 1; });
        printf("inspect sum %ld seen %d\\n", sumInt(&ins), seen);
        ins.destroy();
        source.destroy(); dups.destroy(); arr.destroy();
        return 0;
      }
    `,
    },
  ]);
}, 120000);

it("consumes iterators with folds, searches and partitions", () => {
  expectCorrectnessSuite([
    {
      name: "iterator consumers",
      validateLlvm: true,
      expectedStdout: [
        "count 10 fold 45 reduce 3628800",
        "any true false all true false",
        "find 6 none position 3 none",
        "last 9 nth 4 none",
        "min -3 max 12 minBy 1 maxBy 2",
        "partition 2 3",
        "sorted: 9 5 3 1",
        "advance 3 then 3 exhausted 2",
        "sums 15 6000000000 1.5",
        "into: 1 2 0 1",
        "fuse none none",
        "",
      ].join("\n"),
      source: `${HEADER}
      frame byValue(a: int, b: int) ret int { return a - b; }
      frame main() ret int {
        local c: Iter<int> = iterRange(0, 10); local count: int = c.count(); c.destroy();
        local f: Iter<int> = iterRange(0, 10);
        local folded: int = f.fold<int>(0, |acc: int, x: int| ret int { return acc + x; }); f.destroy();
        local r: Iter<int> = iterRange(1, 11);
        local product: int = r.reduce(|a: int, b: int| ret int { return a * b; }).unwrap(); r.destroy();
        printf("count %d fold %d reduce %d\\n", count, folded, product);
        local a1: Iter<int> = iterRange(0, 5); local a2: Iter<int> = iterRange(0, 5);
        local a3: Iter<int> = iterRange(0, 5); local a4: Iter<int> = iterRange(0, 5);
        local anyYes: bool = a1.any(|x: int| ret bool { return x == 3; });
        local anyNo: bool = a2.any(|x: int| ret bool { return x > 9; });
        local allYes: bool = a3.all(|x: int| ret bool { return x < 5; });
        local allNo: bool = a4.all(|x: int| ret bool { return x < 4; });
        printf("any %s %s all %s %s\\n", anyYes ? "true" : "false", anyNo ? "true" : "false", allYes ? "true" : "false", allNo ? "true" : "false");
        a1.destroy(); a2.destroy(); a3.destroy(); a4.destroy();
        local s1: Iter<int> = iterRange(4, 9); local s2: Iter<int> = iterRange(4, 9);
        local s3: Iter<int> = iterRange(4, 9); local s4: Iter<int> = iterRange(4, 9);
        local found: int = s1.find(|x: int| ret bool { return (x % 3) == 0; }).unwrap();
        local missing: bool = s2.find(|x: int| ret bool { return x > 100; }).isNone();
        local at: int = s3.position(|x: int| ret bool { return x == 7; }).unwrap();
        local noAt: bool = s4.position(|x: int| ret bool { return x == 70; }).isNone();
        printf("find %d %s position %d %s\\n", found, missing ? "none" : "some", at, noAt ? "none" : "some");
        s1.destroy(); s2.destroy(); s3.destroy(); s4.destroy();
        local l: Iter<int> = iterRange(0, 10); local n: Iter<int> = iterRange(0, 10); local n2: Iter<int> = iterRange(0, 3);
        local lastValue: int = l.last().unwrap();
        local nthValue: int = n.nth(4).unwrap();
        printf("last %d nth %d %s\\n", lastValue, nthValue, n2.nth(5).isNone() ? "none" : "some");
        l.destroy(); n.destroy(); n2.destroy();
        local values: Array<int> = Array<int>.new(4);
        values.push(5); values.push(-3); values.push(12); values.push(1);
        local m1: Iter<int> = iterArray<int>(&values); local m2: Iter<int> = iterArray<int>(&values);
        local minimum: int = minInt(&m1).unwrap(); local maximum: int = maxInt(&m2).unwrap();
        local enumerated: Iter<Enumerated<int>> = iterEnumerate<int>(iterArray<int>(&values));
        local byMin: Iter<Enumerated<int>> = iterEnumerate<int>(iterArray<int>(&values));
        local lowest: Enumerated<int> = byMin.minBy(|x: Enumerated<int>, y: Enumerated<int>| ret int { return x.value - y.value; }).unwrap();
        local highest: Enumerated<int> = enumerated.maxBy(|x: Enumerated<int>, y: Enumerated<int>| ret int { return x.value - y.value; }).unwrap();
        printf("min %d max %d minBy %d maxBy %d\\n", minimum, maximum, lowest.index, highest.index);
        m1.destroy(); m2.destroy(); enumerated.destroy(); byMin.destroy();
        local pt: Iter<int> = iterRange(0, 5);
        local (evens: Array<int>, odds: Array<int>) = pt.partition(|x: int| ret bool { return (x % 2) == 1; });
        printf("partition %d %d\\n", evens.length, odds.length);
        evens.destroy(); odds.destroy(); pt.destroy();
        local unsorted: Iter<int> = iterArray<int>(&values).map<int>(|x: int| ret int { if (x < 0) { return 3; } if (x > 10) { return 9; } return x; });
        local sorted: Array<int> = unsorted.sortedBy(|x: int, y: int| ret int { return y - x; });
        show("sorted", sorted); sorted.destroy(); unsorted.destroy();
        local adv: Iter<int> = iterRange(0, 5);
        local skipped: int = adv.advanceBy(3);
        local after: int = adv.next().unwrap();
        local short: Iter<int> = iterRange(0, 2);
        printf("advance %d then %d exhausted %d\\n", skipped, after, short.advanceBy(9));
        adv.destroy(); short.destroy();
        local si: Iter<int> = iterRange(1, 6);
        local sl: Iter<long> = Iter<long>.repeatN(cast<long>(2000000000), 3);
        local sf: Iter<float> = Iter<float>.repeatN(0.5, 3);
        printf("sums %ld %ld %.1f\\n", sumInt(&si), sumLong(&sl), sumFloat(&sf));
        si.destroy(); sl.destroy(); sf.destroy();
        local target: Array<int> = Array<int>.new(1);
        local i1: Iter<int> = iterRange(1, 3); local i2: Iter<int> = iterRange(0, 2);
        i1.collectInto(&target); i2.collectInto(&target);
        show("into", target); target.destroy(); i1.destroy(); i2.destroy();
        local calls: int = 0; local callsPtr: *int = &calls;
        local flaky: Iter<int> = Iter<int>.fromFn(|| ret Option<int> {
          *callsPtr = *callsPtr + 1;
          if (*callsPtr == 1) { return Option<int>.None; }
          return Option<int>.Some(1);
        }).fuse();
        local firstNone: bool = flaky.next().isNone();
        printf("fuse %s %s\\n", firstNone ? "none" : "some", flaky.next().isNone() ? "none" : "some");
        flaky.destroy();
        if (byValue(2, 1) != 1) { return 1; }
        values.destroy();
        return 0;
      }
    `,
    },
  ]);
}, 120000);

it("releases every adapter allocation when the chain is destroyed", () => {
  expectTrackedAllocations(`
import [Iter], [Zipped], iterEnumerate, iterChunks, iterRange, iterChars, sumInt from "std/iter.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
extern tracking_begin();
extern tracking_live() ret int;
frame main() ret int {
  tracking_begin();
  loop (local round: int = 0; round < 5; round = round + 1) {
    local chain: Iter<int> = iterRange(0, 50).map<int>(|x: int| ret int { return x + 1; }).filter(|x: int| ret bool { return (x % 3) != 0; }).skip(2).take(10).stepBy(2).chain(iterRange(0, 3)).fuse();
    local values: Array<int> = chain.collect();
    values.destroy();
    chain.destroy();
    local zipped: Iter<Zipped<int, char>> = iterRange(0, 9).zip<char>(iterChars("xyz"));
    zipped.count();
    zipped.destroy();
    local flat: Iter<int> = iterRange(0, 4).flatMap<int>(|n: int| ret Iter<int> { return iterRange(0, n); });
    sumInt(&flat);
    flat.destroy();
    local chunks: Iter<Array<int>> = iterChunks<int>(iterRange(0, 10), 4);
    loop {
      local chunk: Option<Array<int>> = chunks.next();
      if (chunk.isNone()) { break; }
      local items: Array<int> = chunk.unwrap();
      items.destroy();
    }
    chunks.destroy();
    local e: Iter<int> = iterRange(0, 3).scan<int>(0, |a: int, b: int| ret int { return a + b; }).dedupBy(|a: int, b: int| ret bool { return a == b; });
    e.count();
    e.destroy();
    if (tracking_live() != 0) { return 1 + round; }
  }
  return 0;
}`);
}, 120000);
