# Lambda Expressions

Lambda expressions (or anonymous functions) provide a concise way to define inline functions. They are particularly useful when working with higher-order functions, callbacks, and functional programming patterns.

## Table of Contents

- [Syntax](#syntax)
- [Basic Usage](#basic-usage)
- [Lambda Types](#lambda-types)
- [Variable Capture (Closures)](#variable-capture-closures)
- [Passing Lambdas to Functions](#passing-lambdas-to-functions)
- [Returning Lambdas from Functions](#returning-lambdas-from-functions)
- [Bound Methods](#bound-methods)
- [Common Patterns](#common-patterns)
- [Func vs Lambda](#func-vs-lambda)
- [Best Practices](#best-practices)

## Syntax

The basic lambda syntax uses pipes `|` to delimit parameters:

```bpl
|param1: Type, param2: Type| ret ReturnType {
    # body
}
```

### Variations

```bpl
# No parameters
|| ret int {
    return 42;
}

# No parameters, void return (ret void can be omitted)
|| {
    printf("Hello!\n");
}

# Single parameter
|x: int| ret int {
    return x * x;
}

# Multiple parameters
|a: int, b: int| ret int {
    return a + b;
}

# Void return (explicit)
|msg: string| ret void {
    printf("%s\n", msg);
}
```

## Basic Usage

### Creating Lambdas

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    # Lambda stored in a variable
    local square: Lambda<int>(int) = |x: int| ret int {
        return x * x;
    };

    # Call the lambda
    local result: int = square(5);
    printf("5 squared = %d\n", result);  # 25

    # Lambda with multiple statements
    local abs: Lambda<int>(int) = |n: int| ret int {
        if (n < 0) {
            return -n;
        }
        return n;
    };

    printf("abs(-10) = %d\n", abs(-10));  # 10

    return 0;
}
```

### Inline Lambdas

Lambdas are often used inline without being stored in a variable:

```bpl
extern printf(fmt: string, ...);

frame applyTwice(f: Lambda<int>(int), x: int) ret int {
    return f(f(x));
}

frame main() ret int {
    # Pass lambda directly
    local result: int = applyTwice(|n: int| ret int {
        return n * 2;
    }, 3);

    printf("Result: %d\n", result);  # 12 (3 -> 6 -> 12)
    return 0;
}
```

## Lambda Types

BPL has two function pointer types:

### `Func<ReturnType>(ParamTypes...)`

Raw function pointer, compatible with C ABI. Cannot capture variables.

```bpl
# Function pointer type
local add: Func<int>(int, int);
```

### `Lambda<ReturnType>(ParamTypes...)`

Fat pointer (struct containing function pointer and context). Can capture variables.

```bpl
# Lambda type (can capture)
local multiplier: Lambda<int>(int);
```

### Type Annotations

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    # Explicit type annotation
    local increment: Lambda<int>(int) = |x: int| ret int {
        return x + 1;
    };

    # Multiple parameters
    local add: Lambda<int>(int, int) = |a: int, b: int| ret int {
        return a + b;
    };

    # No parameters
    local getFortyTwo: Lambda<int>() = || ret int {
        return 42;
    };

    # Void return
    local printer: Lambda<void>(string) = |msg: string| ret void {
        printf("%s\n", msg);
    };

    printf("%d\n", increment(5));  # 6
    printf("%d\n", add(3, 4));     # 7
    printf("%d\n", getFortyTwo()); # 42
    printer("Hello!");             # Hello!

    return 0;
}
```

## Variable Capture (Closures)

Lambdas can capture variables from their enclosing scope, creating closures.

### Capture by Value (Default)

By default, variables are captured by **value** (copied) when the lambda is created:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local factor: int = 10;

    local multiply: Lambda<int>(int) = |x: int| ret int {
        return x * factor;  # 'factor' is captured by value
    };

    printf("%d\n", multiply(5));  # 50

    # Changing 'factor' doesn't affect the lambda
    factor = 20;
    printf("%d\n", multiply(5));  # Still 50!

    return 0;
}
```

### Capture by Reference (via Pointers)

To capture by reference and observe/modify changes, capture a pointer:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local count: int = 0;
    local countPtr: *int = &count;

    local increment: Lambda<void>() = || ret void {
        *countPtr = *countPtr + 1;  # Modifies original
    };

    increment();
    increment();
    increment();

    printf("Count: %d\n", count);  # 3

    return 0;
}
```

### Capturing Multiple Variables

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local base: int = 100;
    local multiplier: int = 2;

    local calculate: Lambda<int>(int) = |x: int| ret int {
        return base + x * multiplier;  # Captures both
    };

    printf("%d\n", calculate(5));   # 100 + 5*2 = 110
    printf("%d\n", calculate(10));  # 100 + 10*2 = 120

    return 0;
}
```

### Capturing Structs

Structs are copied when captured by value:

```bpl
extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    local p: Point = Point { x: 10, y: 20 };

    local getX: Lambda<int>() = || ret int {
        return p.x;  # Struct is copied
    };

    printf("x = %d\n", getX());  # 10

    p.x = 100;  # Doesn't affect lambda
    printf("x = %d\n", getX());  # Still 10

    return 0;
}
```

### Ignored Parameters

Use `_` for parameters you don't need:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    # Ignore first parameter
    local second: Lambda<int>(int, int) = |_, b: int| ret int {
        return b;
    };

    # Ignore all parameters
    local alwaysZero: Lambda<int>(int, int, int) = |_, _, _| ret int {
        return 0;
    };

    printf("%d\n", second(100, 42));       # 42
    printf("%d\n", alwaysZero(1, 2, 3));   # 0

    return 0;
}
```

## Passing Lambdas to Functions

### Higher-Order Functions

```bpl
extern printf(fmt: string, ...);

# Function that takes a lambda
frame map(arr: *int, len: int, transform: Lambda<int>(int)) ret void {
    loop (local i: int = 0; i < len; i = i + 1) {
        arr[i] = transform(arr[i]);
    }
}

frame filter(arr: *int, len: int, predicate: Lambda<bool>(int), result: *int) ret int {
    local count: int = 0;
    loop (local i: int = 0; i < len; i = i + 1) {
        if (predicate(arr[i])) {
            result[count] = arr[i];
            count = count + 1;
        }
    }
    return count;
}

frame reduce(arr: *int, len: int, initial: int, reducer: Lambda<int>(int, int)) ret int {
    local acc: int = initial;
    loop (local i: int = 0; i < len; i = i + 1) {
        acc = reducer(acc, arr[i]);
    }
    return acc;
}

frame main() ret int {
    local arr: int[5] = [1, 2, 3, 4, 5];

    # Double each element
    map(&arr[0], 5, |x: int| ret int { return x * 2; });

    printf("After map: ");
    loop (local i: int = 0; i < 5; i = i + 1) {
        printf("%d ", arr[i]);
    }
    printf("\n");  # 2 4 6 8 10

    # Filter even numbers
    local filtered: int[5];
    local count: int = filter(&arr[0], 5, |x: int| ret bool {
        return x % 2 == 0;
    }, &filtered[0]);

    printf("Even numbers: ");
    loop (local i: int = 0; i < count; i = i + 1) {
        printf("%d ", filtered[i]);
    }
    printf("\n");  # 2 4 6 8 10

    # Sum all elements
    local sum: int = reduce(&arr[0], 5, 0, |acc: int, x: int| ret int {
        return acc + x;
    });
    printf("Sum: %d\n", sum);  # 30

    return 0;
}
```

### Callback Patterns

```bpl
extern printf(fmt: string, ...);

frame doWithRetry(action: Lambda<bool>(), maxRetries: int, onFailure: Lambda<void>(int)) ret bool {
    loop (local attempt: int = 1; attempt <= maxRetries; attempt = attempt + 1) {
        if (action()) {
            return true;
        }
        onFailure(attempt);
    }
    return false;
}

frame main() ret int {
    local attempts: int = 0;
    local attemptsPtr: *int = &attempts;

    local success: bool = doWithRetry(
        || ret bool {
            *attemptsPtr = *attemptsPtr + 1;
            return *attemptsPtr >= 3;  # Succeed on 3rd try
        },
        5,
        |attempt: int| ret void {
            printf("Attempt %d failed\n", attempt);
        }
    );

    if (success) {
        printf("Operation succeeded after %d attempts\n", attempts);
    }

    return 0;
}
```

## Returning Lambdas from Functions

Functions can return lambdas (closures):

```bpl
extern printf(fmt: string, ...);

frame makeAdder(n: int) ret Lambda<int>(int) {
    return |x: int| ret int {
        return x + n;  # Captures 'n'
    };
}

frame makeCounter() ret Lambda<int>() {
    local count: int = 0;
    local countPtr: *int = &count;

    return || ret int {
        *countPtr = *countPtr + 1;
        return *countPtr;
    };
}

frame main() ret int {
    local add5: Lambda<int>(int) = makeAdder(5);
    local add10: Lambda<int>(int) = makeAdder(10);

    printf("add5(3) = %d\n", add5(3));   # 8
    printf("add10(3) = %d\n", add10(3)); # 13

    # Note: Counter example requires proper heap allocation
    # for the count variable to persist

    return 0;
}
```

## Bound Methods

When you reference a method on a struct instance, it creates a lambda with `this` captured:

```bpl
extern printf(fmt: string, ...);

struct Counter {
    count: int,

    frame new(initial: int) ret Counter {
        return Counter { count: initial };
    }

    frame increment(this: *Counter) ret void {
        this.count = this.count + 1;
    }

    frame getCount(this: *Counter) ret int {
        return this.count;
    }
}

struct Greeter {
    name: string,

    frame sayHello(this: *Greeter) ret void {
        printf("Hello, %s!\n", this.name);
    }

    frame greetWith(this: *Greeter, greeting: string) ret void {
        printf("%s, %s!\n", greeting, this.name);
    }
}

frame main() ret int {
    # Bound method as lambda
    local g: Greeter = Greeter { name: "World" };
    local greet: Lambda<void>() = g.sayHello;

    greet();  # Hello, World!

    # Use bound method with arguments
    local greetWith: Lambda<void>(string) = g.greetWith;
    greetWith("Hi");      # Hi, World!
    greetWith("Goodbye"); # Goodbye, World!

    # Counter example
    local c: Counter = Counter.new(0);
    local inc: Lambda<void>() = c.increment;

    inc();
    inc();
    inc();

    printf("Count: %d\n", c.getCount());  # 3

    return 0;
}
```

## Common Patterns

### Comparators for Sorting

```bpl
extern printf(fmt: string, ...);

frame sort(arr: *int, len: int, compare: Lambda<int>(int, int)) ret void {
    # Simple bubble sort
    loop (local i: int = 0; i < len - 1; i = i + 1) {
        loop (local j: int = 0; j < len - i - 1; j = j + 1) {
            if (compare(arr[j], arr[j + 1]) > 0) {
                local temp: int = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}

frame main() ret int {
    local arr: int[5] = [3, 1, 4, 1, 5];

    # Sort ascending
    sort(&arr[0], 5, |a: int, b: int| ret int {
        return a - b;
    });

    printf("Ascending: ");
    loop (local i: int = 0; i < 5; i = i + 1) {
        printf("%d ", arr[i]);
    }
    printf("\n");  # 1 1 3 4 5

    # Sort descending
    sort(&arr[0], 5, |a: int, b: int| ret int {
        return b - a;
    });

    printf("Descending: ");
    loop (local i: int = 0; i < 5; i = i + 1) {
        printf("%d ", arr[i]);
    }
    printf("\n");  # 5 4 3 1 1

    return 0;
}
```

### Event Handlers

```bpl
extern printf(fmt: string, ...);

struct Button {
    label: string,
    onClick: Lambda<void>(),

    frame click(this: *Button) ret void {
        printf("Button '%s' clicked\n", this.label);
        this.onClick();
    }
}

frame main() ret int {
    local count: int = 0;
    local countPtr: *int = &count;

    local btn: Button = Button {
        label: "Submit",
        onClick: || ret void {
            *countPtr = *countPtr + 1;
            printf("Click count: %d\n", *countPtr);
        }
    };

    btn.click();  # Button 'Submit' clicked, Click count: 1
    btn.click();  # Button 'Submit' clicked, Click count: 2
    btn.click();  # Button 'Submit' clicked, Click count: 3

    return 0;
}
```

### Deferred Execution

```bpl
extern printf(fmt: string, ...);

frame defer(action: Lambda<void>()) ret Lambda<void>() {
    return action;  # Just return for later
}

frame main() ret int {
    local cleanup: Lambda<void>() = defer(|| ret void {
        printf("Cleanup executed!\n");
    });

    printf("Doing work...\n");

    # Execute deferred action
    cleanup();

    return 0;
}
```

## Func vs Lambda

Understanding the difference is important:

| Feature                   | `Func<R>(P...)`          | `Lambda<R>(P...)`       |
| ------------------------- | ------------------------ | ----------------------- |
| Size                      | Single pointer (8 bytes) | Two pointers (16 bytes) |
| Captures                  | No                       | Yes                     |
| C compatible              | Yes                      | No                      |
| From regular function     | Yes                      | Wrapped                 |
| From lambda with captures | No                       | Yes                     |

### Conversion Rules

```bpl
extern printf(fmt: string, ...);

# Regular function (no captures)
frame add(a: int, b: int) ret int {
    return a + b;
}

frame main() ret int {
    # Func can be assigned from a regular function
    local f: Func<int>(int, int) = add;

    # Func can be converted to Lambda (wrapped)
    local l: Lambda<int>(int, int) = cast<Lambda<int>(int, int)>(f);

    # Lambda with captures CANNOT be converted to Func
    local x: int = 10;
    local captured: Lambda<int>(int) = |n: int| ret int {
        return n + x;
    };
    # local bad: Func<int>(int) = captured;  # ERROR!

    printf("%d\n", f(3, 4));   # 7
    printf("%d\n", l(3, 4));   # 7

    return 0;
}
```

## Best Practices

### 1. Keep Lambdas Short

```bpl
# Good: Short and focused
local isEven: Lambda<bool>(int) = |x: int| ret bool {
    return x % 2 == 0;
};

# Consider using a named function for complex logic
frame complexCalculation(x: int, y: int, z: int) ret int {
    # Many lines of code...
    return result;
}
```

### 2. Be Explicit About Capture

```bpl
# Clear: Pointer capture is explicit
local count: int = 0;
local ptr: *int = &count;
local inc: Lambda<void>() = || {
    *ptr = *ptr + 1;
};

# Surprising: Value capture might not be expected
local multiplier: int = 2;
local double: Lambda<int>(int) = |x: int| ret int {
    return x * multiplier;  # Captured by value!
};
```

### 3. Use Type Aliases for Complex Lambda Types

```bpl
type Predicate = Lambda<bool>(int);
type Comparator = Lambda<int>(int, int);
type Callback = Lambda<void>();

frame filter(arr: *int, len: int, pred: Predicate) ret int {
    # ...
}
```

### 4. Document Captured Variables

```bpl
# This lambda captures 'config' by value
local processor: Lambda<void>(string) = |data: string| ret void {
    # Uses config.prefix and config.suffix
    # ...
};
```

### 5. Prefer Lambdas for Callbacks, Func for FFI

```bpl
# FFI requires Func (C-compatible)
extern qsort(base: *void, num: int, size: int, compare: Func<int>(*void, *void));

# Internal callbacks can use Lambda
frame processItems(items: *Item, len: int, handler: Lambda<void>(Item)) ret void {
    # ...
}
```

---

**Next:** Learn about [String Interpolation](54-string-interpolation.md) for embedding expressions in strings.
