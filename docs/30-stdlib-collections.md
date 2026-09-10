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

## Map<K, V>

A key-value store backed by hash buckets and collision chains. Insertion grows
and rehashes the table before its load factor exceeds 3/4. With well-distributed
hashes, lookup and insertion have expected amortized O(1) cost.

`m.reserve(entryCount)` reserves space for at least that many entries without
shrinking. `m.bucketCount()` reports the current bucket count. Rehashing preserves
node/key/value storage but invalidates iterators; remove/clear/destroy also
invalidate references to removed entries. Custom hash/equality callbacks must be
stable, non-mutating, and non-throwing.

Default keys use value equality. Integer and boolean keys have numeric hashes;
`string` and `String` keys use content hashing and equality. Floating-point keys
treat positive/negative zero as the same key and all NaNs as the same key.
Other equality-comparable keys use their `==` operation with a constant hash,
which is correct but gives linear lookup. Supply the custom
`Map<K, V>.new(capacity, hasher, equaler)` overload for efficient compound keys.
Custom equality must be an equivalence relation, and equal keys must have equal
hashes. Keys must remain unchanged while stored in the map.

```bpl
import [Map] from "std/map.bpl";

local m: Map<string, int> = Map<string, int>.new(16);
m.set("age", 30);
if (m.has("age")) {
    local age: int = m.get("age").unwrap();
}
m.destroy();
```

## Set<T>

A collection of unique values.

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

A doubly linked list.

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
