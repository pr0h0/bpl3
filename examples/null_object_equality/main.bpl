extern printf(fmt: string, ...);

struct P {
    x: int,
    y: int,
}

frame main() ret int {
    local p: *P = nullptr;
    local q: *P = nullptr;

    if (p == nullptr) {
        printf("p == nullptr: true %d %d\n", p == nullptr, q == nullptr);
    } else {
        printf("p == nullptr: false\n");
    }

    # Create a properly initialized struct
    local r: *P = P { x: 1, y: 0 };
    q = r;

    if (q == nullptr) {
        printf("q == nullptr after init: true\n");
    } else {
        printf("q == nullptr after init: false %d %d\n", q.x, q.y);
    }

    return 0;
}
