import [printf] from "std/c.bpl";

type Adder = Lambda<int>(int);

frame makeAdder(x: int) ret Adder {
    return |y: int| ret int {
        return x + y;
    };
}

frame main() ret int {
    local add5: Adder = makeAdder(5);
    local res: int = add5(10);
    printf("Result: %d\n", res);
    return 0;
}
