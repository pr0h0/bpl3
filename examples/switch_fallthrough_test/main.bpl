extern printf(fmt: string, ...);

frame test_fallthrough(x: int) {
    printf("Testing %d: ", x);
    switch (x) {
        case 1:
            printf("One ");
            fallthrough;
        case 2:
            printf("Two\n");
            break;
        case 3:
            printf("Three ");
            fallthrough;
        case 4:
            printf("Four\n");
            return;
        default:
            printf("Default\n");
            return;
    }
}

frame test_optional_braces(x: int) {
    printf("Braces %d: ", x);
    switch(x) {
        case 10:
             printf("Ten\n");
             break;
        case 11: {
             printf("Eleven\n");
             break;
        }
        default:
             printf("Other\n");
             break;
    }
}

frame main() {
    test_fallthrough(1);
    test_fallthrough(2);
    test_fallthrough(3);
    test_fallthrough(5);

    test_optional_braces(10);
    test_optional_braces(11);
    test_optional_braces(12);
}
