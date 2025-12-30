extern printf(fmt: string, ...);

struct P {
    x: int,
    y: int,
}

frame main() ret int {
    local p: *P = nullptr;
    local size: int = sizeof<P>();

    printf("sizeof(P): %d\n", size);

    if (p == nullptr) {
        printf("p == nullptr: true\n");
    } else {
        printf("p == nullptr: false\n");
    }

    return 0;
}
