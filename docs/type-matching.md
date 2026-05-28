# Type Matching with `match<Type>`

## Overview

BPL provides the `match<Type>(value)` expression for runtime type checking. This feature currently works with **enum variants** and provides a foundation for future generic type checking.

When `match<Type>(value)` appears directly in an `if` condition and `value` is a simple identifier, the true branch narrows that identifier to the matched type. The narrowing is scoped to the branch.

```bpl
frame describe(animal: *Animal) ret string {
    if (match<Dog>(animal)) {
        return animal.breed;  # animal is *Dog here
    }

    return animal.name;       # animal is *Animal here
}
```

## Basic Usage

### Checking Enum Variants

Use `match<EnumName.Variant>(value)` to check if an enum value is a specific variant:

```bpl
enum Option<T> {
    Some(T),
    None,
}

frame processOption(opt: Option<int>) ret int {
    if (match<Option.Some>(opt)) {
        printf("Value is present\n");
        return 1;
    } else {
        printf("Value is absent\n");
        return 0;
    }
}
```

### Return Type

`match<Type>(value)` always returns a `bool`:

- `true` if the value matches the specified type/variant
- `false` otherwise

## Common Patterns

### Early Returns

Check variants before pattern matching for early returns:

```bpl
frame getValue(opt: Option<int>) ret int {
    # Quick check before expensive operations
    if (match<Option.None>(opt)) {
        return 0;  # Early return
    }

    # Now we know it's Some, safe to extract
    return match (opt) {
        Option<int>.Some(x) => x,
        Option<int>.None => 0,  # Unreachable but needed for exhaustiveness
    };
}
```

### Validation

Validate enum state before processing:

```bpl
frame handleResponse(resp: Response<Data, Error>) ret bool {
    if (match<Response.Err>(resp)) {
        printf("Error occurred\n");
        return false;
    }

    # Continue with success case
    return true;
}
```

### Multiple Checks

Check multiple variants in sequence:

```bpl
frame classifyMessage(msg: Message) ret string {
    if (match<Message.Info>(msg)) {
        return "info";
    }
    if (match<Message.Warning>(msg)) {
        return "warning";
    }
    if (match<Message.Error>(msg)) {
        return "error";
    }
    return "unknown";
}
```

### Logical Expressions

Combine type checks with boolean logic:

```bpl
frame isErrorOrWarning(msg: Message) ret bool {
    return match<Message.Error>(msg) || match<Message.Warning>(msg);
}

frame isSome(opt: Option<int>) ret bool {
    return match<Option.Some>(opt);
}
```

## Integration with Pattern Guards

`match<Type>` works seamlessly with pattern guards in match expressions:

```bpl
frame processValue(opt: Option<int>) ret int {
    # Use type matching for early check
    if (!match<Option.Some>(opt)) {
        return 0;
    }

    # Then use pattern guards for detailed matching
    return match (opt) {
        Option<int>.Some(x) if x > 0 => x,
        Option<int>.Some(x) if x < 0 => -x,
        Option<int>.Some(_) => 0,
        Option<int>.None => 0,
    };
}
```

## Working with Generic Enums

`match<Type>` fully supports generic enums:

```bpl
enum Result<T, E> {
    Ok(T),
    Err(E),
}

frame isOk<T, E>(result: Result<T, E>) ret bool {
    return match<Result.Ok>(result);
}

frame main() ret int {
    local success: Result<int, string> = Result<int, string>.Ok(42);
    local failure: Result<int, string> = Result<int, string>.Err("failed");

    if (isOk<int, string>(success)) {
        printf("Success!\n");
    }

    if (!isOk<int, string>(failure)) {
        printf("Failure!\n");
    }

    return 0;
}
```

## Performance

`match<Type>` for enum variants is very efficient:

- Extracts the discriminant tag (single memory load)
- Compares with the variant index (single comparison)
- Total: ~2-3 CPU instructions after LLVM optimization

This makes it suitable for hot code paths and performance-critical sections.

## Comparison with Pattern Matching

### When to use `match<Type>`

- Quick boolean check needed
- Early returns based on variant
- Conditional logic without extracting data
- Combining multiple type checks with boolean operators
- Validation before processing

### When to use pattern matching

- Need to extract variant data
- Complex branching with multiple cases
- Pattern guards for value-based conditions
- Want exhaustiveness checking
- More idiomatic for variant handling

### Example Comparison

Using `match<Type>`:

```bpl
if (match<Option.Some>(opt)) {
    # Still need another match to extract value
    local value: int = match (opt) {
        Option<int>.Some(x) => x,
        Option<int>.None => 0,  # unreachable
    };
}
```

Using pattern matching directly:

```bpl
match (opt) {
    Option<int>.Some(x) => {
        # Have x directly available
        processValue(x);
    },
    Option<int>.None => {},
}
```

**Recommendation:** Use pattern matching when you need the data. Use `match<Type>` for quick checks or when combining with other logic.

## Generic Type Checking

`match<Type>` supports checking generic parameters against concrete types. This works because BPL uses monomorphization for generics, meaning the compiler generates specialized versions of the function for each concrete type used.

```bpl
frame processGeneric<T>(value: T) ret int {
    if (match<int>(value)) {
        # value is an int
        return 1;
    }
    if (match<float>(value)) {
        # value is a float
        return 2;
    }
    return -1;
}
```

This allows you to write generic functions that behave differently based on the concrete type of the argument.

## Limitations

1. **Enum variants:** Works with enum variant checking
2. **Primitive type checking:** Supported (e.g., `match<int>`)
3. **Struct type checking:** Supported (e.g., `match<MyStruct>`)
4. **Inheritance checking:** `match<BaseType>(derivedValue)` is not yet fully supported (checks for exact type match)

## See Also

- [Match Expressions](07-control-flow.md#match-expressions) - Complete guide to pattern matching
- [Control Flow](07-control-flow.md) - Switches, loops, and match expressions
- [Generic Functions](10-generics-functions.md) - Generic types and functions
- [Pattern Guards](07-control-flow.md#pattern-guards) - Conditional patterns in match expressions
