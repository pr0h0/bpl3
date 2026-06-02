import [printf] from "std/c.bpl";

struct Printer {
    frame print<T>(this: Printer, _val: T) {
        # This might be hard because we can't easily print generic T without traits/interfaces
        # But we can test that it compiles and runs
        printf("Printing generic value\n");
    }
}

struct Container<T> {
    val: T,
    frame map<U>(this: Container<T>, defaultVal: U) ret U {
        return defaultVal;
    }
}

frame main() ret int {
    local p: Printer;
    p.print<int>(10);

    local c: Container<int>;
    c.val = 10;
    local res: float = c.map<float>(3.14);
    printf("Map result: %.2f\n", res);

    return 0;
}
