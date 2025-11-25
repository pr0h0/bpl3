import printf, malloc, free, strcpy, strcat, strcmp, strlen;

frame to_upper(str: *u8) {
    local i: u64 = 0;
    loop {
        if str[i] == 0 {
            break;
        }
        if str[i] >= 'a' && str[i] <= 'z' {
            str[i] = str[i] - 32;
        }
        i = i + 1;
    }
}

frame main() ret u64 {
    call printf("=== String Handling Demo ===\n");

    # 1. String Literal (Pointer to .rodata)
    # This is the most common way. The string data lives in the read-only data section.
    # 'str_ro' is a pointer (*u8) to that location.
    local str_ro: *u8 = "Hello, Read-Only Data!";
    call printf("[1] RO String: %s\n", str_ro);

    # 2. Stack String (Initialized with Literal)
    # This allocates 64 bytes on the stack and copies "Hello, Stack!" into it.
    # This is mutable!
    local stack_str: u8[64] = "Hello, Stack!";
    call printf("[2] Stack String: %s\n", stack_str);

    # We can modify it:
    stack_str[0] = 'h'; # Lowercase 'h'
    stack_str[12] = '?'; 
    call printf("[2] Modified:     %s\n", stack_str);

    # 3. Stack Buffer (Manually populated)
    local buffer: u8[32];
    call strcpy(buffer, "Manual Copy");
    call printf("[3] Manual Copy:  %s\n", buffer);

    # 4. Heap String (Dynamic)
    local heap_str: *u8 = call malloc(128);
    call strcpy(heap_str, "Hello, Heap!");
    call printf("[4] Heap String:  %s\n", heap_str);
    
    # Modify heap string
    heap_str[7] = 'h';
    call printf("[4] Modified:     %s\n", heap_str);
    
    call free(heap_str);

    # 5. Concatenation (using strcat)
    local cat_buf: *u8 = call malloc(128);
    # Initialize first!
    call strcpy(cat_buf, "Part 1"); 
    call strcat(cat_buf, " + Part 2");
    call printf("[5] Concat:       %s\n", cat_buf);
    call free(cat_buf);

    # 6. Comparison (using strcmp)
    local s1: *u8 = "apple";
    local s2: *u8 = "banana";
    local res: i32 = call strcmp(s1, s2);
    
    call printf("[6] Compare:      'apple' vs 'banana' = %d\n", res);
    if res < 0 {
        call printf("    -> 'apple' comes before 'banana'\n");
    }

    # 7. Length (using strlen)
    local len_s: *u8 = "12345";
    local len: u64 = call strlen(len_s);
    call printf("[7] Length:       '%s' is %d chars long\n", len_s, len);

    # 8. Custom Processing (To Uppercase)
    local mixed: u8[32] = "Hello World 123";
    call to_upper(&mixed);
    call printf("[8] To Upper:     %s\n", mixed);

    return 0;
}
