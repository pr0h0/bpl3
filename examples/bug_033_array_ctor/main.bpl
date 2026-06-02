import [printf] from "std/c.bpl";

struct Counter {
    val: int,
    frame new() ret Counter {
        local c: Counter;
        c.val = 42;
        printf("Counter created!\n");
        return c;
    }
}

frame main() ret int {
    printf("Creating array...\n");
    local arr: Counter[3];

    printf("Checking values...\n");
    local i: int = 0;
    loop (i < 3) {
        printf("arr[%d].val = %d\n", i, arr[i].val);
        i = i + 1;
    }

    return 0;
}
