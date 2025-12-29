extern printf(fmt: string, ...);

frame ignore<T>(x: T) ret T {
    printf("Ignored\n");
    return x;
}

frame main() ret int {
    ignore<int>(10);
    ignore<string>("test");
    return 0;
}
