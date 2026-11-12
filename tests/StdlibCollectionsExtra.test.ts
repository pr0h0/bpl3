import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { expectTrackedAllocations } from "./helpers/trackedAllocations";

it("matches a sorted model for random TreeMap operations", () => {
  const model = new Map<number, number>();
  const statements: string[] = [];
  const output: string[] = [];
  let seed = 987654321;
  for (let i = 0; i < 400; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const key = (seed >>> 8) % 60;
    const op = (seed >>> 20) % 4;
    if (op <= 1) {
      const added = !model.has(key);
      model.set(key, i);
      statements.push(`if (t.put(${key}, ${i}) != ${added}) { return 1; }`);
    } else if (op === 2) {
      const removed = model.delete(key);
      statements.push(`if (t.remove(${key}) != ${removed}) { return 2; }`);
    } else {
      const value = model.get(key) ?? -1;
      statements.push(`if (t.getOr(${key}, -1) != ${value}) { return 3; }`);
    }
  }
  const keys = [...model.keys()].sort((a, b) => a - b);
  output.push(`size ${keys.length}`);
  output.push(`keys ${keys.join(" ")}`);
  output.push(`values ${keys.map((k) => model.get(k)).join(" ")}`);
  const floor = keys.filter((k) => k <= 30).pop() ?? -1;
  const ceiling = keys.find((k) => k >= 30) ?? -1;
  output.push(`bounds ${keys[0]} ${keys[keys.length - 1]} ${floor} ${ceiling}`);
  output.push(`range ${keys.filter((k) => k >= 10 && k < 20).join(" ")}`);
  expectCorrectnessSuite([
    {
      name: "tree map model",
      validateLlvm: true,
      expectedStdout: output.map((line) => `${line}\n`).join("") + "balanced\n",
      source: `
      import [TreeMap], compareInts from "std/tree_map.bpl";
      import [Array] from "std/array.bpl";
      extern printf(fmt: string, ...);
      frame join(label: string, values: Array<int>) {
        printf("%s", label);
        loop (local i: int = 0; i < values.length; i = i + 1) { printf(" %d", values.get(i)); }
        printf("\\n");
      }
      frame main() ret int {
        local t: TreeMap<int, int> = TreeMap<int, int>.new(compareInts);
        ${statements.join("\n")}
        printf("size %d\\n", t.len());
        local keys: Array<int> = t.keys(); join("keys", keys); keys.destroy();
        local values: Array<int> = t.values(); join("values", values); values.destroy();
        printf("bounds %d %d %d %d\\n", t.minKey().unwrap(), t.maxKey().unwrap(), t.floorKey(30).unwrapOr(-1), t.ceilingKey(30).unwrapOr(-1));
        local range: Array<int> = t.keysInRange(10, 20); join("range", range); range.destroy();
        # An AVL tree of n keys is at most about 1.44 log2(n + 2) high.
        if (t.height() > 9) { return 4; }
        printf("balanced\\n");
        t.destroy();
        if (!t.isEmpty()) { return 5; }
        return 0;
      }
    `,
    },
  ]);
}, 120000);

it("supports ring buffers, LRU caches, union-find and tries", () => {
  expectCorrectnessSuite([
    {
      name: "collections",
      validateLlvm: true,
      expectedStdout: [
        "ring 3 full true push false front 1 back 3",
        "overwrite 1 then 2 3 4",
        "ring ops 0 2 9 iter 0 2 9 pop 9 0 len 1",
        "lru miss evicted true oldest b",
        "lru values 10 none 30 40 order d a c",
        "lru evict c 30 remove true false len 2",
        "uf sets 3 true false size 3 union false",
        "trie 5 true false prefix true false count 3",
        "trie keys: car card care cat",
        "trie all: a car card care cat dog",
        "trie longest 4 3 -1 remove true false 4 count 2",
        "trie after: card cat",
        "",
      ].join("\n"),
      source: `
      import [RingBuffer], [RingBufferIterator] from "std/ring_buffer.bpl";
      import [LruCache] from "std/lru_cache.bpl";
      import [UnionFind] from "std/union_find.bpl";
      import [Trie] from "std/trie.bpl";
      import [String] from "std/string.bpl";
      import [Array] from "std/array.bpl";
      import [Option] from "std/option.bpl";
      extern printf(fmt: string, ...);
      frame showKeys(label: string, keys: Array<String>) {
        printf("%s:", label);
        loop (local i: int = 0; i < keys.length; i = i + 1) {
          local key: String = keys.get(i);
          printf(" %s", key.cstr());
          key.destroy();
        }
        printf("\\n");
      }
      frame main() ret int {
        local ring: RingBuffer<int> = RingBuffer<int>.new(3);
        ring.push(1); ring.push(2); ring.push(3);
        printf("ring %d full %s push %s front %d back %d\\n", ring.len(), ring.isFull() ? "true" : "false", ring.push(4) ? "true" : "false", ring.front().unwrap(), ring.back().unwrap());
        local dropped: int = ring.pushOverwrite(4).unwrap();
        printf("overwrite %d then %d %d %d\\n", dropped, ring.get(0), ring.get(1), ring.get(2));
        ring.pop();
        ring.pushFront(0);
        ring.set(1, 2);
        ring.popBack();
        ring.push(9);
        local arr: Array<int> = ring.toArray();
        printf("ring ops %d %d %d iter", arr.get(0), arr.get(1), arr.get(2));
        arr.destroy();
        local it: RingBufferIterator<int> = ring.iterator();
        loop {
          local v: Option<int> = it.next();
          if (v.isNone()) { break; }
          printf(" %d", v.unwrap());
        }
        local popped: int = ring.popBack().unwrap();
        local first: int = ring.pop().unwrap();
        printf(" pop %d %d len %d\\n", popped, first, ring.len());
        ring.destroy();

        local cache: LruCache<string, int> = LruCache<string, int>.new(3);
        cache.put("a", 10); cache.put("b", 20); cache.put("c", 30);
        cache.get("a");
        local evicted: bool = cache.put("d", 40);
        printf("lru miss evicted %s oldest %s\\n", evicted ? "true" : "false", "b");
        printf("lru values %d %s %d %d order", cache.get("a").unwrap(), cache.get("b").isNone() ? "none" : "some", cache.peek("c").unwrap(), cache.get("d").unwrap());
        local order: Array<string> = cache.keysByRecency();
        loop (local i: int = 0; i < order.length; i = i + 1) { printf(" %s", order.get(i)); }
        printf("\\n");
        order.destroy();
        local oldKey: string = "";
        local oldValue: int = 0;
        cache.get("a");
        cache.putEvicting("e", 50, &oldKey, &oldValue);
        local removed: bool = cache.remove("e");
        printf("lru evict %s %d remove %s %s len %d\\n", oldKey, oldValue, removed ? "true" : "false", cache.remove("zzz") ? "true" : "false", cache.len());
        if (cache.oldestKey().unwrap() != "d") { return 1; }
        cache.clear();
        if (cache.len() != 0) { return 2; }
        cache.destroy();

        local uf: UnionFind = UnionFind.new(6);
        uf.union(0, 1); uf.union(1, 2); uf.union(3, 4);
        printf("uf sets %d %s %s size %d union %s\\n", uf.setCount(), uf.connected(0, 2) ? "true" : "false", uf.connected(0, 3) ? "true" : "false", uf.setSize(2), uf.union(2, 0) ? "true" : "false");
        uf.destroy();

        local trie: Trie<int> = Trie<int>.new();
        trie.insert("car", 1); trie.insert("card", 2); trie.insert("cat", 3); trie.insert("dog", 4); trie.insert("care", 5);
        trie.insert("car", 6);
        trie.insert("a", 7);
        printf("trie %d %s %s prefix %s %s count %d\\n", trie.get("card").unwrap() + trie.get("car").unwrap() - 3, trie.has("cat") ? "true" : "false", trie.has("ca") ? "true" : "false", trie.hasPrefix("ca") ? "true" : "false", trie.hasPrefix("x") ? "true" : "false", trie.countPrefix("car"));
        showKeys("trie keys", trie.keysWithPrefix("ca"));
        showKeys("trie all", trie.keysWithPrefix(""));
        local longest: int = trie.longestPrefixOf("cards");
        local mid: int = trie.longestPrefixOf("carx");
        local none: int = trie.longestPrefixOf("zebra");
        local r1: bool = trie.remove("car");
        local r2: bool = trie.remove("car");
        trie.remove("care");
        printf("trie longest %d %d %d remove %s %s %d count %d\\n", longest, mid, none, r1 ? "true" : "false", r2 ? "true" : "false", trie.len(), trie.countPrefix("ca"));
        showKeys("trie after", trie.keysWithPrefix("c"));
        trie.destroy();
        return 0;
      }
    `,
    },
  ]);
}, 120000);

it("runs graph traversals and shortest paths", () => {
  expectCorrectnessSuite([
    {
      name: "graph algorithms",
      validateLlvm: true,
      expectedStdout: [
        "bfs: 0 1 2 3 4",
        "dist: 0 1 1 2 3 -1",
        "dfs: 0 1 3 4 2",
        "dijkstra: 0 3 1 4 7 unreachable",
        "path: 0 2 1 3 4",
        "topo: 0 2 1 3 4 5",
        "cycle false true",
        "components 3: 0 0 0 1 1 2",
        "scc 3: 0 0 0 1 2",
        "mst 6 edges 3",
        "bipartite true false",
        "bellman: 0 4 2 -1",
        "negative cycle none",
        "edges 7 degree 3 has true false neighbors 3",
        "",
      ].join("\n"),
      source: `
      import [Graph], [GraphEdge], GRAPH_UNREACHABLE from "std/graph.bpl";
      import [Array] from "std/array.bpl";
      import [Option] from "std/option.bpl";
      extern printf(fmt: string, ...);
      frame show(label: string, values: Array<int>) {
        printf("%s:", label);
        loop (local i: int = 0; i < values.length; i = i + 1) { printf(" %d", values.get(i)); }
        printf("\\n");
        local copy: Array<int> = values;
        copy.destroy();
      }
      frame main() ret int {
        local g: Graph = Graph.undirectedGraph(6);
        g.connect(0, 1); g.connect(0, 2); g.connect(1, 3); g.connect(3, 4); g.connect(2, 3);
        show("bfs", g.bfs(0));
        show("dist", g.bfsDistances(0));
        show("dfs", g.dfs(0));
        g.destroy();

        local w: Graph = Graph.directedGraph(6);
        w.addEdge(0, 1, cast<long>(4)); w.addEdge(0, 2, cast<long>(1)); w.addEdge(2, 1, cast<long>(2));
        w.addEdge(1, 3, cast<long>(1)); w.addEdge(2, 3, cast<long>(5)); w.addEdge(3, 4, cast<long>(3));
        local d: Array<long> = w.dijkstra(0);
        printf("dijkstra:");
        loop (local i: int = 0; i < d.length; i = i + 1) {
          if (d.get(i) == GRAPH_UNREACHABLE) { printf(" unreachable"); } else { printf(" %ld", d.get(i)); }
        }
        printf("\\n"); d.destroy();
        show("path", w.shortestPath(0, 4));
        local topo: Option<Array<int>> = w.topologicalSort();
        show("topo", topo.unwrap());
        local acyclic: bool = w.hasCycle();
        w.addEdge(4, 0, cast<long>(1));
        printf("cycle %s %s\\n", acyclic ? "true" : "false", w.hasCycle() ? "true" : "false");
        if (w.topologicalSort().isSome()) { return 1; }
        w.destroy();

        local c: Graph = Graph.undirectedGraph(6);
        c.connect(0, 1); c.connect(1, 2); c.connect(3, 4);
        local count: int = 0;
        local labels: Array<int> = c.connectedComponents(&count);
        printf("components %d", count);
        show("", labels);
        c.destroy();

        local s: Graph = Graph.directedGraph(5);
        s.connect(0, 1); s.connect(1, 2); s.connect(2, 0); s.connect(2, 3); s.connect(3, 4);
        local sccCount: int = 0;
        local scc: Array<int> = s.stronglyConnectedComponents(&sccCount);
        printf("scc %d", sccCount);
        show("", scc);
        s.destroy();

        local m: Graph = Graph.undirectedGraph(4);
        m.addEdge(0, 1, cast<long>(1)); m.addEdge(1, 2, cast<long>(2)); m.addEdge(0, 2, cast<long>(5));
        m.addEdge(2, 3, cast<long>(3)); m.addEdge(1, 3, cast<long>(7));
        local total: long = 0;
        local tree: Array<GraphEdge> = m.minimumSpanningTree(&total);
        printf("mst %ld edges %d\\n", total, tree.length);
        tree.destroy();
        local square: Graph = Graph.undirectedGraph(4);
        square.connect(0, 1); square.connect(1, 2); square.connect(2, 3); square.connect(3, 0);
        local triangle: Graph = Graph.undirectedGraph(3);
        triangle.connect(0, 1); triangle.connect(1, 2); triangle.connect(2, 0);
        printf("bipartite %s %s\\n", square.isBipartite() ? "true" : "false", triangle.isBipartite() ? "true" : "false");
        square.destroy(); triangle.destroy();

        local b: Graph = Graph.directedGraph(4);
        b.addEdge(0, 1, cast<long>(4)); b.addEdge(0, 2, cast<long>(5)); b.addEdge(2, 1, cast<long>(-1));
        b.addEdge(1, 3, cast<long>(-5)); b.addEdge(2, 3, cast<long>(2));
        local bf: Array<long> = b.bellmanFord(0).unwrap();
        printf("bellman: %ld %ld %ld %ld\\n", bf.get(0), bf.get(1), bf.get(2) - 3, bf.get(3));
        bf.destroy();
        b.addEdge(3, 0, cast<long>(-1));
        printf("negative cycle %s\\n", b.bellmanFord(0).isNone() ? "none" : "some");
        b.destroy();

        m.connect(3, 3); m.connect(0, 3);
        local neighbours: Array<int> = m.neighbors(2);
        printf("edges %d degree %d has %s %s neighbors %d\\n", m.edgeCount(), m.outDegree(0), m.hasEdge(3, 0) ? "true" : "false", m.hasEdge(0, 0) ? "true" : "false", neighbours.length);
        neighbours.destroy();
        m.destroy();
        return 0;
      }
    `,
    },
  ]);
}, 120000);

it("releases collection storage on destroy", () => {
  expectTrackedAllocations(`
import [TreeMap], compareInts from "std/tree_map.bpl";
import [Trie] from "std/trie.bpl";
import [LruCache] from "std/lru_cache.bpl";
import [RingBuffer] from "std/ring_buffer.bpl";
import [UnionFind] from "std/union_find.bpl";
import [Graph] from "std/graph.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
extern tracking_begin();
extern tracking_live() ret int;
frame main() ret int {
  tracking_begin();
  loop (local round: int = 0; round < 3; round = round + 1) {
    local t: TreeMap<int, int> = TreeMap<int, int>.new(compareInts);
    loop (local i: int = 0; i < 200; i = i + 1) { t.put((i * 37) % 101, i); }
    loop (local i: int = 0; i < 100; i = i + 2) { t.remove(i); }
    local keys: Array<int> = t.keys(); keys.destroy();
    t.destroy();
    local trie: Trie<int> = Trie<int>.new();
    trie.insert("alpha", 1); trie.insert("alps", 2); trie.insert("beta", 3); trie.insert("al", 4);
    trie.remove("alps"); trie.remove("beta");
    local found: Array<String> = trie.keysWithPrefix("a");
    loop (local i: int = 0; i < found.length; i = i + 1) { local s: String = found.get(i); s.destroy(); }
    found.destroy();
    trie.destroy();
    local cache: LruCache<int, int> = LruCache<int, int>.new(4);
    loop (local i: int = 0; i < 50; i = i + 1) { cache.put(i % 9, i); cache.get(i % 5); }
    cache.destroy();
    local ring: RingBuffer<long> = RingBuffer<long>.new(5);
    ring.pushOverwrite(cast<long>(1)); ring.destroy();
    local uf: UnionFind = UnionFind.new(10); uf.union(1, 2); uf.destroy();
    local g: Graph = Graph.directedGraph(5);
    g.connect(0, 1); g.connect(1, 2); g.connect(2, 0); g.connect(3, 4);
    local count: int = 0;
    local scc: Array<int> = g.stronglyConnectedComponents(&count); scc.destroy();
    local order: Array<int> = g.bfs(0); order.destroy();
    local path: Array<int> = g.shortestPath(0, 2); path.destroy();
    local cc: Array<int> = g.connectedComponents(&count); cc.destroy();
    g.hasCycle(); g.isBipartite();
    g.destroy();
    if (tracking_live() != 0) { return 1 + round; }
  }
  return 0;
}`);
}, 120000);
