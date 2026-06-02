import [printf] from "std/c.bpl";

frame main() ret int {
    local x: int = 42;

    if (x is i32) {
        printf("x is i32 (Correct)\n");
    } else {
        printf("x is NOT i32 (Error)\n");
        return 1;
    }

    if (x is int) {
        printf("x is int (Correct)\n");
    } else {
        printf("x is NOT int (Error)\n");
        return 1;
    }

    if (x is uint) {
        printf("x is uint (Error)\n");
        return 1;
    } else {
        printf("x is NOT uint (Correct)\n");
    }

    # Check alias
    type MyInt = int;
    local y: MyInt = 10;
    if (y is i32) {
        printf("y is i32 (Correct)\n");
    } else {
        printf("y is NOT i32 (Error)\n");
        return 1;
    }

    # Chained as test
    if (((((42 as int) as uint) as short) as bool) is bool) {
        printf("Chained as works (Correct)\n");
    } else {
        printf("Chained as failed (Error)\n");
        return 1;
    }
    # Compare 'as' vs 'cast'
    local val_as: uint = (x as uint);
    local val_cast: uint = cast<uint>(x);
    if (val_as == val_cast) {
        printf("'as' matches 'cast' (Correct)\n");
    } else {
        printf("'as' does NOT match 'cast' (Error)\n");
        return 1;
    }

    # Compare 'is' vs 'match'
    local match_res: bool = match<int>(x);
    local is_res: bool = (x is int);
    if (is_res == match_res) {
        printf("'is' matches 'match' (Correct)\n");
    } else {
        printf("'is' does NOT match 'match' (Error)\n");
        return 1;
    }
    return 0;
}
