extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 10;

    if (x > 5) 
        printf("x is greater than 5\n");
    else 
        printf("x is not greater than 5\n");

    if (x < 5) 
        printf("x is less than 5\n");
    else if (x == 10) 
        printf("x is 10\n");
    else 
        printf("x is something else\n");

    local i: int = 0;
    loop (i < 3) 
        printf("i: %d\n", i++);

    loop (local j: int = 0; j < 3; j++) 
        printf("j: %d\n", j);

    return 0;
}
