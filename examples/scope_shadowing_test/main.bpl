extern printf(fmt: string, ...);

global g_val: int = 100;

frame testGlobalShadowing() {
    printf("Global g_val: %d\n", g_val);
    local g_val: int = 200;
    printf("Shadowed g_val: %d\n", g_val);
    g_val = 201;
    printf("Modified shadowed g_val: %d\n", g_val);
}

frame testBlockShadowing() {
    local x: int = 10;
    printf("Outer x: %d\n", x);

    {
        local x: int = 20;
        printf("Inner x: %d\n", x);
        x = 21;
        printf("Modified inner x: %d\n", x);
    }

    printf("Outer x after block: %d\n", x);
}

frame testLoopShadowing() {
    local i: int = 0;
    printf("Outer i: %d\n", i);

    loop (i < 3) {
        local i: int = 100 + i; # Shadowing loop variable inside loop body? 
        # Note: In C-like languages, loop condition uses outer 'i', body uses inner 'i'.
        # But here 'i' in condition refers to outer 'i'.
        # If we declare 'local i' inside, it shadows outer 'i' for the rest of the block.
        # But the increment of outer 'i' usually happens at end of loop or manually.

        printf("Inner i: %d\n", i);

        # We need to increment outer 'i' to avoid infinite loop if we rely on it.
        # But we can't access outer 'i' here because it's shadowed!
        # So this pattern is dangerous if we need to update the loop counter.
        # Let's use a different loop counter for the loop control to be safe.
        break;
    }
}

frame testLoopShadowingSafe() {
    local x: int = 10;
    local i: int = 0;

    loop (i < 2) {
        printf("Loop start, outer x: %d\n", x);
        local x: int = 20 + i;
        printf("Loop inner x: %d\n", x);
        x = x + 1;
        printf("Loop inner x modified: %d\n", x);
        i = i + 1;
    }
    printf("Loop end, outer x: %d\n", x);
}

frame testParamShadowing(p: int) {
    printf("Param p: %d\n", p);
    {
        local p: int = 50;
        printf("Shadowed p: %d\n", p);
    }
}

frame testDeepNesting() {
    local x: int = 1;
    printf("Level 1: %d\n", x);
    {
        local x: int = 2;
        printf("Level 2: %d\n", x);
        {
            local x: int = 3;
            printf("Level 3: %d\n", x);
        }
        printf("Level 2 again: %d\n", x);
    }
    printf("Level 1 again: %d\n", x);
}

frame testTypeShadowing() {
    local x: int = 10;
    printf("Int x: %d\n", x);
    {
        local x: string = "shadow";
        printf("String x: %s\n", x);
    }
    printf("Int x again: %d\n", x);
}

frame main() ret int {
    printf("=== Global Shadowing ===\n");
    testGlobalShadowing();
    printf("Global g_val after function: %d\n", g_val);

    printf("\n=== Block Shadowing ===\n");
    testBlockShadowing();

    printf("\n=== Loop Shadowing ===\n");
    testLoopShadowingSafe();

    printf("\n=== Param Shadowing ===\n");
    testParamShadowing(5);

    printf("\n=== Deep Nesting ===\n");
    testDeepNesting();

    printf("\n=== Type Shadowing ===\n");
    testTypeShadowing();

    return 0;
}
