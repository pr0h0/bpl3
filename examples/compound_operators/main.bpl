extern printf(fmt: string, ...);
frame main() ret int {
    # Compound addition
    local a: int = 10;
    a += 5;
    printf("After a += 5: %d\n", a);
    # Compound subtraction
    local b: int = 20;
    b -= 7;
    printf("After b -= 7: %d\n", b);
    # Compound multiplication
    local c: int = 3;
    c *= 4;
    printf("After c *= 4: %d\n", c);
    # Compound division
    local d: int = 100;
    d /= 5;
    printf("After d /= 5: %d\n", d);
    # Compound modulo
    local e: int = 17;
    e %= 5;
    printf("After e %%= 5: %d\n", e);
    # Prefix increment
    local i: int = 0;
    ++i;
    printf("After ++i: %d\n", i);
    ++i;
    printf("After another ++i: %d\n", i);
    # Prefix decrement
    local j: int = 10;
    # --j;
    j = j - 1;
    printf("After --j: %d\n", j);
    # --j;
    j = j - 1;
    printf("After another --j: %d\n", j);
    # Using prefix in expressions
    local k: int = 5;
    local result1: int = ++k; # k becomes 6, result1 is 6
    printf("k after ++k in expression: %d, result: %d\n", k, result1);
    local m: int = 10;
    local result2: int = --m; # m becomes 9, result2 is 9
    printf("m after --m in expression: %d, result: %d\n", m, result2);
    # Chaining compound operations
    local chain: int = 5;
    chain += 3; # 8
    chain *= 2; # 16
    chain -= 6; # 10
    chain /= 2; # 5
    printf("After chaining compound ops: %d\n", chain);
    # Float compound operations
    local f: float = 10.5;
    f += 2.3;
    printf("After f += 2.3: %.2f\n", f);
    f *= 1.5;
    printf("After f *= 1.5: %.2f\n", f);
    # Using in loops
    local sum: int = 0;
    local counter: int = 1;
    loop (counter <= 5) {
        sum += counter;
        ++counter;
    }
    printf("Sum of 1-5: %d\n", sum);
    # Complex expression with compound ops
    local x: int = 100;
    x -= 20;
    x /= 4;
    x += 10;
    printf("Final x: %d\n", x);
    return 0;
}
