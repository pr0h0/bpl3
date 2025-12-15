extern printf(fmt: string, ...) ret int;

frame process<T>(val: T) {
    printf("Generic process\n");
}

frame process_two<T, U>(a: T, b: U) {
    printf("Generic two args\n");
}

frame process_two(a: int, b: int) {
    printf("Int two args: %d, %d\n", a, b);
}

frame process() {
    printf("Non-generic process\n");
}

frame process(x: int) {
    printf("Int process: %d\n", x);
}

frame process(x: long) {
    printf("Long process: %d\n", x);
}

struct Test {
    frame process<T>(this: *Test, val: T) {
        printf("Struct generic process\n");
    }

    frame process(this: *Test, val: int) {
        printf("Struct int process: %d\n", val);
    }

    frame process(this: *Test) {
        printf("Struct non-generic process (instance)\n");
    }

    frame process(obj: Test) {
        printf("Struct non-generic process (static)\n");
    }

    frame process() {
        printf("Struct non-generic process no args\n");
    }
}

frame main() {
    process<double>(3.14);

    process_two(10, 20);
    process_two<double, double>(1.5, 2.5);

    process();
    process(42);
    process(cast<long>(100));
    process<int>(100);

    local t: Test = Test {};
    t.process<string>("Hello");
    t.process(123);
    t.process();

    Test.process(&t);
    Test.process();
}
