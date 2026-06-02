import [printf] from "std/c.bpl";

global side_effect_count: int = 0;

frame check() ret bool {
    side_effect_count = side_effect_count + 1;
    return true;
}

frame main() ret int {
    # OR short-circuit: true || check() -> check() should NOT run
    if (true || check()) {
        printf("OR passed\n");
    }
    printf("Count: %d\n", side_effect_count);

    # AND short-circuit: false && check() -> check() should NOT run
    if (false && check()) {
        printf("Should not be here\n");
    }
    printf("Count: %d\n", side_effect_count);

    return 0;
}
