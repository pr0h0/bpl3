import [printf] from "std/c.bpl";

struct Mixed {
    flag: bool,
    value: int,
    data: u8,
}

frame main() {
    # This should fail: trying to put i32 into u8
    local mixed: Mixed = Mixed { flag: true, value: 999, data: 255 };

    printf("flag: %d, value: %d, data: %d\n", cast<int>(mixed.flag), mixed.value, cast<int>(mixed.data));

    if (mixed.data == 255) {
        printf("SUCCESS\n");
    } else {
        printf("FAIL: data=%d, expected 255\n", cast<int>(mixed.data));
    }
}
