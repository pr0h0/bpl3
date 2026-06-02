import [printf] from "std/c.bpl";
import [Array] from "std";

frame main() ret int {
    local v: Array<int> = Array<int>.new(10);
    v.push(10);
    v.push(20);

    printf("%d %d\n", v.get(0), v.get(1));
    v.destroy();
    return 0;
}
