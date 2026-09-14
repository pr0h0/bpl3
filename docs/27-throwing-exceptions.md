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

## Returning from try and catch

A non-void function can end in a `try` statement when its try block and every
catch body return or throw on all paths. Unmatched exceptions propagate; they do
not require a fallback return. If any branch can finish normally, the function
still needs a return after the try statement.

```bpl
frame recover(fail: bool) ret int {
    try {
        if (fail) { throw 7; }
        return 3;
    } catch (error: int) {
        return error;
    }
}

frame main() ret int {
    if (recover(false) != 3 || recover(true) != 7) { return 1; }
    return 0;
}
```

Deferred cleanup runs before leaving each scope. Inside a match arm's block,
`return` yields the arm's value, including when nested in try/catch; the enclosing
function needs its own return.

## Runtime-Generated Exceptions

The compiler/runtime will throw `NullAccessError` automatically when you access a nullptr object. The error includes `message`, `function`, and `expression` fields so you can inspect what went wrong when catching it.
