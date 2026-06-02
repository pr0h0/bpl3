# Demonstration of the stack overflow issue
#
# The recursion path:
#
# 1. main() calls: b + addend
# 2. generateBinary() is called for the + operator
# 3. generateBinary() calls: resolveType(Box<int>)  <-- To get LLVM type
# 4. resolveType() calls: resolveMonomorphizedType(Box, [int])
# 5. resolveMonomorphizedType() generates Box_i32 struct
# 6. Generating Box_i32 queues: generateFunction(__add__)
# 7. generateFunction(__add__) needs to generate its body
# 8. The body contains: this.val + other
# 9. Which calls: resolveType(Box<int>)  <-- SAME TYPE AGAIN!
# 10. Back to step 4 --> INFINITE LOOP
#
# The recursion:
# generateBinary(+) 
#   → resolveType(Box<int>)
#     → resolveMonomorphizedType()
#       → generateFunction(__add__)
#         → generateStatement(return ...)
#           → generateBinary(+)  <-- RECURSION!
#             → resolveType(Box<int>)
#               → ... infinite loop

import [printf] from "std/c.bpl";

struct Box<T> {
    val: T,
    # THIS METHOD CAUSES THE ISSUE:
    # When we try to use b + addend in main:
    # - CodeGen tries to resolve Box<int>
    # - This generates Box_i32 struct
    # - Which generates THIS method
    # - Which contains: this.val + other
    # - Which needs Box<int> again!
    frame __add__(this: *Box<T>, other: T) ret Box<T> {
        local result: Box<T>;
        result.val = this.val + other; # <-- this line causes recursion
        return result;
    }
}

frame main() ret int {
    local b: Box<int>;
    b.val = 10;
    local addend: int = 5;

    # THIS LINE TRIGGERS THE STACK OVERFLOW:
    local b2: Box<int> = b + addend; # <-- Using the operator

    printf("value: %d\n", b2.val);
    return 0;
}
