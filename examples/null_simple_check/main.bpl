extern printf(fmt: string, ...);

struct P {
    x: int,
    y: int,
}

frame main() ret int {
    local p: *P = nullptr;

    if (p == nullptr) {
        printf("p is nullptr\n");
    } else {
        printf("p is not nullptr\n");
    }

    return 0;
}
