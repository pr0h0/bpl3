extern printf(fmt: string, ...);
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
frame safe_divide(a: int, b: int) {
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
frame process_number(n: int) {
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
frame test_struct_throw(value: int) {
    try {
        if (value < 0) {
            local err: MathError;
            err.code = -1;
            err.message = "Negative value error";
            throw err;
        }
        if (value > 100) {
            local err: MathError;
            err.code = 100;
            err.message = "Value too large";
            throw err;
        }
        printf("Value %d is valid\n", value);
    } catch (error: MathError) {
        printf("Caught MathError: code=%d, message=%s\n", error.code, error.message);
    }
}
frame test_multiple_catch(value: int) {
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
            local err: MathError;
            err.code = 500;
            err.message = "Overflow error";
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
    safe_divide(10, 2);
    safe_divide(10, 0);
    safe_divide(20, 4);
    printf("\n=== Number Processing Examples ===\n");
    process_number(50);
    process_number(-5);
    process_number(150);
    printf("\n=== Struct Throw Examples ===\n");
    test_struct_throw(50);
    test_struct_throw(-10);
    test_struct_throw(200);
    printf("\n=== Multiple Catch Examples ===\n");
    test_multiple_catch(50);
    test_multiple_catch(-5);
    test_multiple_catch(0);
    test_multiple_catch(150);
    return 0;
}
