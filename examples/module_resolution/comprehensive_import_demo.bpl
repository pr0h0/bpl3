# comprehensive_import_demo.bpl - Demonstrates all valid import patterns
# Pattern 1: Single function import
import demoFunc1 from "./comprehensive_syntax_demo.bpl";
# Pattern 2: Single type import (must use brackets)  
import [DemoStruct] from "./comprehensive_syntax_demo.bpl";
# Pattern 3: Multiple function imports (comma-separated, no brackets)
import demoFunc2, demoFunc3 from "./comprehensive_syntax_demo.bpl";
# Pattern 4: Multiple type imports (each in separate brackets)
import [TypeA], [TypeB] from "./comprehensive_syntax_demo.bpl";
# Pattern 5: Mixed imports (functions and types)
# Note: Each type in its own brackets, functions without brackets
# Order doesn't matter, can interleave types and functions
# import func1, [Type1], func2, [Type2] from "./module.bpl";
extern printf(fmt: string, ...) ret int;
frame main() ret int {
    printf("=== Comprehensive Import/Export Syntax Demo ===\n\n");
    printf("Testing function imports:\n");
    printf("  demoFunc1() = %d\n", demoFunc1());
    printf("  demoFunc2() = %d\n", demoFunc2());
    printf("  demoFunc3() = %d\n", demoFunc3());
    printf("\nTesting type imports:\n");
    local ds: DemoStruct = DemoStruct { id: 100, name: "test" };
    printf("  DemoStruct created with id=%d\n", ds.id);
    local ta: TypeA = TypeA { x: 42 };
    local tb: TypeB = TypeB { y: 99 };
    printf("  TypeA.x = %d\n", ta.x);
    printf("  TypeB.y = %d\n", tb.y);
    printf("\n=== All syntax patterns work! ===\n");
    return 0;
}
