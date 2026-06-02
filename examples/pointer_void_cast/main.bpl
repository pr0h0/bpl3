import [printf] from "std/c.bpl";

frame main() ret int {
    local x: int = 123;
    local p: *int = &x;
    local v: *void = cast<*void>(p);
    local p2: *int = cast<*int>(v);

    printf("%d\n", *p2);
    return 0;
}
