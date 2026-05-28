extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;
extern free(ptr: *void);

frame main() ret int {
    local limit: int = 10000000;
    local size: int = limit + 1;
    # Allocate one byte per flag.
    local is_prime: *u8 = cast<*u8>(malloc(size));

    # Initialize
    local i: int = 0;
    loop (i < size) {
        *(is_prime + i) = cast<u8>(1);
        i = i + 1;
    }

    *(is_prime + 0) = cast<u8>(0);
    *(is_prime + 1) = cast<u8>(0);

    local p: int = 2;
    loop ((p * p) <= limit) {
        if (*(is_prime + p) != cast<u8>(0)) {
            local j: int = p * p;
            loop (j <= limit) {
                *(is_prime + j) = cast<u8>(0);
                j = j + p;
            }
        }
        p = p + 1;
    }

    local count: int = 0;
    i = 0;
    loop (i <= limit) {
        if (*(is_prime + i) != cast<u8>(0)) {
            count = count + 1;
        }
        i = i + 1;
    }

    printf("Primes up to %d: %d\n", limit, count);
    free(cast<*void>(is_prime));
    return 0;
}
