# Test for tuple destructuring (with explicit type annotations as required by BPL)
# BPL supports destructuring tuples in local declarations with type annotations

import [printf] from "std/c.bpl";

frame main() ret int {
    # Test 1: Simple tuple destructuring
    printf("=== Test 1: Simple tuple ===\n");
    local t1: (int, int) = (10, 20);
    local (a: int, b: int) = t1;
    printf("a = %d, b = %d\n", a, b);

    # Test 2: Triple tuple destructuring
    printf("\n=== Test 2: Triple tuple ===\n");
    local t2: (int, int, int) = (1, 2, 3);
    local (x: int, y: int, z: int) = t2;
    printf("x = %d, y = %d, z = %d\n", x, y, z);

    # Test 3: Mixed type tuple
    printf("\n=== Test 3: Mixed types ===\n");
    local t3: (int, float, bool) = (42, 3.14, true);
    local (num: int, pi: float, flag: bool) = t3;
    printf("num = %d, pi = %.2f, flag = %d\n", num, pi, cast<int>(flag));

    # Test 4: Nested tuple - outer destructuring
    printf("\n=== Test 4: Nested tuple (outer) ===\n");
    local nested: ((int, int), int) = ((100, 200), 300);
    local (inner: (int, int), outer: int) = nested;
    printf("inner = (%d, %d), outer = %d\n", inner.0, inner.1, outer);

    # Test 5: Deep nested tuple - step by step
    printf("\n=== Test 5: Deep nested ===\n");
    local deep: (int, (int, (int, int))) = (1, (2, (3, 4)));
    local (d1: int, rest: (int, (int, int))) = deep;
    local (d2: int, innermost: (int, int)) = rest;
    local (d3: int, d4: int) = innermost;
    printf("d1=%d, d2=%d, d3=%d, d4=%d\n", d1, d2, d3, d4);

    # Test 6: Tuple from function return
    printf("\n=== Test 6: Function return ===\n");
    local (min: int, max: int) = getMinMax(5, 10);
    printf("min = %d, max = %d\n", min, max);

    # Test 7: Swap using tuples
    printf("\n=== Test 7: Swap ===\n");
    local p: int = 100;
    local q: int = 200;
    printf("Before: p = %d, q = %d\n", p, q);
    local (newP: int, newQ: int) = (q, p);
    printf("After:  p = %d, q = %d\n", newP, newQ);

    printf("\nAll tests passed!\n");
    return 0;
}

frame getMinMax(a: int, b: int) ret (int, int) {
    if (a < b) {
        return (a, b);
    }
    return (b, a);
}
