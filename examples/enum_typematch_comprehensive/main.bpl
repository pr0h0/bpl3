# Comprehensive Type Matching Example
# Shows various use cases for match<Type>(value) runtime checks

import [printf] from "std/c.bpl";

enum Message {
    Text(string),
    Number(int),
    Boolean(int), # Using int as bool for simplicity
    Empty,
}

enum Result<T, E> {
    Ok(T),
    Err(E),
}

# Early return pattern using type matching
frame processMessage(msg: Message) ret int {
    # Check for empty first
    if (match<Message.Empty>(msg)) {
        printf("Empty message, skipping\n");
        return 0;
    }
    # Check for text
    if (match<Message.Text>(msg)) {
        printf("Processing text message\n");
        return 1;
    }
    # Check for number
    if (match<Message.Number>(msg)) {
        printf("Processing number message\n");
        return 2;
    }
    # Check for boolean
    if (match<Message.Boolean>(msg)) {
        printf("Processing boolean message\n");
        return 3;
    }
    return -1;
}

# Type matching with results
frame handleResult(r: Result<int, string>) ret int {
    if (match<Result.Ok>(r)) {
        printf("Success case detected\n");
        # Extract value using match expression
        return match (r) {
            Result<int, string>.Ok(val) => val,
            Result<int, string>.Err(_) => 0,
        };
    } else {
        printf("Error case detected\n");
        return -1;
    }
}

# Combining type checks with logical operators
frame analyzeMessage(msg: Message) ret string {
    # Check if it's a data-carrying variant
    if (match<Message.Text>(msg) || match<Message.Number>(msg) || match<Message.Boolean>(msg)) {
        return "has data";
    }
    return "no data";
}

# Type checking in conditionals
frame messageCategory(msg: Message) ret string {
    if (match<Message.Empty>(msg)) {
        return "empty";
    } else if (match<Message.Text>(msg)) {
        return "text";
    } else if (match<Message.Number>(msg)) {
        return "numeric";
    } else {
        return "boolean";
    }
}

# Validation using type checks
frame validateResult(r: Result<int, string>) ret int {
    if (match<Result.Ok>(r)) {
        printf("Validation: OK\n");
        return 1;
    }
    if (match<Result.Err>(r)) {
        printf("Validation: ERROR\n");
        return 0;
    }
    # Should never reach here
    printf("Validation: UNKNOWN\n");
    return -1;
}

frame main() ret int {
    printf("=== Message Processing ===\n");
    local m1: Message = Message.Text("hello");
    local m2: Message = Message.Number(42);
    local m3: Message = Message.Boolean(1);
    local m4: Message = Message.Empty;

    printf("Text: code=%d\n", processMessage(m1));
    printf("Number: code=%d\n", processMessage(m2));
    printf("Boolean: code=%d\n", processMessage(m3));
    printf("Empty: code=%d\n", processMessage(m4));

    printf("\n=== Message Analysis ===\n");
    printf("Text: %s\n", analyzeMessage(m1));
    printf("Number: %s\n", analyzeMessage(m2));
    printf("Empty: %s\n", analyzeMessage(m4));

    printf("\n=== Message Categories ===\n");
    printf("m1: %s\n", messageCategory(m1));
    printf("m2: %s\n", messageCategory(m2));
    printf("m3: %s\n", messageCategory(m3));
    printf("m4: %s\n", messageCategory(m4));

    printf("\n=== Result Handling ===\n");
    local r1: Result<int, string> = Result<int, string>.Ok(100);
    local r2: Result<int, string> = Result<int, string>.Err("failed");

    printf("Ok result value: %d\n", handleResult(r1));
    printf("Err result value: %d\n", handleResult(r2));

    printf("\n=== Result Validation ===\n");
    local v1: int = validateResult(r1);
    local v2: int = validateResult(r2);
    printf("Results: %d, %d\n", v1, v2);

    return 0;
}
