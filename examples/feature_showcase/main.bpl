import add, max, factorial from "./math_lib.bpl";
import [Point], [Circle], [Rectangle], [Drawable] from "./shapes.bpl";

extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;
extern free(ptr: *void);

# Enum definition
enum Color {
    Red,
    Green,
    Blue,
    Custom(int, int, int),
}

# Generic Enum
enum Option<T> {
    Some(T),
    None,
}

frame print_color(c: Color) {
    match (c) {
        Color.Red => printf("Color is Red\n"),
        Color.Green => printf("Color is Green\n"),
        Color.Blue => printf("Color is Blue\n"),
        Color.Custom(r, g, b) => printf("Custom Color(%d, %d, %d)\n", r, g, b),
    };
}

frame test_control_flow(n: int) {
    printf("--- Control Flow ---\n");
    if (n > 0) {
        printf("n is positive\n");
    } else {
        printf("n is non-positive\n");
    }

    local i: int = 0;
    loop (i < 3) {
        printf("Loop i=%d\n", i);
        i = i + 1;
    }

    # Match on integer with guards
    match (n) {
        0 => printf("Zero\n"),
        x if x < 0 => printf("Negative: %d\n", x),
        _ => printf("Positive: %d\n", n),
    };
}

frame test_pointers_and_arrays() {
    printf("--- Pointers and Arrays ---\n");
    local x: int = 42;
    local ptr: *int = &x;
    printf("Value via pointer: %d\n", *ptr);
    *ptr = 100;
    printf("New value: %d\n", x);

    # Array
    local arr: int[5];
    arr[0] = 10;
    arr[1] = 20;
    printf("Array elements: %d, %d\n", arr[0], arr[1]);

    # Manual memory (using extern malloc)
    local heap_int: *int = cast<*int>(malloc(sizeof(int)));
    *heap_int = 12345;
    printf("Heap integer: %d\n", *heap_int);
    free(cast<*void>(heap_int));
}

frame test_generics() {
    printf("--- Generics ---\n");
    local m: int = max<int>(10, 20);
    printf("Max(10, 20) = %d\n", m);

    local opt: Option<int> = Option.Some(55);
    match (opt) {
        Option.Some(val) => printf("Option has value: %d\n", val),
        Option.None => printf("Option is None\n"),
    };
}

frame main() ret int {
    printf("=== BPL Feature Showcase ===\n");

    # Math
    local sum: int = add(5, 7);
    printf("5 + 7 = %d\n", sum);
    printf("Factorial(5) = %d\n", factorial(5));

    # Control Flow
    test_control_flow(5);
    test_control_flow(-2);

    # Structs & Objects
    printf("--- Structs ---\n");
    local p1: Point = Point { x: 0.0, y: 0.0 };
    local p2: Point = Point { x: 3.0, y: 4.0 };
    printf("Distance: %.2f\n", p1.distance(&p2));

    local c: Circle = Circle { radius: 5.0, center: p1 };
    c.draw();
    printf("Circle Area: %.2f\n", c.area());

    # Enums
    printf("--- Enums ---\n");
    print_color(Color.Red);
    print_color(Color.Custom(255, 128, 0));

    # Generics
    test_generics();

    # Memory
    test_pointers_and_arrays();

    # Try-Catch
    printf("--- Exception Handling ---\n");
    try {
        printf("Throwing exception...\n");
        throw 404;
    } catch (e: int) {
        printf("Caught exception code: %d\n", e);
    } catchOther {
        printf("Caught unknown exception\n");
    }

    # Inline Assembly
    printf("--- Inline Assembly ---\n");
    local res: int = 0;
    # Simple addition via assembly (Intel syntax)
    # Using 'mov' and 'add'
    asm("intel") {
        mov eax, 10
        add eax, 20
        mov (=res), eax
    }
    printf("ASM 10 + 20 = %d\n", res);

    printf("=== End of Showcase ===\n");
    return 0;
}
