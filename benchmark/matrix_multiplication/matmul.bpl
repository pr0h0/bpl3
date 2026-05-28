extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;
extern free(ptr: *void);

frame main() ret int {
    local size: int = 300;
    local total_elements: int = size * size;
    local bytes: int = total_elements * 8; # 8 bytes per i64

    local a: *i64 = cast<*i64>(malloc(bytes));
    local b: *i64 = cast<*i64>(malloc(bytes));
    local c: *i64 = cast<*i64>(malloc(bytes));

    # Initialize matrices
    local i: int = 0;
    loop (i < size) {
        local j: int = 0;
        loop (j < size) {
            local idx: int = (i * size) + j;
            *(a + idx) = cast<i64>(i + j);
            *(b + idx) = cast<i64>(i - j);
            j = j + 1;
        }
        i = i + 1;
    }

    # Multiply: C = A * B
    i = 0;
    loop (i < size) {
        local j: int = 0;
        loop (j < size) {
            local sum: i64 = 0;
            local k: int = 0;
            loop (k < size) {
                # sum += a[i][k] * b[k][j];
                sum = sum + (*(a + ((i * size) + k)) * *(b + ((k * size) + j)));
                k = k + 1;
            }
            *(c + ((i * size) + j)) = sum;
            j = j + 1;
        }
        i = i + 1;
    }

    # Verify (sum of all elements in C)
    local result_sum: i64 = 0;
    i = 0;
    loop (i < total_elements) {
        result_sum = result_sum + *(c + i);
        i = i + 1;
    }

    printf("Matrix %dx%d sum: %ld\n", size, size, result_sum);

    free(cast<*void>(a));
    free(cast<*void>(b));
    free(cast<*void>(c));

    return 0;
}
