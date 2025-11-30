import printf from "libc";

frame is_prime(n: u64) ret u64 {
    if n <= 1 { return 0; }
    if n == 2 { return 1; }
    
    local i: u64 = 2;
    loop {
        if i * i > n { break; }
        if (n % i) == 0 { return 0; }
        i = i + 1;
    }
    return 1;
}

frame main() ret u64 {
    local limit: u64 = 1000000;
    local count: u64 = 0;
    local i: u64 = 0;
    
    call printf("Counting primes up to %d...\n", limit);
    
    loop {
        if i > limit { break; }
        if call is_prime(i) {
            count = count + 1;
        }
        i = i + 1;
    }
    
    call printf("Found %d primes.\n", count);
    return 0;
}
