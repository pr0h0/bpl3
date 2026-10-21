# Generic Structs

The opening `<` must immediately follow the generic name, as in `Box<T>`;
`Box <T>` is not generic syntax. Spaces and comments inside the brackets are
allowed. This rule also applies to generic declarations, calls and literals.

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


Generic struct and enum arguments are invariant. For example, `Box<int[2]>`
cannot be assigned, passed or returned as `Box<int[]>`, and `Box<u8>` does not
implicitly become `Box<int>`. Convert the payload explicitly and construct the
intended instantiation. Primitive aliases with equivalent types remain
compatible; a payload conversion is not an automatic conversion of its wrapper.
