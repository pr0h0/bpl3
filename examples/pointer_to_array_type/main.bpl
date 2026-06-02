import [printf] from "std/c.bpl";

type IntArray = int[3];

frame main() ret int {
    local arr: int[3];
    arr[0] = 5;

    # Pointer to array type (using type alias to disambiguate)
    local ptr: *IntArray = &arr;

    # Accessing via pointer to array
    # ptr is *[3 x i32]
    # *ptr is [3 x i32]
    # (*ptr)[0] should work
    printf("%d\n", (*ptr)[0]);
    return 0;
}
