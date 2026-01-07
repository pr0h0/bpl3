extern printf(fmt: string, ...);
extern strlen(s: string) ret int;

# ============================================
# Comprehensive Primitive Pattern Matching Examples
# ============================================

# Integer matching with all types
frame testIntegers() {
    printf("=== Integer Patterns ===\n");

    # Test int
    local x: int = 42;
    match (x) {
        0 => printf("Zero\n"),
        42 => printf("The answer! OK\n"),
        n if n < 0 => printf("Negative\n"),
        _ => printf("Other\n"),
    };

    # Test i8
    local b: i8 = 127;
    match (b) {
        127 => printf("Max i8 OK\n"),
        0 => printf("Zero i8\n"),
        _ => printf("Other i8\n"),
    };

    # Test u8
    local ub: u8 = 255;
    match (ub) {
        0 => printf("Zero u8\n"),
        255 => printf("Max u8 OK\n"),
        _ => printf("Other u8\n"),
    };

    # Test with guards
    local n: int = 15;
    match (n) {
        n if ((n % 3) == 0) && ((n % 5) == 0) => printf("FizzBuzz OK\n"),
        n if (n % 3) == 0 => printf("Fizz\n"),
        n if (n % 5) == 0 => printf("Buzz\n"),
        _ => printf("Number\n"),
    };
}

# Float matching
frame testFloats() {
    printf("\n=== Float Patterns ===\n");

    local f: float = 3.14;
    match (f) {
        0.0 => printf("Zero\n"),
        1.0 => printf("One\n"),
        3.14 => printf("Pi! OK\n"),
        f if f < 0.0 => printf("Negative\n"),
        _ => printf("Other\n"),
    };

    local f2: float = 2.5;
    match (f2) {
        0.0 => printf("Zero float\n"),
        2.5 => printf("Positive 2.5 OK\n"),
        x if x > 5.0 => printf("Large\n"),
        _ => printf("Other float\n"),
    };
}

# Boolean matching
frame testBooleans() {
    printf("\n=== Boolean Patterns ===\n");

    local flag: bool = true;
    match (flag) {
        true => printf("True! OK\n"),
        false => printf("False\n"),
    };

    local flag2: bool = false;
    match (flag2) {
        true => printf("True\n"),
        b => printf("Got: %d OK\n", b),
    };
}

# String matching
frame testStrings() {
    printf("\n=== String Patterns ===\n");

    local s: string = "hello";
    match (s) {
        "" => printf("Empty\n"),
        "hello" => printf("Hello! OK\n"),
        "world" => printf("World\n"),
        _ => printf("Other\n"),
    };

    local s2: string = "";
    match (s2) {
        "" => printf("Empty string OK\n"),
        s if strlen(s) > 10 => printf("Long\n"),
        s if strlen(s) < 5 => printf("Short\n"),
        _ => printf("Medium\n"),
    };

    local s3: string = "this is a very long string";
    match (s3) {
        "" => printf("Empty\n"),
        s if strlen(s) > 20 => printf("Very long OK\n"),
        s if strlen(s) > 10 => printf("Long\n"),
        s if strlen(s) == 5 => printf("Five chars\n"),
        _ => printf("Other length\n"),
    };
}

# Character matching
frame testChars() {
    printf("\n=== Character Patterns ===\n");

    local c: char = 'A';
    match (c) {
        'A' => printf("Letter A OK\n"),
        'Z' => printf("Letter Z\n"),
        '0' => printf("Zero\n"),
        _ => printf("Other char\n"),
    };

    local c2: char = '5';
    match (c2) {
        'a' => printf("Lowercase a\n"),
        c if (c >= '0') && (c <= '9') => printf("Digit OK\n"),
        c if (c >= 'A') && (c <= 'Z') => printf("Uppercase\n"),
        _ => printf("Other\n"),
    };
}

# Complex guards
frame testComplexGuards() {
    printf("\n=== Complex Guards ===\n");

    local x: int = 100;
    match (x) {
        n if (n >= 100) && (n < 200) => printf("In range [100, 200) OK\n"),
        n if (n >= 0) && (n < 100) => printf("In range [0, 100)\n"),
        n if n < 0 => printf("Negative\n"),
        _ => printf("Greater than 200\n"),
    };

    local y: int = 12;
    match (y) {
        n if ((n % 2) == 0) && ((n % 3) == 0) => printf("Divisible by 2 and 3 OK\n"),
        n if (n % 2) == 0 => printf("Even\n"),
        n if (n % 3) == 0 => printf("Divisible by 3\n"),
        _ => printf("Neither\n"),
    };
}

# Nested matches
frame testNestedMatches() {
    printf("\n=== Nested Matches ===\n");

    local x: int = 5;
    local y: int = 10;

    match (x) {
        0 => printf("X is zero\n"),
        5 => match (y) {
            0 => printf("Y is zero\n"),
            10 => printf("X=5, Y=10 OK\n"),
            _ => printf("Y is other\n"),
        },
        _ => printf("X is other\n"),
    };
}

# Match in expressions
frame testMatchExpressions() ret int {
    printf("\n=== Match in Expressions ===\n");

    local x: int = 3;

    # In assignment
    local result: int = match (x) {
        1 => 10,
        2 => 20,
        3 => 30,
        _ => 0,
    };
    printf("Result: %d OK\n", result);

    # In return
    return match (x) {
        1 => 1,
        2 => 2,
        3 => 3,
        _ => -1,
    };
}

frame main() ret int {
    testIntegers();
    testFloats();
    testBooleans();
    testStrings();
    testChars();
    testComplexGuards();
    testNestedMatches();
    testMatchExpressions();
    return 0;
}
