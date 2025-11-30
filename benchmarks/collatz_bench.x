import printf from "libc";

frame collatz_length(n: u64) ret u64 {
    local count: u64 = 1;
    loop {
        if n <= 1 { break; }
        if (n % 2) == 0 {
            n = n / 2;
        } else {
            n = 3 * n + 1;
        }
        count = count + 1;
    }
    return count;
}

frame main() ret u64 {
    local limit: u64 = 100000; 
    local max_len: u64 = 0;
    local max_n: u64 = 0;
    local i: u64 = 1;
    local len: u64 = 0;

    call printf("Finding longest Collatz chain under %d...\n", limit);

    loop {
        if i >= limit { break; }
        len = call collatz_length(i);
        if len > max_len {
            max_len = len;
            max_n = i;
        }
        i = i + 1;
    }

    call printf("Longest chain: %d (length %d)\n", max_n, max_len);
    return 0;
}
