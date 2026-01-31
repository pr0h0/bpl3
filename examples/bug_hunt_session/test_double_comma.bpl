# Bug Hunt: Double comma in function call
extern printf(fmt: string, ...);

frame test_call() {
    printf("test",, );
}

frame main() {
    printf("Parser test\n");
}
