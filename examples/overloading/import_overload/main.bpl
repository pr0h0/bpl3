import add, [Calculator] from "./module.bpl";

extern printf(fmt: string, ...);

frame main() {
    local i: int = add(10, 20);
    local d: double = add(1.5, 2.5);

    printf("Int: %d\n", i);
    printf("Double: %f\n", d);

    local c: Calculator = Calculator { val: 100 };
    local ci: int = c.compute(50);
    local cd: double = c.compute(50.5);

    printf("Calc Int: %d\n", ci);
    printf("Calc Double: %f\n", cd);
}
