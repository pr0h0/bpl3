import printf from "libc";

frame main() ret u64 {
    local limit: u64 = 1000000000;
    local sum: u64 = 0;
    local i: u64 = 0;

    call printf("Summing numbers up to %llu...\n", limit);

    loop {
        if i >= limit { break; }
        # Simple arithmetic operations
        sum = sum + i;
        # Add some bitwise ops to make it slightly more complex
        # sum = sum ^ (i & 0xFF); 
        i = i + 1;
    }

    call printf("Sum: %llu\n", sum);
    return 0;
}
