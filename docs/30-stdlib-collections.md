# Standard Library: Collections

The BPL standard library provides a set of common data structures for managing collections of data.

## Array<T>

A dynamic array implementation that grows automatically.

```bpl
import [Array] from "std/array.bpl";

local arr: Array<int> = Array<int>.new(10);
arr.push(1);
arr.push(2);
local val: int = arr.get(0);
arr.destroy();
```

`arr.insert(index, value)` inserts at any index from 0 to `len()` (inclusive),
shifting later elements right, and throws `IndexOutOfBoundsError` otherwise.
`arr.clear()` removes every element but keeps the allocated capacity; it does
not destroy elements, so release owned elements first. `arr.isEmpty()`
reports whether the array has no elements.

`arr.sortBy(compare)` sorts in place with a `Lambda<int>(T, T)` that returns a
negative number, zero or a positive number when its first argument belongs
before, with or after its second. The sort is stable, so equal elements keep
their order, and runs in O(n log n) with one temporary buffer, which is
released if `compare` throws (the elements are then in an unspecified order):

```bpl
words.sortBy(|a: string, b: string| ret int {
    return strcmp(a, b);
});
```

`map` and `filter` release their result-array buffer if a callback throws and
propagate the original exception. Elements are shallow values: callbacks remain
responsible for any separately allocated resources they create.

### More Array methods

`reserve`, `extend(&other)` (also with itself), `first`/`last` (Options),
`reverse`, `swap`, `slice(start, end)` (clamped, new array), `retain(keep)`
and `dedup`/`dedupBy(same)` (return the number removed; `dedup` compares
strings by content), `swapRemove` (O(1), unordered), `truncate`, `fill`,
`rotateLeft` (negative rotates right), `lastIndexOf`, `countWhere`,
`isSortedBy`, `binarySearchBy(probe)` (index, or `-(insertion point) - 1`),
`partitionPoint(before)` (lower bound), `minBy`/`maxBy` and `shrinkToFit`.
Elements are copied shallowly and never destroyed.

## Map<K, V>

A key-value store backed by hash buckets and collision chains. Insertion grows
and rehashes the table before its load factor exceeds 3/4. With well-distributed
hashes, lookup and insertion have expected amortized O(1) cost.

`m.reserve(entryCount)` reserves space for at least that many entries without
shrinking. `m.bucketCount()` reports the current bucket count. Rehashing preserves
node/key/value storage but invalidates iterators; remove/clear/destroy also
invalidate references to removed entries. Custom hash/equality callbacks must be
stable, non-mutating, and non-throwing.

Default keys use value equality. Numeric and pointer hashes pass through a
64-bit mixing step so strides do not collapse into power-of-two buckets;
`string` and `String` keys use content hashing and equality. Floating-point keys
treat positive/negative zero as the same key and all NaNs as the same key.
Other equality-comparable compound keys use their `==` operation with a constant hash,
which is correct but gives linear lookup. Supply the custom
`Map<K, V>.new(capacity, hasher, equaler)` overload for efficient compound keys.
Custom equality must be an equivalence relation, and equal keys must have equal
hashes. Keys must remain unchanged while stored in the map. Map equality
(`a == b`) compares values with the same default equality, so `string` values
compare by content. `Array.indexOf` and `contains` also compare `string`
elements by content (a null element matches only null); other element types
use `==`.

```bpl
import [Map] from "std/map.bpl";

local m: Map<string, int> = Map<string, int>.new(16);
m.set("age", 30);
if (m.has("age")) {
    local age: int = m.get("age").unwrap();
}
m.destroy();
```

`m.getOr(key, fallback)` returns the stored value or `fallback` without an
`Option`. `m.keys()` and `m.values()` return new arrays, in the map's
iteration order, that the caller destroys; keys and values are copied
shallowly, as stored, so the arrays must not outlive owned entries they
refer to.

`reserve` computes all new bucket destinations before relinking entries. If a
custom hasher throws or temporary allocation fails, the existing entries and
bucket count remain unchanged. Temporary rehash storage is released on failure.
Hash and equality callbacks must not mutate the map while it is operating.

`set` throws `"Map node allocation failed"` if a new entry cannot be allocated.
Existing entries and the entry count remain intact; bucket capacity may already
have grown. Updating an existing key does not allocate a node.

### More Map methods

`getRef(key)` returns a pointer to the stored value (null when absent) that
stays valid until the entry is removed; `getOrInsert(key, value)` inserts
first when needed. `update(key, initial, transform)` applies a function to
the current value, which makes counting concise:
`counts.update(word, 0, |n: int| ret int { return n + 1; })`. Also
`entries()` (an `Array<Pair<K, V>>`), `forEach(visit)`, `retain(keep)`,
`merge(&other)` (other's values win) and `isEmpty()`.

## Set<T>

A collection of unique values.

`union`, `difference`, and `intersection` release partially built result storage
if hashing, equality, or allocation throws. Elements are shallow copies; owned
resources inside keys remain the caller's responsibility.

```bpl
import [Set] from "std/set.bpl";

local s: Set<int> = Set<int>.new(16);
s.add(10);
s.add(20);
if (s.has(10)) {
    # ...
}
s.destroy();
```

`s.isEmpty()` reports whether the set has no elements, and
`s.isSubsetOf(&other)` whether every element is also in `other` (the empty set
is a subset of every set). `s.toArray()` returns a new array of the elements,
in iteration order, that the caller destroys.

### More Set methods

`Set<T>.fromArray(&values)`, `addAll(&other)`, `insert(value)` (true when new),
`isSupersetOf`, `isDisjoint`, `symmetricDifference` (a new set), `retain(keep)`
(returns the number removed) and `forEach(visit)`.

## Stack<T>

A Last-In-First-Out (LIFO) data structure.

```bpl
import [Stack] from "std/stack.bpl";

local s: Stack<int> = Stack<int>.new(10);
s.push(1);
s.push(2);
local top: int = s.pop().unwrap(); # 2
s.destroy();
```

## Queue<T>

Queue growth and wrapped indices use wide arithmetic. Once capacity reaches
2,147,483,647 entries, further growth throws `"Queue capacity exceeded"` before
changing the existing queue.

A First-In-First-Out (FIFO) data structure. Optimized with a circular buffer.

Non-positive initial capacities create an empty queue that grows on demand.
`clear()` retains storage; `destroy()` releases storage and resets the queue to
empty, allowing reuse. Neither operation destroys resources owned by elements.
Structural changes invalidate iterators.

```bpl
import [Queue] from "std/queue.bpl";

local q: Queue<int> = Queue<int>.new(10);
q.enqueue(1);
q.enqueue(2);
local first: int = q.dequeue().unwrap(); # 1
q.destroy();
```

## Deque<T>

A double-ended queue backed by a growable circular buffer. Push/pop at either
end have amortized O(1) cost; indexed access is O(1). Growth and `clone()` are
O(n). Import `Deque` and `DequeIterator` from `std/deque.bpl` or `std`.

```bpl
import [Deque] from "std/deque.bpl";

local work: Deque<int> = Deque<int>.new();
work.pushBack(20);
work.pushFront(10);
local first: int = work.popFront().unwrap(); # 10
local last: int = work.popBack().unwrap(); # 20
work.destroy();
```

- `new()` starts with capacity 8; `new(capacity)` accepts zero and normalizes
  negative capacity to zero. Storage grows automatically as needed.
- `pushFront(value)`, `pushBack(value)` insert elements.
- `popFront()`, `popBack()`, `peekFront()`, `peekBack()`, and `get(index)` return
  `Option<T>`; empty queues and invalid indices return `None`.
- `set(index, value)` returns false for an invalid index, leaving the queue unchanged.
- `size()`, `capacity()`, `isEmpty()`, and `reserve(minimum)` inspect or reserve
  storage. Reserve never shrinks. Allocation/capacity failures throw a string.
- `iterator()` visits front to back. Structural changes invalidate iterators.
- `clone()` allocates independent storage with shallow element copies.
- `clear()` retains storage; `destroy()` frees storage and resets the queue.
  Both allow reuse. Neither destroys element-owned resources. Do not copy an
  owning deque by assignment and then destroy both copies; use `clone()` instead.

See [the deque example](../examples/stdlib_deque/main.bpl).

## LinkedList<T>

A doubly linked list. `pushFront` and `pushBack` throw
`"LinkedList capacity exceeded"` when the length is already 2,147,483,647, or
`"LinkedList allocation failed"` when a node cannot be allocated. Either failure
leaves the list unchanged.

```bpl
import [LinkedList] from "std/linked_list.bpl";

local list: LinkedList<int> = LinkedList<int>.new();
list.pushBack(10);
list.pushFront(5);
local val: int = list.popBack().unwrap(); # 10
list.destroy();
```

## PriorityQueue<T>

A Min-Heap implementation where the smallest element is popped first.

```bpl
import [PriorityQueue] from "std/priority_queue.bpl";

local pq: PriorityQueue<int> = PriorityQueue<int>.new(10);
pq.push(30);
pq.push(10);
pq.push(20);
local min: int = pq.pop().unwrap(); # 10
pq.destroy();
```

## RingBuffer<T>

`std/ring_buffer.bpl` is a fixed-capacity circular FIFO whose storage is
allocated once. `push` returns `false` when full; `pushOverwrite` drops and
returns the oldest value instead, which suits "last N" histories. It also has
`pushFront`, `pop`, `popBack`, `front`, `back`, checked `get`/`set` (index 0 is
the oldest), `toArray`, `iterator`, `clear` and `destroy`.

## LruCache<K, V>

`std/lru_cache.bpl` is a bounded map that evicts the least recently used
entry, with O(1) average `get`, `put` and `remove`. `get` marks an entry as
used; `peek` does not. `put` returns whether an entry was evicted, and
`putEvicting(key, value, &oldKey, &oldValue)` also hands back the evicted
entry so owned keys or values can be released. `keysByRecency` lists keys from
most to least recently used and `oldestKey` names the next eviction. Keys use
`Map` hashing and equality, so `string` keys compare by content.

```bpl
import [LruCache] from "std/lru_cache.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local cache: LruCache<string, int> = LruCache<string, int>.new(2);
    cache.put("a", 1);
    cache.put("b", 2);
    cache.get("a");
    cache.put("c", 3); # evicts "b"
    printf("%d %d\n", cache.has("b"), cache.len()); # 0 2
    cache.destroy();
    return 0;
}
```

## TreeMap<K, V>

`std/tree_map.bpl` is an ordered map backed by an AVL tree. It takes a
comparator `Lambda<int>(K, K)`; `compareInts`, `compareLongs` and
`compareStrings` are provided. `put`, `get`, `getOr`, `has` and `remove` are
O(log n). Ordered queries are `minKey`, `maxKey`, `floorKey` (greatest key
`<=`), `ceilingKey` (smallest key `>=`), `keys`, `values`, `keysInRange(low,
high)`, `forEach` and `forEachInRange`, all in ascending order over the
half-open range `[low, high)`.

## Trie<V>

`std/trie.bpl` maps null-terminated string keys to values byte by byte.
Besides `insert`, `get`, `has` and `remove` (which frees empty branches), it
answers `hasPrefix`, `countPrefix`, `keysWithPrefix` (ordered `String` keys the
caller destroys) and `longestPrefixOf(text)` (the byte length of the longest
stored key that prefixes `text`, or -1).

## UnionFind

`std/union_find.bpl` tracks disjoint sets of `0..n-1` with union by size and
path halving: `find`, `union` (false when already joined), `connected`,
`setSize` and `setCount`.

## Graph

`std/graph.bpl` stores a weighted directed or undirected graph over vertices
`0..n-1` (`Graph.directedGraph(n)`, `Graph.undirectedGraph(n)`, `addVertex`,
`addEdge(source, target, weight)`, `connect` for weight 1). Algorithms return
new arrays owned by the caller:

| Method                                         | Result                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `bfs(start)`, `dfs(start)`                     | Visit order, following edges in insertion order                       |
| `bfsDistances(start)`                          | Edge counts, -1 when unreachable                                      |
| `dijkstra(start)`, `dijkstraWith(start, &pre)` | Distances (`GRAPH_UNREACHABLE` when unreachable), predecessors        |
| `shortestPath(source, target)`                 | Vertices of a shortest path, empty when unreachable                   |
| `bellmanFord(start)`                           | Distances with negative weights; `None` on a reachable negative cycle |
| `topologicalSort()`                            | Smallest-ready-first order, `None` when cyclic                        |
| `hasCycle()`                                   | Directed or undirected cycle detection                                |
| `connectedComponents(&count)`                  | A label per vertex, edges treated as undirected                       |
| `stronglyConnectedComponents(&count)`          | Kosaraju labels in topological order of the condensation              |
| `minimumSpanningTree(&total)`                  | Kruskal's edges and total weight                                      |
| `isBipartite()`                                | Two-colourability                                                     |

`neighbors`, `outDegree`, `hasEdge` and `edgeCount` inspect the structure.
Dijkstra throws on a negative weight.

```bpl
import [Graph] from "std/graph.bpl";
import [Array] from "std/array.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local graph: Graph = Graph.directedGraph(4);
    graph.addEdge(0, 1, cast<long>(5));
    graph.addEdge(0, 2, cast<long>(1));
    graph.addEdge(2, 1, cast<long>(1));
    graph.addEdge(1, 3, cast<long>(1));
    local distances: Array<long> = graph.dijkstra(0);
    printf("%ld\n", distances.get(3)); # 3
    distances.destroy();
    graph.destroy();
    return 0;
}
```
