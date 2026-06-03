#include <stdint.h>
#include <stdio.h>

int main(void) {
    int64_t iterations = 8000000;
    int64_t numerator = 123456789;
    int64_t sum = 0;

    for (int64_t i = 0; i < iterations; i++) {
        int64_t denom = (i % 997) + 1;
        sum += (numerator / denom) + (numerator % denom);
    }

    printf("Constant numerator: %ld\n", (long)sum);
    return 0;
}
