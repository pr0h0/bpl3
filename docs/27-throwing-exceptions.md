# Throwing Exceptions

You can throw exceptions of any type.

## Syntax

Use the `throw` keyword followed by an expression.

```bpl
frame divide(a: int, b: int) ret int {
    if (b == 0) {
        throw "Division by zero";
    }
    return a / b;
}
```

## Propagation

Exceptions propagate up the call stack until they are caught by a `try-catch` block. If an exception is not caught, the program terminates.

A typed catch handles its matching exception type. If none of a try block's
typed catches matches, the exception continues to the next enclosing handler.
Deferred cleanup runs as the intervening scopes unwind. Use `catch { ... }`
to handle any exception at that level.

Floating-point payloads retain their original bits, including fractional
values, negative zero, infinities, and NaNs, for both `f32` and `f64`.

## Runtime-Generated Exceptions

The compiler/runtime will throw `NullAccessError` automatically when you access a nullptr object. The error includes `message`, `function`, and `expression` fields so you can inspect what went wrong when catching it.
