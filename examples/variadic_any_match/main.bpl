import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

frame print_any(args: ...Any, count: int) {
    printf("Printing %d args:\n", count);
    local i: int = 0;
    loop (i < count) {
        match (args[i]) {
            int(v) => printf("  Arg %d: int(%d)\n", i, v),
            string(s) => printf("  Arg %d: string(%s)\n", i, s),
            Point(p) => printf("  Arg %d: Point(%d, %d)\n", i, p.x, p.y),
            _ => printf("  Arg %d: Unknown\n", i),
        };
        i = i + 1;
    }
}

frame main() {
    local p: Point = Point { x: 10, y: 20 };

    # Test variadic call with heterogeneous types
    print_any(42, "Hello", p, Point { x: 1, y: 2 });
    # Struct passed by value
    # Structural literal
}
