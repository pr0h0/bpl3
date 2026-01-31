# Type Matching

## Overview

BPL provides the `match<Type>(value)` expression for runtime type checking. This feature allows you to check if a value matches a specific type or enum variant at runtime. It is particularly useful for working with algebraic data types (enums) and will be the foundation for future generic type checking capabilities.

## Basic Usage

### Checking Enum Variants

The most common use case is checking if an enum value corresponds to a specific variant. This is often cleaner than a full `match` statement when you only care about one specific case.

**Syntax:** `match<EnumName.Variant>(value)`

```bpl
enum Option<T> {
    Some(T),
    None,
}

frame processOption(opt: Option<int>) ret int {
    # Check if the option is 'Some'
    if (match<Option.Some>(opt)) {
        printf("Value is present\n");
        # You can then safely extract the value (e.g., via pattern matching)
        return 1;
    } else {
        printf("Value is absent\n");
        return 0;
    }
}
```

### Return Type

The `match<Type>(value)` expression always returns a `bool`:

- `true`: If the value matches the specified type or variant.
- `false`: Otherwise.

## Advanced Usage

### Using in Logical Expressions

Since `match<Type>` returns a boolean, you can combine it with other logical operators:

```bpl
if (match<Option.Some>(opt) && isValid(opt)) {
    process(opt);
}
```

### Early Returns (Guard Clauses)

A common pattern is to use `match<Type>` for early returns to reduce nesting:

```bpl
frame getValue(opt: Option<int>) ret int {
    # Quick check for None case
    if (match<Option.None>(opt)) {
        return 0;  # Early return
    }

    # Proceed with logic for Some case
    # ...
    return 1;
}
```

## Implementation Details

### Enum Variant Matching

For enum variants, the compiler implements `match<Type>` by inspecting the **discriminant** (tag) of the enum value.

1.  **Discriminant Extraction**: The compiler generates code to read the hidden tag field of the enum.
2.  **Comparison**: It compares this tag against the known index of the requested variant.
3.  **Result**: The result of this integer comparison is returned as a boolean.

This operation is very efficient (O(1)) and does not involve heavy runtime type information (RTTI) overhead.

## Struct Pointer Type Checking

BPL provides runtime type checking for struct pointers using the `is` and `as` operators. This enables polymorphic code patterns with inheritance.

### The `is` Operator

The `is` operator checks if a struct pointer's runtime type matches or is derived from a target type.

**Syntax:** `pointer is *TargetType`

```bpl
struct Animal { name: string }
struct Dog : Animal { breed: string }

frame processAnimal(animal: *Animal) {
    if (animal is *Dog) {
        printf("It's a dog!\n");
    } else {
        printf("It's some other animal\n");
    }
}

frame main() ret int {
    local dog = Dog { name: "Buddy", breed: "Golden Retriever" };
    local animal: *Animal = &dog;  # Upcast to base type

    processAnimal(animal);  # Prints: "It's a dog!"
    return 0;
}
```

**Implementation:** The `is` operator compares vtable pointers at runtime. Each struct type in an inheritance hierarchy has a unique vtable, enabling O(1) type identification.

### The `as` Operator (Safe Downcast)

The `as` operator attempts a safe downcast and returns `nullptr` if the types don't match.

**Syntax:** `pointer as *TargetType`

```bpl
struct Animal { name: string }
struct Dog : Animal { breed: string }
struct Cat : Animal { indoor: bool }

frame processDog(animal: *Animal) {
    local dog = animal as *Dog;
    if (dog != nullptr) {
        printf("Dog breed: %s\n", dog.breed);
    } else {
        printf("Not a dog\n");
    }
}

frame main() ret int {
    local dog = Dog { name: "Buddy", breed: "Lab" };
    local cat = Cat { name: "Whiskers", indoor: true };

    processDog(cast<*Animal>(&dog));  # Prints: "Dog breed: Lab"
    processDog(cast<*Animal>(&cat));  # Prints: "Not a dog"
    return 0;
}
```

**Implementation:** The `as` operator checks the vtable at runtime. If the pointer's actual type matches the target type, it returns the casted pointer; otherwise, it returns `nullptr`.

### Combining `is` and `as`

A common pattern is to use `is` for the check and then immediately use `as`:

```bpl
frame handleAnimal(animal: *Animal) {
    if (animal is *Dog) {
        local dog = animal as *Dog;  # Safe - we know it's a Dog
        printf("Dog: %s (%s)\n", dog.name, dog.breed);
    } else if (animal is *Cat) {
        local cat = animal as *Cat;
        printf("Cat: %s (indoor: %d)\n", cat.name, cat.indoor);
    }
}
```

### Limitations

- **Struct pointers only**: The `is` and `as` operators for runtime type checking work only with struct pointer types that participate in inheritance hierarchies.
- **VTable requirement**: Both the source and target types must have vtables (either by having methods or by being part of an inheritance relationship).
- **No deep hierarchy checking**: Currently, `is` checks for exact type match against the target, not whether the type is anywhere in the inheritance chain above the target.

### Future: Generic Type Matching

The syntax `match<Type>` is designed to support checking against arbitrary types in the future (e.g., `match<int>(someGenericValue)`). Currently, this is partially implemented but requires a full RTTI system to work reliably for all types.

## Best Practices

- **Prefer Pattern Matching for Data Extraction**: If you need to access the data inside a variant, use the `match` statement instead. `match<Type>` is best for boolean checks.

  ```bpl
  # Preferred if you need 'x'
  match (opt) {
      Option.Some(x) => { ... },
      Option.None => { ... }
  }

  # Preferred if you just need to check existence
  if (match<Option.Some>(opt)) { ... }
  ```

- **Use `is` and `as` for Polymorphic Code**: When working with struct inheritance, use `is` to check types and `as` for safe downcasting.

  ```bpl
  # Pattern: Safe downcast with null check
  local dog = animal as *Dog;
  if (dog != nullptr) {
      # Work with dog
  }
  ```

- **Use for Control Flow**: Use `match<Type>` to direct control flow based on the "shape" of your data.
