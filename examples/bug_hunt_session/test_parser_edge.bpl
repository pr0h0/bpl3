# Bug Hunt: Parser Edge Cases
extern printf(fmt: string, ...);

# Test 1: Empty generic params
struct Empty<> {
    x: int,
}

# Test 2: Multiple commas in function call
frame test_call() {
    printf("test",, );
}

# Test 3: Double operators
frame test_double_ops() {
    local x: int = 5;
    x = x ++ 3;  # Double plus?
}

# Test 4: Chained comparisons (like Python)
frame test_chain_cmp() {
    local result: bool = 1 < 2 < 3;  # Should this work?
}

# Test 5: Missing semicolon
frame test_missing_semi() {
    local x: int = 5
    local y: int = 6;
}

# Test 6: Very long identifier
frame test_long_ident() {
    local thisIsAReallyReallyReallyReallyReallyReallyReallyReallyReallyLongIdentifierName: int = 0;
}

frame main() {
    printf("Parser edge case tests\n");
}
