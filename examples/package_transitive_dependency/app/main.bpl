import add, doublePlusOne, triplePlusOne from "math-extra";
import increment from "math-extra/features/increment";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    local sum: int = add(4, 5);
    local doubled: int = doublePlusOne(sum);
    local tripled: int = triplePlusOne(sum);
    local direct: int = increment(sum);

    printf("sum=%d doubled=%d tripled=%d direct=%d\n", sum, doubled, tripled, direct);
    return 0;
}
