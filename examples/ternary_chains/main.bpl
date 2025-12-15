extern printf(fmt: string, ...);
# Simple ternary chains
frame main() ret int {
    local age: int = 25;
    # Simple ternary
    local category: string = age < 18 ? "minor" : "adult";
    printf("Age %d is %s\n", age, category);
    # Chained ternary
    local ticket_price: int = age < 12 ? 5 : age < 65 ? 10 : 7;
    printf("Ticket price: $%d\n", ticket_price);
    # Ternary with expressions
    local x: int = 10;
    local y: int = 20;
    local max_val: int = x > y ? x * 2 : y * 2;
    printf("Max doubled: %d\n", max_val);
    # Nested in function call
    printf("Result: %d\n", x > 5 ? 100 : 50);
    return 0;
}
