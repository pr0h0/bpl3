# Inheritance

BPL supports single inheritance for structs.

## Syntax

Use the `:` operator to specify the parent struct.

```bpl
struct Animal {
    name: string
}

struct Dog : Animal {
    breed: string
}
```

## Memory Layout

The fields of the parent struct are included at the beginning of the child struct. This allows for safe casting (pointer casting) from Child* to Parent*.

```bpl
struct Animal {
    name: string
}

struct Dog : Animal {
    breed: string
}

frame main() ret int {
    local d: Dog;
    d.name = "Rex";
    d.breed = "Labrador";
    return 0;
}
```
