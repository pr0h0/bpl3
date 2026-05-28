# Design Patterns

Common patterns in BPL.

## Factory Pattern

Use static methods to create instances.

```bpl
struct User {
    name: string,
    frame create(name: string) ret User {
        local u: User;
        u.name = name;
        return u;
    }
}
```

## RAII (Resource Acquisition Is Initialization)

Use structs to manage resources. Cleanup methods run automatically for value locals only when `destroy(this: *T)` is marked with `@[auto_destroy]`; unmarked cleanup methods are still called manually.

```bpl
struct Resource {
    handle: int,

    @[auto_destroy]
    frame destroy(this: *Resource) ret void {
        # release this.handle here
    }
}

frame useResource() ret void {
    local resource: Resource;
    resource.handle = 42;
} # resource.destroy() runs here
```
