extern printf(fmt: string, ...);
frame testBreakInLoop() {
    printf("Testing break in simple loop:\n");
    local i: int = 0;
    loop (i < 10) {
        if (i == 5) {
            printf("Breaking at i=%d\n", i);
            break;
        }
        printf("i=%d ", i);
        i = i + 1;
    }
    printf("\nLoop ended with i=%d\n", i);
}
frame testBreakInInfiniteLoop() {
    printf("Testing break in infinite loop:\n");
    local counter: int = 0;
    loop {
        printf("%d ", counter);
        counter = counter + 1;
        if (counter >= 5) {
            printf("\nBreaking infinite loop\n");
            break;
        }
    }
}
frame testNestedLoopBreak() {
    printf("Testing break in nested loops:\n");
    local i: int = 0;
    loop (i < 3) {
        local j: int = 0;
        printf("Outer loop i=%d: ", i);
        loop (j < 5) {
            if (j == 3) {
                printf("(break inner) ");
                break;
            }
            printf("j=%d ", j);
            j = j + 1;
        }
        printf("\n");
        i = i + 1;
    }
}
frame testConditionWithBreak() {
    printf("Testing conditional break:\n");
    local sum: int = 0;
    local i: int = 1;
    loop {
        sum = sum + i;
        printf("sum=%d ", sum);
        if (sum > 50) {
            printf("\nSum exceeded 50, breaking\n");
            break;
        }
        i = i + 1;
    }
}
frame findFirstEven() ret int {
    local nums: int[10];
    nums[0] = 1;
    nums[1] = 3;
    nums[2] = 5;
    nums[3] = 7;
    nums[4] = 8;
    nums[5] = 9;
    nums[6] = 11;
    nums[7] = 13;
    nums[8] = 15;
    nums[9] = 17;
    local i: int = 0;
    loop (i < 10) {
        if ((nums[i] % 2) == 0) {
            printf("Found first even number: %d at index %d\n", nums[i], i);
            return nums[i];
        }
        ++i;
    }
    printf("No even number found\n");
    return -1;
}
frame main() ret int {
    printf("++i DOESNT WORK, PLEASE FIX\n");
    testBreakInLoop();
    printf("\n");
    testBreakInInfiniteLoop();
    printf("\n");
    testNestedLoopBreak();
    printf("\n");
    testConditionWithBreak();
    printf("\n");
    local evenNum: int = findFirstEven();
    printf("Returned even number: %d\n", evenNum);
    # Test break with complex condition
    printf("\nTesting break with complex condition:\n");
    local x: int = 0;
    local y: int = 0;
    loop (x < 10) {
        y = 0;
        loop (y < 10) {
            if ((x * y) > 20) {
                printf("Breaking at x=%d, y=%d (product=%d)\n", x, y, x * y);
                break;
            }
            y = y + 1;
        }
        x = x + 1;
        if (x == 5) {
            break;
        }
    }
    return 0;
}
