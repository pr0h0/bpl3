extern printf(fmt: string, ...);
frame printMessage(msg: string) {
    printf("Message: %s\n", msg);
}
frame doNothing() {
    # Void function that does nothing
}
frame calculate(a: int, b: int) {
    local result: int = a + b;
    printf("Sum of %d and %d is %d\n", a, b, result);
    # No return statement needed for void
}
frame processArray(arr: *int, size: int) {
    printf("Processing array of size %d: ", size);
    local i: int = 0;
    loop (i < size) {
        printf("%d ", arr[i]);
        ++i;
    }
    printf("\n");
}
frame earlyReturn(x: int) {
    if (x < 0) {
        printf("Negative value, returning early\n");
        return;
    }
    if (x == 0) {
        printf("Zero value, returning early\n");
        return;
    }
    printf("Positive value: %d\n", x);
}
frame nestedVoidCalls() {
    printf("Starting nested void calls\n");
    printMessage("First message");
    calculate(10, 20);
    printMessage("Second message");
    printf("Finished nested void calls\n");
}
frame recursiveVoid(count: int) {
    if (count <= 0) {
        return;
    }
    printf("Count: %d\n", count);
    recursiveVoid(count - 1);
}
frame main() ret int {
    # Call void functions
    printMessage("Hello from void function");
    doNothing();
    printf("After calling doNothing()\n");
    calculate(15, 25);
    # Test with array
    local numbers: int[5];
    numbers[0] = 1;
    numbers[1] = 2;
    numbers[2] = 3;
    numbers[3] = 4;
    numbers[4] = 5;
    processArray(&numbers[0], 5);
    # Test early returns
    earlyReturn(-5);
    earlyReturn(0);
    earlyReturn(10);
    # Test nested calls
    nestedVoidCalls();
    # Test recursive void
    printf("Recursive countdown:\n");
    recursiveVoid(5);
    # Void function in loop
    printf("Void function in loop:\n");
    local i: int = 0;
    loop (i < 3) {
        printMessage("Loop iteration");
        ++i;
    }
    # Void function in conditional
    local flag: bool = true;
    if (flag) {
        printMessage("Flag is true");
    } else {
        printMessage("Flag is false");
    }
    return 0;
}
