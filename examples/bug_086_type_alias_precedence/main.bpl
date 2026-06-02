import [printf] from "std/c.bpl";
extern malloc(size: u64) ret *i8;

# BUG-086: Type alias precedence issue
# *Arr should mean "pointer to array", not "array of pointers"

type Arr = int[10];

frame main() {
    # This should allocate a pointer to an array of 10 ints
    # Not an array of 10 pointers
    local p: *Arr = cast<*Arr>(malloc(sizeof<Arr>()));

    # Set first element
    p[0] = 42;
    p[1] = 99;

    # Read back
    printf("p[0] = %d\n", p[0]);
    printf("p[1] = %d\n", p[1]);

    # Size check - should be 10 * sizeof(int) = 40 bytes
    printf("sizeof<Arr>() = %llu\n", sizeof<Arr>());
    printf("sizeof<*Arr>() = %llu\n", sizeof<*Arr>());
}
