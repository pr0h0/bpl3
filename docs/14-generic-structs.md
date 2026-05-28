# Generic Structs

Structs can be parameterized with types.

## Syntax

```bpl
struct Box<T> {
    value: T,
}

struct Pair<K, V> {
    key: K,
    value: V,
}
```

## Usage

```bpl
local b: Box<int>;
b.value = 42;

local p: Pair<string, int>;
p.key = "age";
p.value = 30;
```
