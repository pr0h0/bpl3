import printf, free from "std/c.bpl";
import [BigInt] from "std/bigint.bpl";

frame print(value: *BigInt) {
    local text: string = value.toString();
    printf(" %s", text);
    free(cast<*void>(text));
}

# Print the quotient and remainder of dividend / divisor, and check that
# quotient * divisor + remainder gives the dividend back.
frame check(label: string, dividend: string, divisor: string) {
    local a: BigInt = BigInt.parse(dividend);
    local b: BigInt = BigInt.parse(divisor);
    local remainder: BigInt;
    local quotient: BigInt = a.divide(&b, &remainder);
    printf("%s", label);
    print(&quotient);
    print(&remainder);
    printf("\n");
    local product: BigInt = quotient.multiply(&b);
    local back: BigInt = product.add(&remainder);
    if (!back.equals(&a)) {
        printf("%s does not round-trip\n", label);
    }
    back.destroy();
    product.destroy();
    quotient.destroy();
    remainder.destroy();
    b.destroy();
    a.destroy();
}

frame main() ret int {
    check("case0", "123456789012345678901234567890123456789", "987654321987654321");
    check("case1", "-123456789012345678901234567890123456789", "987654321987654321");
    check("case2", "123456789012345678901234567890123456789", "-987654321");
    check("case3", "-1000000000000000000000000000", "-1000000000");
    check("case4", "5", "123456789012345678901234567890");
    check("case5", "123456789012345678901234567890", "123456789012345678901234567890");
    check("case6", "0", "7");
    check("case7", "123643938182849519684563204595115735627005336090010153508011901430662213935001482136146663921800831271881213635699584058829815947412059168994661172320005159202072597649678687893917", "359747288749968320387423188764149622136249625971422224978747638457135032666");
    check("case8", "13407807929942597099574024998205846127479365820592393377723561443721764030073546976801874298166903427690031858186486050853753882811946569946433649006084096", "515377520732011331036461129765621272702107522001");
    local one: BigInt = BigInt.fromLong(1);
    local zero: BigInt = BigInt.fromLong(0);
    local threw: bool = false;
    try {
        local never: BigInt = one.divide(&zero, cast<*BigInt>(nullptr));
        never.destroy();
    } catch {
        threw = true;
    }
    printf("divide by zero throws %d\n", cast<int>(threw));
    one.destroy();
    zero.destroy();
    return 0;
}
