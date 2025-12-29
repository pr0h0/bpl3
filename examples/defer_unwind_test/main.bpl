extern printf(fmt: string, ...);

frame main() {
    printf("--- Test 1: Throwing ---\n");
    printf("Start Main\n");
    try {
        funcA(true);
    } catch (e: int) {
        printf("Caught in Main\n");
    }
    printf("End Main\n");

    printf("\n--- Test 2: Normal Return ---\n");
    printf("Start Main\n");
    try {
        funcA(false);
    } catch (e: int) {
        printf("Caught in Main (Unexpected!)\n");
    }
    printf("End Main\n");
}

frame funcA(shouldThrow: bool) {
    defer printf("Defer A\n");
    printf("Enter A\n");
    funcB(shouldThrow);
}

frame funcB(shouldThrow: bool) {
    defer printf("Defer B\n");
    printf("Enter B\n");
    funcC(shouldThrow);
}

frame funcC(shouldThrow: bool) {
    defer printf("Defer C\n");
    printf("Enter C\n");
    funcD(shouldThrow);
}

frame funcD(shouldThrow: bool) {
    defer printf("Defer D\n");
    printf("Enter D\n");
    funcE(shouldThrow);
}

frame funcE(shouldThrow: bool) {
    defer printf("Defer E\n");
    printf("Enter E\n");
    if (shouldThrow) {
        printf("Throwing in E\n");
        throw 1;
    } else {
        printf("Returning from E\n");
    }
}
