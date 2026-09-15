# Manual Memory Management

BPL relies on manual memory management for heap-allocated data.

## malloc and free

These functions are available via the standard library (libc).

```bpl
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

frame main() ret void {
    local ptr: *int = cast<*int>(malloc(sizeof(int)));
    *ptr = 42;
    free(cast<*void>(ptr));
}
```

## Best Practices

- Always pair `malloc` with `free`.
- Avoid double-freeing.
- Initialize pointers to `nullptr` after freeing if they might be accessed again.


## Manual allocator contracts

ArenaAllocator, StackAllocator, and PoolAllocator use native Linux/macOS mapping
helpers. Sizes are checked before alignment and mapping arithmetic; zero-byte
requests and unsupported sizes return nullptr. Callers must check returned
pointers. These allocators provide eight-byte alignment, not arbitrary over-aligned
type support. No allocation owns or destroys the values stored inside it.

Call init before first use and destroy before reinitializing a live allocator.
Arena reset and stack rewind/reset invalidate affected pointers. Pool free accepts
only a currently allocated block from that same pool; duplicate or foreign frees
are invalid. Do not shallow-copy allocator objects with live allocations.

Pool and arena destroy clear their bookkeeping and may be called again. Stack
destroy also clears its capacity and marker. Stack free_to_marker rejects forward
or unaligned markers by throwing a string without changing the current marker;
use a marker obtained from get_marker in the current allocation lifetime.

The public bookkeeping fields remain low-level implementation state. Manually
corrupting them, using expired pointers, or writing past an allocation is outside
these contracts and is not made memory-safe by the allocation size checks.


PageAllocator returns storage aligned to the native OS page size on Linux/macOS.
It rounds payload storage to pages and reserves an additional leading metadata
page. Zero-size requests, unsupported sizes, page-size lookup failure, and mapping
failure return nullptr. Free each allocation exactly once; reset is a no-op.
Pointers must be freed by the allocator implementation that created them: the
metadata layout is not a stable binary interface across compiler/library updates.
