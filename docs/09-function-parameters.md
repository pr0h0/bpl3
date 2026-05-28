# Function Parameters

Functions in BPL can take parameters and return values.

## Parameters

Parameters are declared with their type.

```bpl
frame add(a: int, b: int) ret int {
    return a + b;
}
```

## Const Parameters

Parameters can be marked as `const` to prevent modification within the function.

```bpl
frame print(msg: const string) {
    # msg = "new string"; # Error: Cannot assign to const parameter
    printf("%s\n", msg);
}
```

## Return Values

Functions specify their return type after the parameter list using `ret Type`. If a function does not return a value, use `ret void` or omit the return type (defaults to void).

```bpl
frame log(msg: string) ret void {
    printf("%s\n", msg);
}
```

## Variadic Functions

BPL supports two types of variadic functions: **FFI Variadics** (for C compatibility) and **Native Variadics** (type-safe argument packing).

### FFI Variadics

Used primarily for calling C functions like `printf`.

```bpl
extern printf(fmt: string, ...) ret int;
```

### Native Variadics

Native variadic functions allow you to accept a variable number of arguments. The compiler automatically packs these arguments into an array and passes the count.

#### Homogeneous Variadics (Same Type)

To accept multiple arguments of the same type, use the `...Type` syntax.

**Requirements:**

1.  The variadic parameter must be the **second-to-last** parameter.
2.  The **last parameter** must be of type `int` (to receive the count).

```bpl
# 'nums' receives a pointer to an array of ints
# 'count' receives the number of arguments passed
frame sum(...nums: int, count: int) ret int {
    local total: int = 0;
    local i: int = 0;
    loop (i < count) {
        total += nums[i];
        i += 1;
    }
    return total;
}

frame main() {
    # Called naturally:
    local s: int = sum(10, 20, 30, 40);
    # Compiler transforms to: sum([10, 20, 30, 40], 4)
}
```

#### Heterogeneous Variadics (Mixed Types)

To accept arguments of different types, use `...Any`. The compiler wraps each argument in an `Any` struct containing its type ID and data.

```bpl
# 'args' is an array of Any structs
frame printAll(...args: Any, count: int) {
    local i: int = 0;
    loop (i < count) {
        local arg: Any = args[i];
        # Use match<Type> or type_id to inspect
        if ((arg is int)) {
            printf("Int: %d\n", cast<int>(arg.data));
        } else if ((arg is string)) {
            printf("String: %s\n", cast<string>(arg.data));
        }
        i += 1;
    }
}

frame main() {
    printAll(42, "Hello", 3.14);
}
```
