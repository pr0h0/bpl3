# test_syntax.bpl - Valid import/export syntax examples
# ✅ Valid: Exporting functions (one per statement)
export testFunc1;
export testFunc2;
# ✅ Valid: Exporting types (one per statement)
export [TestType1];
export [TestType2];
struct TestType1 {
    value: int,
}
struct TestType2 {
    data: string,
}
frame testFunc1() ret int {
    return 42;
}
frame testFunc2() ret int {
    return 100;
}
