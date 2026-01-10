import [IO] from "std/io.bpl";
import [Any] from "std/type.bpl";
import [TypeInfo] from "std/reflection.bpl";

struct Point {
    x: int,
    y: int,
}

# Homogeneous Variadic Function (Structs)
# Accepts a variable number of Point structs
frame printPoints(points: ...Point, count: int) {
    IO.printString("--- Homogeneous (Structs) ---");
    local i: int = 0;
    loop (i < count) {
        # points is a pointer to an array of Points
        local p: Point = points[i];
        IO.bpl_printf("Point %d: (%d, %d)\n", i, p.x, p.y);
        i += 1;
    }
}

# Heterogeneous Variadic Function (Any)
# Accepts a variable number of arguments of any type
frame printMixed(args: ...Any, count: int) {
    IO.printString("--- Heterogeneous (Mixed) ---");
    local i: int = 0;
    loop (i < count) {
        local arg: Any = args[i];

        if (arg is int) {
            IO.bpl_printf("Arg %d is int: %d\n", i, cast<int>(arg.data));
        } else if (arg is *Point) {
            # Structs are passed by pointer to Any
            local p_ptr: *Point = cast<*Point>(arg.data);
            IO.bpl_printf("Arg %d is *Point: (%d, %d)\n", i, p_ptr.x, p_ptr.y);
        } else if (arg is *int) {
            local ptr: *int = cast<*int>(arg.data);
            IO.bpl_printf("Arg %d is *int: value=%d\n", i, *ptr);
        } else {
            IO.bpl_printf("Arg %d is unknown type (name=%s)\n", i, arg.type_info.name);
        }
        i += 1;
    }
}

frame main() ret int {
    local p1: Point = Point { x: 10, y: 20 };

    local p2: Point = Point { x: 30, y: 40 };

    # Homogeneous call
    printPoints(p1, p2);

    local val: int = 999;

    # Heterogeneous call
    # Passing struct pointer (&p1), primitive (123), pointer (&val)
    # Note: Large structs must be passed by pointer to ...Any
    printMixed(&p1, 123, &val);

    return 0;
}
