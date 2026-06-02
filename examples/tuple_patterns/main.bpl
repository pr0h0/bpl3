import [printf] from "std/c.bpl";
import [strlen] from "std/c.bpl";

# ============================================
# Comprehensive Tuple Pattern Matching Examples
# ============================================

# Basic 2-element tuple patterns
frame testBasicTuples() {
    printf("=== Basic Tuple Patterns ===\n");

    local p1: (int, int) = (0, 0);
    match (p1) {
        (0, 0) => printf("Origin OK\n"),
        (1, 0) => printf("X-axis\n"),
        (0, 1) => printf("Y-axis\n"),
        _ => printf("Other\n"),
    };

    local p2: (int, int) = (5, 10);
    match (p2) {
        (0, 0) => printf("Origin\n"),
        (5, 10) => printf("Point (5, 10) OK\n"),
        _ => printf("Other point\n"),
    };
}

# Mixed literal and identifier patterns
frame testMixedTuples() {
    printf("\n=== Mixed Tuple Patterns ===\n");

    local p: (int, int) = (3, 8);
    match (p) {
        (0, y) => printf("On Y-axis: y=%d\n", y),
        (x, 0) => printf("On X-axis: x=%d\n", x),
        (3, y) => printf("X is 3, Y is %d OK\n", y),
        (x, 8) => printf("X is %d, Y is 8\n", x),
        _ => printf("Other\n"),
    };

    local p2: (int, int) = (7, 0);
    match (p2) {
        (0, 0) => printf("Origin\n"),
        (x, 0) => printf("On X-axis at x=%d OK\n", x),
        (0, y) => printf("On Y-axis\n"),
        _ => printf("Other\n"),
    };
}

# Tuple patterns with guards
frame testTupleGuards() {
    printf("\n=== Tuple Patterns with Guards ===\n");

    local p1: (int, int) = (5, 5);
    match (p1) {
        (0, 0) => printf("Origin\n"),
        (a, b) if a == b => printf("Equal coordinates: %d OK\n", a),
        (a, b) if a > b => printf("X > Y\n"),
        _ => printf("X < Y\n"),
    };

    local p2: (int, int) = (3, 7);
    match (p2) {
        (a, b) if (a + b) == 10 => printf("Sum is 10: %d + %d OK\n", a, b),
        (a, b) if (a * b) > 50 => printf("Product > 50\n"),
        _ => printf("Other\n"),
    };

    local p3: (int, int) = (12, 3);
    match (p3) {
        (a, b) if a > b => printf("X > Y: %d > %d OK\n", a, b),
        (a, b) if a == b => printf("Equal\n"),
        _ => printf("X < Y\n"),
    };
}

# Different tuple types
frame testDifferentTypes() {
    printf("\n=== Different Tuple Types ===\n");

    # (int, bool)
    local ib: (int, bool) = (42, true);
    match (ib) {
        (0, _) => printf("Zero\n"),
        (42, true) => printf("42 and true OK\n"),
        (n, true) => printf("True with %d\n", n),
        (n, false) => printf("False with %d\n", n),
    };

    # (bool, bool)
    local bb: (bool, bool) = (true, false);
    match (bb) {
        (true, true) => printf("Both true\n"),
        (true, false) => printf("True, False OK\n"),
        (false, true) => printf("False, True\n"),
        (false, false) => printf("Both false\n"),
    };

    # (string, int)
    local si: (string, int) = ("hello", 5);
    match (si) {
        ("", 0) => printf("Empty\n"),
        ("hello", 5) => printf("Hello with 5 OK\n"),
        (s, n) if strlen(s) == n => printf("Length matches\n"),
        _ => printf("Other\n"),
    };
}

# Three-element tuples
frame testTripleTuples() {
    printf("\n=== Three-Element Tuples ===\n");

    local t1: (int, int, int) = (1, 2, 3);
    match (t1) {
        (0, 0, 0) => printf("All zeros\n"),
        (1, 2, 3) => printf("Sequence 1,2,3 OK\n"),
        (a, b, c) if (a + b) == c => printf("Sum: a+b=c\n"),
        _ => printf("Other\n"),
    };

    local t2: (int, int, int) = (3, 4, 7);
    match (t2) {
        (0, 0, 0) => printf("Origin\n"),
        (1, 2, 3) => printf("Sequence\n"),
        (a, b, c) if (a + b) == c => printf("Sum matches: %d+%d=%d OK\n", a, b, c),
        (a, b, c) if (a == b) && (b == c) => printf("All equal\n"),
        _ => printf("Other triple\n"),
    };

    local t3: (int, bool, string) = (5, true, "test");
    match (t3) {
        (0, _, _) => printf("Zero first\n"),
        (5, true, "test") => printf("Exact match OK\n"),
        (n, true, s) => printf("True with %d\n", n),
        _ => printf("Other\n"),
    };
}

# Complex guards
frame testComplexTupleGuards() {
    printf("\n=== Complex Tuple Guards ===\n");

    local p: (int, int) = (6, 4);
    match (p) {
        (a, b) if ((a % 2) == 0) && ((b % 2) == 0) => printf("Both even OK\n"),
        (a, b) if ((a % 2) == 1) && ((b % 2) == 1) => printf("Both odd\n"),
        (a, b) if (a % 2) == 0 => printf("First even\n"),
        _ => printf("First odd\n"),
    };

    local p2: (int, int) = (-3, 5);
    match (p2) {
        (a, b) if (a > 0) && (b > 0) => printf("Quadrant I\n"),
        (a, b) if (a < 0) && (b > 0) => printf("Quadrant II OK\n"),
        (a, b) if (a < 0) && (b < 0) => printf("Quadrant III\n"),
        (a, b) if (a > 0) && (b < 0) => printf("Quadrant IV\n"),
        _ => printf("On axis\n"),
    };
}

# Wildcards
frame testWildcards() {
    printf("\n=== Wildcard Patterns ===\n");

    local p: (int, int) = (7, 9);
    match (p) {
        (0, _) => printf("X is zero\n"),
        (_, 0) => printf("Y is zero\n"),
        (7, _) => printf("X is 7 OK\n"),
        (_, 9) => printf("Y is 9\n"),
        _ => printf("Other\n"),
    };
}

# Nested tuple matches
frame testNestedTupleMatches() {
    printf("\n=== Nested Tuple Matches ===\n");

    local p1: (int, int) = (5, 5);
    local p2: (int, int) = (10, 10);

    match (p1) {
        (0, 0) => printf("P1 origin\n"),
        (5, 5) => match (p2) {
            (0, 0) => printf("P2 origin\n"),
            (10, 10) => printf("P1=(5,5), P2=(10,10) OK\n"),
            _ => printf("P2 other\n"),
        },
        _ => printf("P1 other\n"),
    };
}

# Tuple match in expressions
frame testTupleExpressions() ret int {
    printf("\n=== Tuple Match in Expressions ===\n");

    local p: (int, int) = (3, 4);

    # In assignment
    local dist: int = match (p) {
        (0, 0) => 0,
        (3, 4) => 5,
        (a, b) => a + b,
    };
    printf("Distance: %d OK\n", dist);

    # In return
    return match (p) {
        (0, 0) => 0,
        (3, 4) => 1,
        _ => -1,
    };
}

frame main() ret int {
    testBasicTuples();
    testMixedTuples();
    testTupleGuards();
    testDifferentTypes();
    testTripleTuples();
    testComplexTupleGuards();
    testWildcards();
    testNestedTupleMatches();
    testTupleExpressions();
    return 0;
}
