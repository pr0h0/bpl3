import printf, free from "std/c.bpl";
import [BigInt] from "std/bigint.bpl";

frame show(label: string, value: *BigInt) {
    local text: string = value.toString();
    printf("%s %s\n", label, text);
    free(cast<*void>(text));
}

# Replace `target` with `next`, releasing the old value.
frame replace(target: *BigInt, next: BigInt) {
    target.destroy();
    *target = next;
}

frame main() ret int {
    local factorial: BigInt = BigInt.fromLong(1);
    loop (local n: long = 2; n <= 50; n = n + 1) {
        local factor: BigInt = BigInt.fromLong(n);
        replace(&factorial, factorial.multiply(&factor));
        factor.destroy();
    }
    show("fact50", &factorial);
    factorial.destroy();

    local power: BigInt = BigInt.fromLong(1);
    local two: BigInt = BigInt.fromLong(2);
    loop (local i: int = 0; i < 256; i = i + 1) {
        replace(&power, power.multiply(&two));
    }
    show("pow256", &power);
    power.destroy();
    two.destroy();

    local a: BigInt = BigInt.fromLong(0);
    local b: BigInt = BigInt.fromLong(1);
    loop (local i: int = 0; i < 300; i = i + 1) {
        local next: BigInt = a.add(&b);
        a.destroy();
        a = b;
        b = next;
    }
    show("fib300", &a);
    a.destroy();
    b.destroy();

    local x: BigInt = BigInt.parse("-123456789012345678901234567890");
    local y: BigInt = BigInt.parse("+987654321098765432109876543210");
    local sum: BigInt = x.add(&y);
    show("sum", &sum);
    local difference: BigInt = x.subtract(&y);
    show("diff", &difference);
    local product: BigInt = x.multiply(&y);
    show("prod", &product);
    local remainder: int = 0;
    local quotient: BigInt = x.divideSmall(11, &remainder);
    show("div11", &quotient);
    printf("rem %d\n", remainder);
    printf("compare %d %d %d\n", x.compare(&y), y.compare(&x), x.compare(&x));

    local minimum: BigInt = BigInt.fromLong(-9223372036854775807 - 1);
    show("min", &minimum);
    local cancel: BigInt = x.add(&x);
    local zero: BigInt = cancel.subtract(&cancel);
    show("zero", &zero);
    printf("isZero %d isNegative %d\n", cast<int>(zero.isZero()), cast<int>(x.isNegative()));
    local nines: BigInt = BigInt.parse("999999999999999999");
    local one: BigInt = BigInt.fromLong(1);
    local carried: BigInt = nines.add(&one);
    show("carry", &carried);

    local parsed: bool = true;
    try {
        local bad: BigInt = BigInt.parse("12x");
        bad.destroy();
    } catch {
        parsed = false;
    }
    printf("rejects 12x %d\n", cast<int>(!parsed));

    x.destroy();
    y.destroy();
    sum.destroy();
    difference.destroy();
    product.destroy();
    quotient.destroy();
    minimum.destroy();
    cancel.destroy();
    zero.destroy();
    nines.destroy();
    one.destroy();
    carried.destroy();
    return 0;
}
