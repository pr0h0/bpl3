import [printf] from "std/c.bpl";

enum Number {
    Int(int),
    Float(float),
}

frame main() ret int {
    local n: Number = Number.Int(10);

    match (n) {
        Number.Int(x) if x > 5 => {
            printf("Int > 5: %d\n", x);
        },
        Number.Int(x) => {
            printf("Int <= 5: %d\n", x);
        },
        Number.Float(f) => {
            printf("Float: %f\n", f);
        },
    };

    return 0;
}
