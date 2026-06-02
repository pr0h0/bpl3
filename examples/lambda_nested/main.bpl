import [printf] from "std/c.bpl";

type Op = Lambda<int>(int);

frame main() ret int {
    local x: int = 10;

    local outer: Op = |y: int| ret int {
        local inner: Op = |z: int| ret int {
            return x + y + z;
        };
        return inner(5);
    };

    local res: int = outer(20);
    printf("Result: %d\n", res);
    return 0;
}
