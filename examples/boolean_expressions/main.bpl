extern printf(fmt: string, ...);
frame testComplexLogical() {
    printf("Testing complex logical expressions:\n");
    local a: bool = true;
    local b: bool = false;
    local c: bool = true;
    # AND combinations
    local and1: bool = a && b;
    printf("true && false = %d\n", and1);
    local and2: bool = a && c;
    printf("true && true = %d\n", and2);
    local and3: bool = b && b;
    printf("false && false = %d\n", and3);
    # OR combinations
    local or1: bool = a || b;
    printf("true || false = %d\n", or1);
    local or2: bool = b || b;
    printf("false || false = %d\n", or2);
    # NOT
    local not1: bool = !a;
    printf("!true = %d\n", not1);
    local not2: bool = !b;
    printf("!false = %d\n", not2);
    # Complex combinations
    local complex1: bool = (a && b) || c;
    printf("(true && false) || true = %d\n", complex1);
    local complex2: bool = a && (b || c);
    printf("true && (false || true) = %d\n", complex2);
    local complex3: bool = !(a && b);
    printf("!(true && false) = %d\n", complex3);
    local complex4: bool = !a || !b;
    printf("(!true) || (!false) = %d\n", complex4);
}
frame testShortCircuit() {
    printf("\nTesting short-circuit evaluation:\n");
    local count: int = 0;
    # AND short-circuit - second part shouldn't execute
    local result1: bool = false && (++count > 0);
    printf("After false && (++count > 0): count = %d, result = %d\n", count, result1);
    # OR short-circuit - second part shouldn't execute
    count = 0;
    local result2: bool = true || (++count > 0);
    printf("After true || (++count > 0): count = %d, result = %d\n", count, result2);
    # Non-short-circuit cases
    count = 0;
    local result3: bool = true && (++count > 0);
    printf("After true && (++count > 0): count = %d, result = %d\n", count, result3);
    count = 0;
    local result4: bool = false || (++count >= 0);
    printf("After false || (++count >= 0): count = %d, result = %d\n", count, result4);
}
frame testLogicalWithComparisons() {
    printf("\nTesting logical with comparisons:\n");
    local x: int = 10;
    local y: int = 20;
    local z: int = 15;
    local result1: bool = (x < y) && (y > z);
    printf("(%d < %d) && (%d > %d) = %d\n", x, y, y, z, result1);
    local result2: bool = (x > y) || (z < y);
    printf("(%d > %d) || (%d < %d) = %d\n", x, y, z, y, result2);
    local result3: bool = !(x == y);
    printf("!(%d == %d) = %d\n", x, y, result3);
    local result4: bool = (x < z) && (z < y);
    printf("(%d < %d) && (%d < %d) = %d\n", x, z, z, y, result4);
}
frame testNestedLogical() {
    printf("\nTesting nested logical expressions:\n");
    local a: int = 5;
    local b: int = 10;
    local c: int = 15;
    local d: int = 20;
    local result1: bool = ((a < b) && (c < d)) || ((a > b) && (c > d));
    printf("((a < b) && (c < d)) || ((a > b) && (c > d)) = %d\n", result1);
    local result2: bool = !((a == b) || (c == d));
    printf("!((a == b) || (c == d)) = %d\n", result2);
    local result3: bool = (a < b) && (b < c) && (c < d);
    printf("(a < b) && (b < c) && (c < d) = %d\n", result3);
}
frame testLogicalInControl() {
    printf("\nTesting logical in control flow:\n");
    local age: int = 25;
    local hasLicense: bool = true;
    if ((age >= 18) && hasLicense) {
        printf("Can drive: age=%d, hasLicense=%d\n", age, hasLicense);
    }
    local score: int = 85;
    if ((score >= 90) || ((score >= 80) && (score < 90))) {
        printf("Good grade: score=%d\n", score);
    }
    # Loop with logical
    local i: int = 0;
    local sum: int = 0;
    loop ((i < 10) && (sum < 30)) {
        sum += i;
        ++i;
    }
    printf("Loop stopped at i=%d, sum=%d\n", i, sum);
}
frame isInRange(val: int, min: int, max: int) ret bool {
    return (val >= min) && (val <= max);
}
frame testLogicalFunctions() {
    printf("\nTesting logical in functions:\n");
    local test1: bool = isInRange(5, 1, 10);
    printf("isInRange(5, 1, 10) = %d\n", test1);
    local test2: bool = isInRange(15, 1, 10);
    printf("isInRange(15, 1, 10) = %d\n", test2);
}
frame main() ret int {
    testComplexLogical();
    testShortCircuit();
    testLogicalWithComparisons();
    testNestedLogical();
    testLogicalInControl();
    testLogicalFunctions();
    # Test De Morgan's laws
    printf("\nTesting De Morgan's laws:\n");
    local p: bool = true;
    local q: bool = false;
    local demorgan1a: bool = !(p && q);
    local demorgan1b: bool = !p || !q;
    printf("!(p && q) = %d, (!p) || (!q) = %d (should be equal)\n", demorgan1a, demorgan1b);
    local demorgan2a: bool = !(p || q);
    local demorgan2b: bool = !p && !q;
    printf("!(p || q) = %d, (!p) && (!q) = %d (should be equal)\n", demorgan2a, demorgan2b);
    return 0;
}
