# String Interpolation

String interpolation provides a convenient way to embed expressions directly within string literals. This makes it easier to build dynamic strings without manual concatenation.

## Table of Contents

- [Basic Syntax](#basic-syntax)
- [Expression Interpolation](#expression-interpolation)
- [How It Works](#how-it-works)
- [Type Conversion](#type-conversion)
- [Escaping](#escaping)
- [Common Use Cases](#common-use-cases)
- [Performance Considerations](#performance-considerations)
- [Best Practices](#best-practices)

## Basic Syntax

Use backticks (`` ` ``) to create an interpolated string. Embed expressions using `${...}`:

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame main() ret int {
    local name: string = "World";

    # Basic interpolation
    local greeting: String = `Hello, ${name}!`;
    printf("%s\n", greeting.toString());  # Hello, World!

    greeting.destroy();
    return 0;
}
```

## Expression Interpolation

Any valid BPL expression can be placed inside `${...}`:

### Variables

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame main() ret int {
    local name: string = "Alice";
    local age: int = 30;
    local height: float = 5.7;

    local info: String = `Name: ${name}, Age: ${age}, Height: ${height}`;
    printf("%s\n", info.toString());
    # Name: Alice, Age: 30, Height: 5.700000

    info.destroy();
    return 0;
}
```

### Arithmetic Expressions

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 10;
    local y: int = 20;

    local result: String = `${x} + ${y} = ${x + y}`;
    printf("%s\n", result.toString());  # 10 + 20 = 30

    local complex: String = `Average: ${(x + y) / 2}`;
    printf("%s\n", complex.toString()); # Average: 15

    result.destroy();
    complex.destroy();
    return 0;
}
```

### Function Calls

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame square(n: int) ret int {
    return n * n;
}

frame greet(name: string) ret string {
    return name;
}

frame main() ret int {
    local n: int = 5;

    local msg: String = `${n} squared is ${square(n)}`;
    printf("%s\n", msg.toString());  # 5 squared is 25

    local hello: String = `Hello, ${greet("Bob")}!`;
    printf("%s\n", hello.toString());  # Hello, Bob!

    msg.destroy();
    hello.destroy();
    return 0;
}
```

### Struct Member Access

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    local p: Point = Point { x: 10, y: 20 };

    local coords: String = `Point at (${p.x}, ${p.y})`;
    printf("%s\n", coords.toString());  # Point at (10, 20)

    coords.destroy();
    return 0;
}
```

### Method Calls

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

struct Counter {
    value: int,

    frame getValue(this: *Counter) ret int {
        return this.value;
    }
}

frame main() ret int {
    local c: Counter = Counter { value: 42 };

    local status: String = `Counter value: ${c.getValue()}`;
    printf("%s\n", status.toString());  # Counter value: 42

    status.destroy();
    return 0;
}
```

### Nested Interpolation

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame main() ret int {
    local items: int = 3;
    local price: float = 9.99;

    # Nested expressions
    local receipt: String = `Total: $${cast<float>(items) * price} for ${items} items`;
    printf("%s\n", receipt.toString());

    receipt.destroy();
    return 0;
}
```

## How It Works

The compiler transforms interpolated strings into `String` concatenation operations.

### Transformation Example

```bpl
# This interpolated string:
local s: String = `Hello ${name}, you are ${age} years old`;

# Is transformed into something like:
local s: String = String.new("Hello ")
    .concat(String.from(name))
    .concat(String.new(", you are "))
    .concat(String.fromInt(age))
    .concat(String.new(" years old"));
```

### Requirements

1. **Import String**: The `String` struct must be imported from the standard library
2. **Type Support**: Expressions must be convertible to strings

```bpl
import [String] from "std";  # Required!
```

## Type Conversion

Different types are converted to strings in different ways:

### Primitive Types

| Type     | Conversion Method                 |
| -------- | --------------------------------- |
| `string` | Wrapped in `String.new()`         |
| `int`    | Uses `Int.toString()` wrapper     |
| `float`  | Uses `Float.toString()` wrapper   |
| `bool`   | Converts to `"true"` or `"false"` |
| `char`   | Single character string           |

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame main() ret int {
    local i: int = 42;
    local f: float = 3.14;
    local b: bool = true;
    local c: char = 'A';

    local all: String = `int: ${i}, float: ${f}, bool: ${b}, char: ${c}`;
    printf("%s\n", all.toString());
    # int: 42, float: 3.140000, bool: true, char: A

    all.destroy();
    return 0;
}
```

### Custom Types

Custom structs need a `toString()` method:

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,

    frame toString(this: *Point) ret String {
        return `(${this.x}, ${this.y})`;
    }
}

frame main() ret int {
    local p: Point = Point { x: 5, y: 10 };

    local msg: String = `Location: ${p.toString()}`;
    printf("%s\n", msg.toString());  # Location: (5, 10)

    msg.destroy();
    return 0;
}
```

### String vs string

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame main() ret int {
    # Primitive string (char pointer)
    local s1: string = "primitive";

    # String struct
    local s2: String = String.new("struct");

    # Both work in interpolation
    local combined: String = `${s1} and ${s2.toString()}`;
    printf("%s\n", combined.toString());

    s2.destroy();
    combined.destroy();
    return 0;
}
```

## Escaping

### Escape the Dollar Sign

To include a literal `${` in the output, escape it with a backslash:

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame main() ret int {
    local price: int = 100;

    # Escaped: shows literal ${
    local escaped: String = `Use \${variable} syntax to interpolate`;
    printf("%s\n", escaped.toString());
    # Use ${variable} syntax to interpolate

    # Not escaped: interpolates
    local interpolated: String = `Price: $${price}`;
    printf("%s\n", interpolated.toString());
    # Price: $100

    escaped.destroy();
    interpolated.destroy();
    return 0;
}
```

### Escape Sequences

Standard escape sequences work within backtick strings:

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame main() ret int {
    local name: string = "World";

    local multiline: String = `Hello, ${name}!\nHow are you?\tFine!`;
    printf("%s\n", multiline.toString());
    # Hello, World!
    # How are you?	Fine!

    multiline.destroy();
    return 0;
}
```

## Common Use Cases

### Logging and Debugging

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame log(level: string, message: String) ret void {
    local output: String = `[${level}] ${message.toString()}`;
    printf("%s\n", output.toString());
    output.destroy();
}

frame main() ret int {
    local userId: int = 123;
    local action: string = "login";

    log("INFO", `User ${userId} performed ${action}`);
    # [INFO] User 123 performed login

    return 0;
}
```

### Building URLs

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame buildUrl(base: string, endpoint: string, id: int) ret String {
    return `${base}/${endpoint}/${id}`;
}

frame main() ret int {
    local url: String = buildUrl("https://api.example.com", "users", 42);
    printf("URL: %s\n", url.toString());
    # URL: https://api.example.com/users/42

    url.destroy();
    return 0;
}
```

### Formatting Output

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

struct Product {
    name: string,
    price: float,
    quantity: int,
}

frame formatProduct(p: *Product) ret String {
    local total: float = p.price * cast<float>(p.quantity);
    return `${p.name}: ${p.quantity} x $${p.price} = $${total}`;
}

frame main() ret int {
    local p: Product = Product {
        name: "Widget",
        price: 9.99,
        quantity: 3
    };

    local line: String = formatProduct(&p);
    printf("%s\n", line.toString());
    # Widget: 3 x $9.990000 = $29.970000

    line.destroy();
    return 0;
}
```

### SQL Queries (Be Careful!)

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

# WARNING: Don't use string interpolation for SQL with user input!
# This is just for demonstration with safe, internal values.
frame buildQuery(table: string, id: int) ret String {
    return `SELECT * FROM ${table} WHERE id = ${id}`;
}

frame main() ret int {
    local query: String = buildQuery("users", 42);
    printf("Query: %s\n", query.toString());

    query.destroy();
    return 0;
}
```

## Performance Considerations

### Memory Allocation

Each interpolation creates temporary `String` objects:

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

frame main() ret int {
    # Each interpolation allocates memory
    loop (local i: int = 0; i < 1000; i = i + 1) {
        local s: String = `Iteration ${i}`;
        printf("%s\n", s.toString());
        s.destroy();  # Important: Free memory!
    }
    return 0;
}
```

### Prefer printf for Simple Output

For simple output without needing a `String` object:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 42;
    local y: float = 3.14;

    # Simpler and more efficient for direct output
    printf("x = %d, y = %f\n", x, y);

    return 0;
}
```

### Building Large Strings

For building large strings, consider using a builder pattern or preallocating:

```bpl
import [String, StringBuilder] from "std";
extern printf(fmt: string, ...);

frame main() ret int {
    local sb: StringBuilder = StringBuilder.new();

    loop (local i: int = 0; i < 10; i = i + 1) {
        sb.append(`Line ${i}\n`);
    }

    local result: String = sb.build();
    printf("%s", result.toString());

    result.destroy();
    sb.destroy();
    return 0;
}
```

## Best Practices

### 1. Always Destroy String Objects

```bpl
import [String] from "std";

frame main() ret int {
    local s: String = `Hello ${name}`;
    # ... use s ...
    s.destroy();  # Don't forget!
    return 0;
}
```

### 2. Use Interpolation for Readability

```bpl
import [String] from "std";
extern printf(fmt: string, ...);

# Good: Clear and readable
local msg: String = `User ${name} logged in at ${time}`;

# Less readable: Manual concatenation
local msg2: String = String.new("User ")
    .concat(String.new(name))
    .concat(String.new(" logged in at "))
    .concat(String.new(time));
```

### 3. Keep Expressions Simple

```bpl
import [String] from "std";

# Good: Simple expressions
local result: String = `Sum: ${a + b}`;

# Better for complex logic: Compute first
local total: int = calculateTotal(items, discount, tax);
local msg: String = `Total: $${total}`;
```

### 4. Be Careful with User Input

```bpl
# DANGEROUS: User input directly in interpolation
local userInput: string = getUserInput();
local query: String = `SELECT * FROM users WHERE name = '${userInput}'`;  # SQL injection!

# SAFE: Use parameterized queries or proper escaping
local escaped: string = escapeSQL(userInput);
local safeQuery: String = `SELECT * FROM users WHERE name = '${escaped}'`;
```

---

**Next:** Learn about [Reflection and JSON](55-reflection-and-json.md) for runtime type information.
