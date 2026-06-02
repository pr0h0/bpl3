# Bug Hunt: Sizeof and Offsetof Edge Cases
import [printf] from "std/c.bpl";

struct Empty {
}

struct Simple {
    x: int,
    y: int,
}

struct WithPadding {
    a: char,
    b: int,
    c: char,
}

struct Nested {
    simple: Simple,
    value: int,
}

frame main() {
    # Test sizeof various types
    printf("sizeof(int) = %lu\n", sizeof<int>());
    printf("sizeof(i64) = %lu\n", sizeof<i64>());
    # printf("sizeof(float) = %lu\n", sizeof<float>());  # BUG: Causes LLVM error
    # printf("sizeof(f64) = %lu\n", sizeof<f64>());  # BUG: Causes LLVM error
    printf("sizeof(char) = %lu\n", sizeof<char>());
    printf("sizeof(bool) = %lu\n", sizeof<bool>());
    printf("sizeof(*int) = %lu\n", sizeof<*int>());

    # Struct sizes
    printf("\nsizeof(Empty) = %lu\n", sizeof<Empty>());
    printf("sizeof(Simple) = %lu\n", sizeof<Simple>());
    printf("sizeof(WithPadding) = %lu\n", sizeof<WithPadding>());
    printf("sizeof(Nested) = %lu\n", sizeof<Nested>());

    # Array sizes - use type alias
    type IntArr10 = int[10];
    printf("\nsizeof(int[10]) via alias = %lu\n", sizeof<IntArr10>());

    # Direct array variable
    local arr: int[10];
    printf("sizeof(arr) = %lu\n", sizeof(arr));

    # Tuple sizes
    printf("\nsizeof((int, int)) = %lu\n", sizeof<(int, int)>());
    printf("sizeof((char, i64)) = %lu\n", sizeof<(char, i64)>());

    # offsetof tests
    printf("\noffsetof(Simple, x) = %lu\n", offsetof(Simple, x));
    printf("offsetof(Simple, y) = %lu\n", offsetof(Simple, y));
    printf("offsetof(WithPadding, a) = %lu\n", offsetof(WithPadding, a));
    printf("offsetof(WithPadding, b) = %lu\n", offsetof(WithPadding, b));
    printf("offsetof(WithPadding, c) = %lu\n", offsetof(WithPadding, c));
    printf("offsetof(Nested, simple) = %lu\n", offsetof(Nested, simple));
    printf("offsetof(Nested, value) = %lu\n", offsetof(Nested, value));
}
