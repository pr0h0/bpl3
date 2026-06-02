import * as Lib from "./lib.bpl";
import [printf] from "std/c.bpl";

frame main() {
    printf("Testing namespace imports\n");
    Lib.helper();
    local result: int = Lib.add(10, 20);
    printf("Result: %d\n", result);
}
