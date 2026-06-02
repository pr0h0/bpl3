import [printf] from "std/c.bpl";

frame main() ret int {
    printf("Loop 1:\n");
    loop (local i: int = 0; i < 3; i = i + 1) {
        printf("%d\n", i);
    }

    printf("Loop 2 (continue):\n");
    loop (local i: int = 0; i < 5; i = i + 1) {
        if (i == 2) {
            continue;
        }
        printf("%d\n", i);
    }

    printf("Loop 3 (empty init/step):\n");
    local j: int = 0;
    loop (j < 3) {
        printf("%d\n", j);
        j = j + 1;
    }

    printf("Loop 4 (empty init/condition/step):\n");
    loop (;;) {
        j = j + 1;
        if ((j % 2) == 0) {
            continue;
        }
        printf("%d\n", j);
        if (j >= 10) {
            break;
        }
    }

    return 0;
}
