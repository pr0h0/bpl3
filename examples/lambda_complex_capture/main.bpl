import [printf] from "std/c.bpl";

type Processor = Lambda<void>(int);

frame main() ret int {
    local a: int = 100;
    local b: int = 200;
    local factor: float = 1.5;

    local proc: Processor = |val: int| {
        local sum: int = a + b + val;
        local scaled: float = cast<float>(sum) * factor;
        printf("Sum: %d, Scaled: %.1f\n", sum, scaled);
    };

    proc(50);
    # Lambdas capture locals by value when created, so this does not affect proc.
    factor = 2.0;
    proc(-100);
    return 0;
}
