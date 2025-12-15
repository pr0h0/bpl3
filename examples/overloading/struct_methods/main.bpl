extern printf(fmt: string, ...) ret int;

struct Calculator {
    frame add(this: *Calculator, a: int, b: int) ret int {
        return a + b;
    }

    frame add(this: *Calculator, a: double, b: double) ret double {
        return a + b;
    }
}

frame main() {
    local calc: Calculator = Calculator {};

    local i: int = calc.add(10, 20);
    printf("int add: %d\n", i);

    local d: double = calc.add(1.5, 2.5);
    printf("double add: %f\n", d);
}
