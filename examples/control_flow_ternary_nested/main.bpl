import [printf] from "std/c.bpl";

frame main() ret int {
    local x: int = 10;
    local result: string = x > 20 ? "High" : x > 5 ? "Medium" : "Low";
    printf("%s\n", result);
    return 0;
}
