# Demonstration of match<Type> future functionality
# This shows how match<Type> could work with primitives and structs
# Note: Full RTTI support is needed for runtime generic type checking

import [Option] from "std/option.bpl";

import [printf] from "std/c.bpl";

# For now, match<Type> works perfectly with enum variants
frame processOption(opt: Option<int>) ret int {
    if (match<Option.Some>(opt)) {
        printf("Found Some variant\n");
        return 1;
    }
    if (match<Option.None>(opt)) {
        printf("Found None variant\n");
        return 0;
    }
    return -1;
}

# Future: With RTTI, this could work
# frame processGeneric<T>(value: T) ret int {
#     if (match<int>(value)) {
#         printf("Value is an int\n");
#         return 1;
#     }
#     if (match<string>(value)) {
#         printf("Value is a string\n");
#         return 2;
#     }
#     return 0;
# }

frame main() ret int {
    local some: Option<int> = Option<int>.Some(42);
    local none: Option<int> = Option<int>.None;

    processOption(some);
    processOption(none);

    # Future: With RTTI
    # processGeneric<int>(42);
    # processGeneric<string>("hello");

    return 0;
}
