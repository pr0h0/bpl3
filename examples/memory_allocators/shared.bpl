import [Allocator] from "std/memory/allocator.bpl";

import [printf] from "std/c.bpl";

export [showcase_allocator];

struct Point {
    x: int,
    y: int,
}

# Generic showcase frame
frame showcase_allocator<T: Allocator>(allocator: *T, name: string) {
    printf("--- Testing %s ---\n", name);

    # 1. Alloc tiny
    local p1: *u8 = cast<*u8>(allocator.alloc(1));
    if (p1 == nullptr) {
        printf("FAILED: Alloc 1 byte returned null\n");
        return;
    }
    *p1 = 42;
    printf("Alloc 1 byte: stored %d at %p (aligned)\n", *p1, p1);

    # 2. Alloc generic struct
    local p2: *Point = cast<*Point>(allocator.alloc(sizeof(Point)));
    p2.x = 10;
    p2.y = 20;
    printf("Alloc Point: (%d, %d) at %p\n", p2.x, p2.y, p2);

    # 3. Alloc array part
    local p3: *int = cast<*int>(allocator.alloc(cast<ulong>(5) * sizeof(int)));
    *p3 = 100;
    *(p3 + 1) = 200;
    printf("Alloc Array[5]: [%d, %d, ...] at %p\n", *p3, *(p3 + 1), p3);

    # 4. Use free (if supported)
    allocator.free(cast<*void>(p1));
    allocator.free(cast<*void>(p2));
    allocator.free(cast<*void>(p3));

    # Reset (if supported)
    allocator.reset();

    printf("Success\n\n");
}
