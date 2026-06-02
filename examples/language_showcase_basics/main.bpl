import [String] from "std/string.bpl";

import [printf] from "std/c.bpl";

frame minMaxSum(a: int, b: int) ret (int, int, int) {
    if (a < b) {
        return (a, b, a + b);
    }
    return (b, a, a + b);
}

frame classifyAge(age: int) ret string {
    return match (age) {
        0 => "newborn",
        n if n < 13 => "child",
        n if n < 20 => "teen",
        _ => "adult",
    };
}

frame main() ret int {
    local one: int = 1;
    local two: int = one + one;
    printf("1 + 1 = %d\n", two);

    local add: int = 9 + 8;
    local sub: int = 12 - 3;
    local mul: int = 13 * 4;
    local div: int = 13 / 4;
    local mod: int = 13 % 4;
    local shifted: int = 1 << 6;
    local bitwise: int = 5 | 2;
    printf("operators: %d %d %d %d %d %d %d\n", add, sub, mul, div, mod, shifted, bitwise);

    local compound: int = 10;
    compound += 2;
    compound *= 3;
    compound -= 6;
    compound /= 2;
    printf("compound: %d\n", compound);

    local asFloat: float = cast<float>(compound) / 2.0;
    printf("cast: %.1f\n", asFloat);

    local text: String = `math ${two} and ${add}`;
    printf("interpolation: %s\n", text.toString());
    text.destroy();

    local values: int[4];
    values[0] = 2;
    values[1] = 4;
    values[2] = 6;
    values[3] = 8;

    local arraySum: int = 0;
    local i: int = 0;
    loop (i < 4) {
        arraySum += values[i];
        i++;
    }
    printf("array sum: %d\n", arraySum);

    local product: int = 1;
    loop (local j: int = 1; j <= 4; j++) {
        product *= j;
    }
    printf("loop product: %d\n", product);

    local grade: char = 'B';
    switch (grade) {
        case 'A':
            printf("switch: excellent\n");
            break;
        case 'B':
            printf("switch: good\n");
            break;
        default:
            printf("switch: other\n");
            break;
    }

    local (small: int, large: int, total: int) = minMaxSum(9, 3);
    printf("tuple: min=%d max=%d sum=%d\n", small, large, total);

    local group: string = classifyAge(15);
    printf("match: %s\n", group);

    local sign: string = total > 0 ? "positive" : "non-positive";
    printf("ternary: %s\n", sign);

    return 0;
}
