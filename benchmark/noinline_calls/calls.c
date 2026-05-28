#include <stdio.h>

__attribute__((noinline)) static int mix(int value, int i) {
    return ((value * 17) + (i % 1009) + 23) % 1000003;
}

int main() {
    int iterations = 20000000;
    int value = 7;

    for (int i = 0; i < iterations; i++) {
        value = mix(value, i);
    }

    printf("Call sum: %d\n", value);
    return 0;
}
