# Manual Memory Management

BPL relies on manual memory management for heap-allocated data.

## malloc and free

These functions are available via the standard library (libc).

```bpl
extern frame malloc(size: int) ret *void;
extern frame free(ptr: *void) ret void;

frame main() ret void {
    local ptr: *int = malloc(sizeof(int)) as *int;
    *ptr = 42;
    free(ptr);
}
```

## Best Practices

- Always pair `malloc` with `free`.
- Avoid double-freeing.
- Initialize pointers to `nullptr` after freeing if they might be accessed again.
