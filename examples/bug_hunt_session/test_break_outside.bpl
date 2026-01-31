# Bug Hunt: Break Outside Loop
extern printf(fmt: string, ...);

frame main() {
    break; # Should error
    printf("Test\n");
}
