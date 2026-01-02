import * as Lib from "./lib.bpl";
extern printf(fmt: string, ...);

frame main() {
    printf("Testing namespace imports\n");
    Lib.helper();
    local result: int = Lib.add(10, 20);
    printf("Result: %d\n", result);
}
