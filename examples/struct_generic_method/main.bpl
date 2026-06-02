import [printf] from "std/c.bpl";

struct Printer {
    frame print<T>(this: Printer) {
        # This relies on implicit string conversion or we need specific handling
        # For now let's just print generic type size as a proxy for "it works"
        printf("Size: %d\n", sizeof<T>());
    }
}

frame main() ret int {
    local p: Printer;
    p.print<int>();
    p.print<float>();
    return 0;
}
