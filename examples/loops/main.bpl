import [printf] from "std/c.bpl";

frame main() ret int {
    printf("--- Loops Test ---\n");

    # 1. Conditional Loop (While Loop)
    printf("Conditional Loop (0 to 4): ");
    local i: int = 0;
    loop (i < 5) {
        printf("%d ", i);
        i = i + 1;
    }
    printf("\n");

    # 2. Infinite Loop with Break
    printf("Infinite Loop with Break (5 to 1): ");
    local j: int = 5;
    loop {
        if (j == 0) {
            break;
        }
        printf("%d ", j);
        j = j - 1;
    }
    printf("\n");

    # 3. Loop with Continue (Print Odd numbers)
    printf("Loop with Continue (Odd numbers < 10): ");
    local k: int = 0;
    loop (k < 10) {
        k = k + 1;
        if ((k % 2) == 0) {
            continue;
        }
        printf("%d ", k);
    }
    printf("\n");

    # 4. Nested Loops (Small Multiplication Table)
    printf("Nested Loops (2x2 Table):\n");
    local row: int = 1;
    loop (row <= 2) {
        local col: int = 1;
        loop (col <= 2) {
            printf("%d x %d = %d\n", row, col, row * col);
            col = col + 1;
        }
        row = row + 1;
    }

    return 0;
}
