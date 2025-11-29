import printf from "libc";

frame get_rnd_u64(min: u64, max: u64) ret u64 {
    local rnd : u64 = 0;
    asm {
        rdrand rax;
        mov (rnd), rax;
    }

    local y : u64 = (rnd % (max - min)) + min;
    call printf("Generated random: %llu - %llu, which should be between %llu and %llu\n", rnd, y, min, max);
    return y;
}

export get_rnd_u64;
