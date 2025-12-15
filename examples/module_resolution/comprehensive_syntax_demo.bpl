# comprehensive_syntax_demo.bpl - Demonstrates all valid import/export patterns
# Pattern 1: Function only export
export demoFunc1;
# Pattern 2: Type only export (must use brackets)
export [DemoStruct];
# Pattern 3: Multiple exports (separate statements)
export demoFunc2;
export demoFunc3;
# Pattern 4: Multiple type exports (separate statements, each in brackets)
export [TypeA];
export [TypeB];
# ==================== Declarations ====================
struct DemoStruct {
    id: int,
    name: string,
}
struct TypeA {
    x: int,
}
struct TypeB {
    y: int,
}
frame demoFunc1() ret int {
    return 1;
}
frame demoFunc2() ret int {
    return 2;
}
frame demoFunc3() ret int {
    return 3;
}
