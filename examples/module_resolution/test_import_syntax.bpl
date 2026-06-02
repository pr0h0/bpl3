# test_import_syntax.bpl - Test various valid import syntaxes
# ✅ Valid: Import multiple functions and types
import testFunc1, testFunc2, [TestType1], [TestType2] from "./test_syntax.bpl";
import [printf] from "std/c.bpl";
frame main() ret int {
    printf("Testing import syntax...\n");
    local result1: int = testFunc1();
    local result2: int = testFunc2();
    printf("testFunc1() = %d\n", result1);
    printf("testFunc2() = %d\n", result2);
    local t1: TestType1 = TestType1 { value: 123 };
    printf("TestType1.value = %d\n", t1.value);
    printf("All imports work correctly!\n");
    return 0;
}
