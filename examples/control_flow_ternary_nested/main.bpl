extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 10;
    local result: string = x > 20 ? "High" : x > 5 ? "Medium" : "Low";
    printf("%s\n", result);
    return 0;
}
