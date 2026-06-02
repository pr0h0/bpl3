import [printf] from "std/c.bpl";

# Generic Struct
struct Box<T> {
    value: T,
    frame new(val: T) ret Box<T> {
        local b: Box<T>;
        b.value = val;
        return b;
    }

    frame get(this: Box<T>) ret T {
        return this.value;
    }

    frame set(this: *Box<T>, val: T) {
        this.value = val;
    }
}

# Generic Struct with Multiple Parameters
struct Pair<K, V> {
    first: K,
    second: V,
    frame new(k: K, v: V) ret Pair<K, V> {
        local p: Pair<K, V>;
        p.first = k;
        p.second = v;
        return p;
    }

    frame print(this: Pair<K, V>) {
        # Note: We can't easily print generic types without specialization or traits
        # So we'll just print a placeholder or assume specific types for this example
        # But here we can't assume types.
        # For this example, we'll just print that it's a Pair.
        printf("Pair(?, ?)\n");
    }
}

# Generic Function
frame identity<T>(val: T) ret T {
    return val;
}

# Generic Swap
frame swap<T>(a: T, b: T) ret (T, T) {
    return (b, a);
}

frame main() ret int {
    printf("--- Generics Test ---\n");

    # Test Box<int>
    local b1: Box<int> = Box<int>.new(10);
    printf("Box<int>: %d\n", b1.get());

    b1.set(20);
    printf("Box<int> updated: %d\n", b1.get());

    # Test Box<float>
    local b2: Box<float> = Box<float>.new(3.14);
    printf("Box<float>: %.2f\n", b2.get());

    # Test Pair<int, int>
    local p1: Pair<int, int> = Pair<int, int>.new(1, 2);
    printf("Pair<int, int>: (%d, %d)\n", p1.first, p1.second);

    # Test Generic Function
    local x: int = identity<int>(42);
    printf("Identity<int>: %d\n", x);

    local s: string = identity<string>("hello");
    printf("Identity<string>: %s\n", s);

    # Test Generic Swap
    local (swapped_a: int, swapped_b: int) = swap<int>(100, 200);
    printf("Swap<int>(100, 200): (%d, %d)\n", swapped_a, swapped_b);

    # Test Nested Generics
    local inner: Box<int> = Box<int>.new(999);
    local outer: Box<Box<int>> = Box<Box<int>>.new(inner);

    local retrieved_inner: Box<int> = outer.get();
    printf("Nested Box<Box<int>>: %d\n", retrieved_inner.get());

    return 0;
}
