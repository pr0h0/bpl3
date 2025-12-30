extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;

struct Data {
    value: int,
    valid: bool,
}

# Return nullptr conditionally
frame maybeGetData(success: bool) ret *Data {
    if (success) {
        local ptr: *Data = cast<*Data>(malloc(sizeof<Data>()));
        ptr.value = 42;
        ptr.valid = true;
        return ptr;
    }
    # Return nullptr on failure
    return nullptr;
}

# Use returned nullptr value
frame processData(d: *Data) ret int {
    # Just access d.value directly
    return d.value; # Should trap here since d is nullptr
}

# Chain function calls with nullptr return
frame getData() ret *Data {
    return nullptr;
}

frame extractValue(d: *Data) ret int {
    return d.value;
}

frame main() ret int {
    printf("=== Nullptr Return Values Test ===\n\n");

    printf("Test 1: Returning nullptr from function\n");
    local data: *Data = maybeGetData(false);

    printf("Test 2: Using returned nullptr value\n");

    try {
        local _result: int = processData(data);
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    printf("Test completed successfully\n");
    return 0;
}
