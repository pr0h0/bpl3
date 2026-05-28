#include <stdint.h>
#include <stdio.h>

int main() {
    int iterations = 20000000;
    uint32_t x = 2463534242u;
    uint32_t sum = 0;

    for (int i = 0; i < iterations; i++) {
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        sum += x & 1023u;
    }

    printf("Bit twiddle: %u %u\n", x, sum);
    return 0;
}
