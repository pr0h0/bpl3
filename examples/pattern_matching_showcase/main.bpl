import [printf] from "std/c.bpl";
import [strlen] from "std/c.bpl";

# ============================================
# BPL Pattern Matching Showcase
# ============================================
# Demonstrates pattern matching on primitives and tuples
#
# Current BPL support:
#   ✓ Literal patterns on primitives (5, "text", true)
#   ✓ Identifier patterns with guards (x if x > 10)
#   ✓ Tuple patterns ((a, b), (1, 2))
#   ✓ Enum patterns with destructuring
#   ✓ Nested patterns
# ============================================

# ============================================
# Example 1: Integer Matching
# ============================================
frame matchInteger(num: int) {
    match (num) {
        0 => printf("Zero\n"),
        5 => printf("Five\n"),
        n if (n > 1) && (n < 10) => printf("Between 1 and 10 (exclusive)\n"),
        n if n < 0 => printf("Negative number\n"),
        n if (n % 5) == 0 => printf("Multiple of 5\n"),
        n if (n % 2) == 0 => printf("Even number\n"),
        _ => printf("Other number\n"),
    };
}

# ============================================
# Example 2: String Matching
# ============================================
frame matchString(text: string) {
    match (text) {
        "" => printf("Empty string\n"),
        "yes" => printf("Affirmative\n"),
        "no" => printf("Negative\n"),
        s if strlen(s) > 10 => printf("Long string (>10 chars)\n"),
        s if strlen(s) < 3 => printf("Short string (<3 chars)\n"),
        s if strlen(s) == 5 => printf("Exactly 5 characters\n"),
        _ => printf("Other string\n"),
    };
}

# ============================================
# Example 3: Tuple Matching
# ============================================
frame matchTuple(pair: (int, int)) {
    match (pair) {
        (0, 0) => printf("Origin point (0, 0)\n"),
        (1, 5) => printf("Exactly (1, 5)\n"),
        (a, 8) => printf("Second is 8 (first is %d)\n", a),
        (a, b) if a == b => printf("Both equal: %d\n", a),
        (a, b) if (a + b) == 10 => printf("Sum is 10 (%d + %d)\n", a, b),
        (a, b) if a > b => printf("First > Second (%d > %d)\n", a, b),
        _ => printf("Other tuple\n"),
    };
}

# ============================================
# Example 4: Enum Matching (for comparison)
# ============================================
enum Result {
    Success(int),
    Error(string),
    Pending,
}

frame matchResult(res: Result) {
    match (res) {
        Result.Success(code) if code == 0 => printf("Success with code 0\n"),
        Result.Success(code) if code < 100 => printf("Success, normal code: %d\n", code),
        Result.Success(code) => printf("Success, high code: %d\n", code),
        Result.Error(msg) if strlen(msg) < 10 => printf("Error: %s\n", msg),
        Result.Error(msg) => printf("Long error (len %d)\n", strlen(msg)),
        Result.Pending => printf("Pending\n"),
    };
}

frame main() {
    printf("=== Integer Patterns ===\n");
    matchInteger(0);
    matchInteger(5);
    matchInteger(7);
    matchInteger(-5);
    matchInteger(15);
    matchInteger(42);

    printf("\n=== String Patterns ===\n");
    matchString("");
    matchString("yes");
    matchString("no");
    matchString("this is a long string");
    matchString("hi");
    matchString("hello");

    printf("\n=== Tuple Patterns ===\n");
    local pair1: (int, int) = (1, 5);
    local pair2: (int, int) = (0, 0);
    local pair3: (int, int) = (99, 8);
    local pair4: (int, int) = (5, 5);
    local pair5: (int, int) = (3, 7);
    local pair6: (int, int) = (10, 2);

    matchTuple(pair1);
    matchTuple(pair2);
    matchTuple(pair3);
    matchTuple(pair4);
    matchTuple(pair5);
    matchTuple(pair6);

    printf("\n=== Enum Patterns ===\n");
    local res1: Result = Result.Success(0);
    local res2: Result = Result.Success(42);
    local res3: Result = Result.Success(200);
    local res4: Result = Result.Error("Not found");
    local res5: Result = Result.Error("This is a very long error message that exceeds ten chars");
    local res6: Result = Result.Pending;

    matchResult(res1);
    matchResult(res2);
    matchResult(res3);
    matchResult(res4);
    matchResult(res5);
    matchResult(res6);
}
