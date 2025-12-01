import printf from "libc";

frame main() ret u64 {
    call printf("--- Control Flow ---\n");

    local i: u64 = 0;
    loop {
        if i >= 3 {
            break;
        }
        call printf("Outer loop i=%ld\n", i);

        local j: u64 = 0;
        loop {
            if j >= 3 {
                break;
            }

            if j == 1 {
                j += 1;
                continue;
            }

            call printf("  Inner loop j=%ld\n", j);
            j += 1;
        }
        i += 1;
    }

    return 0;
}
