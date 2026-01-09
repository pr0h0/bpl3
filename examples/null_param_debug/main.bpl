import [NullAccessError] from "std/errors.bpl";
extern printf(fmt: string, ...);

struct Data {
    value: int,
    flag: bool,
}

frame testParam(d: *Data) {
    printf("In testParam\n");
    printf("d.value=%d\n", d.value);

    if (d.flag) {
        printf("d.flag=true\n");
    } else {
        printf("d.flag=false\n");
    }

    if (d == nullptr) {
        printf("d is nullptr!\n");
    } else {
        printf("d is NOT nullptr\n");
    }

    printf("Accessing d.value...\n");
    local val: int = d.value;
    printf("Got value: %d\n", val);
}

frame main() ret int {
    printf("Test: Passing nullptr as parameter\n");
    local data: *Data = nullptr;

    try {
        testParam(data);
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    printf("Test completed\n");
    return 0;
}
