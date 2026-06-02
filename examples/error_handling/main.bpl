import [printf] from "std/c.bpl";
# Error handling example using try/catch/throw
struct MathError {
    code: int,
    message: string,
}
frame divide(a: int, b: int) ret int {
    printf("Dividing %d by %d\n", a, b);
    if (b == 0) {
        throw 1;
        # Throw int error code for division by zero
    }
    return a / b;
}
frame safeDivide(a: int, b: int) {
    try {
        local result: int = divide(a, b);
        printf("Division successful: %d / %d = %d\n", a, b, result);
    } catch (error: int) {
        if (error == 1) {
            printf("Error: Division by zero!\n");
        } else {
            printf("Error: Unknown error code %d\n", error);
        }
    }
}
frame processNumber(n: int) {
    try {
        if (n < 0) {
            throw true;
            # Throw bool for negative
        }
        if (n > 100) {
            throw 42;
            # Throw int code for too large
        }
        printf("Processing number: %d\n", n);
    } catch (e_bool: bool) {
        printf("Caught bool error: negative number\n");
    } catch (e_int: int) {
        printf("Caught int error: number too large (%d)\n", e_int);
    }
}
frame testStructThrow(value: int) {
    try {
        if (value < 0) {
            local err: MathError = MathError { code: -1, message: "Negative value error" };
            throw err;
        }
        if (value > 100) {
            local err: MathError = MathError { code: 100, message: "Value too large" };
            throw err;
        }
        printf("Value %d is valid\n", value);
    } catch (error: MathError) {
        printf("Caught MathError: code=%d, message=%s\n", error.code, error.message);
    }
}
frame testMultipleCatch(value: int) {
    try {
        if (value < 0) {
            throw -42;
            # Throw int
        }
        if (value == 0) {
            throw true;
            # Throw bool
        }
        if (value > 100) {
            local err: MathError = MathError { code: 500, message: "Overflow error" };
            throw err;
            # Throw struct
        }
        printf("Value %d is valid\n", value);
    } catch (error_int: int) {
        printf("Caught int error: %d\n", error_int);
    } catch (error_bool: bool) {
        local bool_val: int = 0;
        if (error_bool) {
            bool_val = 1;
        }
        printf("Caught bool error: %d\n", bool_val);
    } catch (error_struct: MathError) {
        printf("Caught MathError: code=%d, message=%s\n", error_struct.code, error_struct.message);
    }
}
frame main() ret int {
    printf("=== Division Examples ===\n");
    safeDivide(10, 2);
    safeDivide(10, 0);
    safeDivide(20, 4);
    printf("\n=== Number Processing Examples ===\n");
    processNumber(50);
    processNumber(-5);
    processNumber(150);
    printf("\n=== Struct Throw Examples ===\n");
    testStructThrow(50);
    testStructThrow(-10);
    testStructThrow(200);
    printf("\n=== Multiple Catch Examples ===\n");
    testMultipleCatch(50);
    testMultipleCatch(-5);
    testMultipleCatch(0);
    testMultipleCatch(150);
    return 0;
}
