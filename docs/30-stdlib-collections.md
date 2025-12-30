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

A key-value store (associative array). Currently implemented as a list of pairs (O(n) lookup).

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

```bpl
import [Queue] from "std/queue.bpl";

local q: Queue<int> = Queue<int>.new(10);
q.enqueue(1);
q.enqueue(2);
local first: int = q.dequeue().unwrap(); # 1
q.destroy();
```

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
