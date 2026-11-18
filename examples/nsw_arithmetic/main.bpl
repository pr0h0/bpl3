import printf from "std/c.bpl";

# Signed arithmetic in an @[nsw] function never overflows by promise, so LLVM
# can widen `int` loop indexes instead of sign-extending each one.
@[nsw]
frame eliminate(m: *double, col: *double, n: int) {
    loop (local j: int = 1; j < n; j = j + 1) {
        loop (local k: int = 1; k <= j; k = k + 1) {
            m[(j * 8) + k] = m[(j * 8) + k] - (0.5 * col[k]);
        }
    }
}

# Without the attribute, int arithmetic keeps wrapping in two's complement.
frame hash(values: *int, n: int) ret int {
    local h: int = 2147483647;
    loop (local i: int = 0; i < n; i = i + 1) {
        h = (h * 31) + values[i];
    }
    return h;
}

frame main() ret int {
    local m: double[64];
    local col: double[8];
    loop (local i: int = 0; i < 64; i = i + 1) {
        m[i] = cast<double>(i);
    }
    loop (local i: int = 0; i < 8; i = i + 1) {
        col[i] = cast<double>(i * 2);
    }
    eliminate(&m[0], &col[0], 8);
    printf("row7 %.1f %.1f %.1f\n", m[57], m[60], m[63]);

    local values: int[3] = [1, 2, 3];
    printf("hash %d\n", hash(&values[0], 3));
    return 0;
}
