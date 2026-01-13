# Lambda Expressions

Lambda expressions (or anonymous functions) provide a concise way to define inline functions. They are particularly useful when working with higher-order functions or when a short, throwaway function is needed.

## Syntax

```bpl
|param1: Type, param2: Type| ret ReturnType {
    # body
}
```

If the lambda takes no arguments, you can use `||`.
If the return type is `void`, the `ret ReturnType` part can be omitted.

```bpl
# No arguments, void return
|| { ... }

# Arguments, inferred void return
|x: int| { ... }
```

## Examples

### Basic Usage

```bpl
local square: Func<int>(int) = |x: int| ret int {
    return x * x;
};

local result: int = square(5); # 25
```

### Passing to Functions

Lambdas can be passed directly to functions that accept function pointers (`Func<...>`).

```bpl
frame apply(op: Func<int>(int, int), a: int, b: int) ret int {
    return op(a, b);
}

frame main() ret int {
    local sum: int = apply(|x: int, y: int| ret int {
        return x + y;
    }, 10, 20);
    return 0;
}
```

### Capturing Variables (Closures)

Lambdas can capture variables from their enclosing scope.

```bpl
frame main() ret int {
    local factor: int = 10;

    local multiplier: Func<int>(int) = |x: int| ret int {
        return x * factor; # Captures 'factor'
    };

    printf("%d\n", multiplier(5)); # 50
    return 0;
}
```

## Variable Capture Rules

### Capture by Value (Copy)

By default, lambdas capture variables by **value**. This means a copy of the variable is made when the lambda is created. Subsequent changes to the original variable do not affect the captured value inside the lambda.

```bpl
local x: int = 5;
local getX: Func<int>() = || ret int {
    return x;
};

x = 10;
printf("%d\n", getX()); # Prints 5, not 10
```

This applies to structs as well; the entire struct is copied.

### Capture by Reference (via Pointers)

To observe changes to a variable from within a lambda, or to modify the original variable, you must capture a **pointer** to that variable.

```bpl
local x: int = 5;
local ptr: *int = &x;

local getRefX: Func<int>() = || ret int {
    return *ptr; # Dereference captured pointer
};

x = 10;
printf("%d\n", getRefX()); # Prints 10
```

### Ignored Arguments

You can use `_` for arguments that are not used in the lambda body.

```BPL
local alwaysZero: Func<int>(int) = |_| ret int {
    return 0;
};
```

## Bound Methods

Instance methods of structs can be treated as lambdas. When you reference a method on an instance (e.g., `obj.method`), it produces a `Lambda` where the `this` pointer is implicitly captured as the context.

```bpl
struct Greeter {
    name: string,
    frame sayHello(this: *Greeter) {
        printf("Hello, %s!", this.name);
    }
}

local g: Greeter = Greeter { name: "World" };
local greet: Lambda<void>() = g.sayHello;
greet(); // Prints "Hello, World!"
```
