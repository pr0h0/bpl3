extern printf(fmt: string, ...);

frame max<T>(a: T, b: T) ret T {
    # Assuming T supports > operator (int/float)
    if (a > b) {
        return a;
    }
    return b;
}

frame main() ret int {
    printf("%d\n", max<int>(10, 20));
    return 0;
}
