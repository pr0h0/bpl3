# Type Matching

## Overview

BPL provides the `match<Type>(value)` expression for runtime type checking. This feature allows you to check if a value matches a specific type or enum variant at runtime. It is particularly useful for working with algebraic data types (enums) and for specializing generic functions (see [Generic Type Checking](#generic-type-checking)).

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

Composite targets use their complete type shape: tuples compare their element
types, and function or lambda types compare their parameter and return types.
Both `match<(int, bool)>(value)` and `value is (int, bool)` use this exact-type
comparison. Variadic and fixed-parameter signatures remain distinct, as do
function pointers and lambdas.
Array dimensions are part of this comparison for named, tuple and callback
element types; a different fixed length does not match.
Fixed dimensions in query targets must be positive for all of these type kinds.
Empty brackets continue to describe a slice rather than a zero-length array.
Targets must name types, with valid generic arguments and defined nested element,
parameter and return types; variable or function names cannot stand in for types.
Module-qualified type names such as `types.Record` and `types.Box<int>` follow
the same rules as imported unqualified names. Qualified enum-variant names such
as `types.Color.Red` continue to select a variant by its tag. A missing variant
is rejected during type checking with `BPL_TYPE_QUERY_TYPE_NOT_FOUND`.
A variant query on a value of another type, including a whole array or slice,
returns false; it only inspects tags on scalar values of the queried enum.
Variant targets use plain `Enum.Variant` syntax, without pointer prefixes, array
suffixes, or type arguments on the variant. For generic enums, the tag query
uses the type arguments of the queried value; for example, use
`match<Option.Some>(value)` when `value` has type `Option<int>`. Unsupported
modified variant targets are rejected during type checking.
Static inheritance checks do not override a failed exact comparison merely
because two targets share a raw type name.
Primitive aliases share their canonical identity: `float`, `f64` and `double`
name the same floating type, while `f32` remains distinct.
Generic bindings retain modifiers applied to aliases, including array suffixes
and the order of nested array dimensions.
Arrays of class values or references use whole-array type comparisons, rather
than applying an individual-object runtime class check to the array.
Arrays and slices of `Any` also compare their aggregate types. A scalar `Any`
continues to check the type of its boxed payload.

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

The `is` operator checks if a struct pointer's runtime type exactly matches a target type. A derived type does not currently match an intermediate ancestor.

**Syntax:** `pointer is TargetType` or `pointer is *TargetType`

```bpl
import printf from "std/c.bpl";
struct Animal { name: string }
struct Dog : Animal { breed: string }

frame processAnimal(animal: *Animal) {
    if (animal is Dog) {
        # animal is narrowed to *Dog inside this branch
        printf("Dog breed: %s\n", animal.breed);
    } else {
        printf("It's some other animal\n");
    }
}

frame main() ret int {
    local dog: Dog = Dog { name: "Buddy", breed: "Golden Retriever" };
    local animal: *Animal = &dog;  # Upcast to base type

    processAnimal(animal);  # Prints: "Dog breed: Golden Retriever"
    return 0;
}
```

**Implementation:** The `is` operator compares vtable pointers at runtime. Each struct type in an inheritance hierarchy has a unique vtable, enabling O(1) type identification.

When the checked value is a simple identifier in an `if` condition, the true branch receives a scoped narrowed type. After the branch, the identifier returns to its original type.

```bpl
frame describe(animal: *Animal) ret string {
    if (animal is Dog) {
        return animal.breed;  # animal is *Dog here
    }

    return animal.name;       # animal is *Animal here
}
```

`match<Type>(value)` uses the same scoped narrowing rule for simple identifiers:

```bpl
frame describe(animal: *Animal) ret string {
    if (match<Dog>(animal)) {
        return animal.breed;  # animal is *Dog here
    }

    return animal.name;
}
```

Helper functions remain ordinary boolean functions. A call to a helper does not narrow the argument unless the condition directly uses `is` or `match<Type>`.

```bpl
frame isDog(value: *Animal) ret bool {
    return value is Dog;
}
```

### The `as` Operator (Safe Downcast)

The `as` operator attempts a safe downcast and returns `nullptr` if the types don't match.

**Syntax:** `pointer as *TargetType`

```bpl
import printf from "std/c.bpl";
struct Animal { name: string }
struct Dog : Animal { breed: string }
struct Cat : Animal { indoor: bool }

frame processDog(animal: *Animal) {
    local dog: *Dog = animal as *Dog;
    if (dog != nullptr) {
        printf("Dog breed: %s\n", dog.breed);
    } else {
        printf("Not a dog\n");
    }
}

frame main() ret int {
    local dog: Dog = Dog { name: "Buddy", breed: "Lab" };
    local cat: Cat = Cat { name: "Whiskers", indoor: true };

    processDog(cast<*Animal>(&dog));  # Prints: "Dog breed: Lab"
    processDog(cast<*Animal>(&cat));  # Prints: "Not a dog"
    return 0;
}
```

**Implementation:** The `as` operator checks the vtable at runtime. If the pointer's actual type matches the target type, it returns the casted pointer; otherwise, it returns `nullptr`.

### Combining `is` and `as`

A common pattern is to use `is` for control flow and `as` when you need to store the casted value:

```bpl
frame handleAnimal(animal: *Animal) {
    if (animal is Dog) {
        printf("Dog: %s (%s)\n", animal.name, animal.breed);
    } else if (animal is Cat) {
        local cat: *Cat = animal as *Cat;
        printf("Cat: %s (indoor: %d)\n", cat.name, cat.indoor);
    }
}
```

### Limitations

- **Struct pointers only**: The `is` and `as` operators for runtime type checking work only with struct pointer types that participate in inheritance hierarchies.
- **VTable requirement**: Both the source and target types must have vtables (either by having methods or by being part of an inheritance relationship).
- **No deep hierarchy checking**: Currently, `is` checks for exact type match against the target, not whether the type is anywhere in the inheritance chain above the target.

## More Patterns

### Validation

Validate enum state before processing:

```bpl
import printf from "std/c.bpl";
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
import printf from "std/c.bpl";
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

## Integration with Pattern Guards

`match<Type>` works seamlessly with pattern guards in match expressions:

```bpl
import printf from "std/c.bpl";
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
import printf from "std/c.bpl";
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
import printf from "std/c.bpl";
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
import printf from "std/c.bpl";
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
import printf from "std/c.bpl";
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
4. **Inheritance checking:** `match<BaseType>(derivedValue)` is true when the
   value's static type derives from `BaseType`, directly or through
   intermediate parents, and likewise for `match<*BaseType>(derivedPointer)`.
   It checks the static type; use `is` on a struct pointer for the runtime type.

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
  local dog: *Dog = animal as *Dog;
  if (dog != nullptr) {
      # Work with dog
  }
  ```

- **Use for Control Flow**: Use `match<Type>` to direct control flow based on the "shape" of your data.
