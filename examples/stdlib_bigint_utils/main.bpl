import printf, free from "std/c.bpl";
import [BigInt] from "std/bigint.bpl";

frame show(label: string, value: *BigInt) {
    local text: string = value.toString();
    printf("%s %s\n", label, text);
    free(cast<*void>(text));
}

frame fits(text: string) {
    local value: BigInt = BigInt.parse(text);
    local out: long = 0;
    if (value.toLong(&out)) {
        printf("long %ld\n", out);
    } else {
        printf("too big %s\n", text);
    }
    value.destroy();
}

frame main() ret int {
    local three: BigInt = BigInt.fromLong(3);
    local power: BigInt = three.pow(200);
    show("pow", &power);
    local zero: BigInt = BigInt.fromLong(0);
    local one: BigInt = zero.pow(0);
    show("zero^0", &one);

    local negative: BigInt = BigInt.parse("-12345678901234567890");
    local positive: BigInt = negative.abs();
    show("abs", &positive);

    local a: BigInt = BigInt.parse("308039095855459744563698878906368");
    local b: BigInt = BigInt.parse("-48873677980689257489322752273774603865660850176");
    local divisor: BigInt = a.gcd(&b);
    show("gcd", &divisor);

    fits("9223372036854775807");
    fits("-9223372036854775808");
    fits("9223372036854775808");
    fits("-9223372036854775809");
    fits("1000000000000000000000000000");

    local threw: bool = false;
    try {
        local bad: BigInt = three.pow(-1);
        bad.destroy();
    } catch {
        threw = true;
    }
    printf("negative exponent throws %d\n", cast<int>(threw));

    three.destroy();
    power.destroy();
    zero.destroy();
    one.destroy();
    negative.destroy();
    positive.destroy();
    a.destroy();
    b.destroy();
    divisor.destroy();
    return 0;
}
