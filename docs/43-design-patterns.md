# Design Patterns

Common patterns in BPL.

## Factory Pattern

Use static methods to create instances.

```bpl
struct User {
    name: string;
    frame create(name: string) ret User {
        local u: User;
        u.name = name;
        return u;
    }
}
```

## RAII (Resource Acquisition Is Initialization)

Use structs to manage resources, though manual cleanup is required (no automatic destructors yet).
