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
