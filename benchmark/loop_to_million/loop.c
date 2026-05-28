#include <stdio.h>

int main() {
    int sum = 0;
    int iterations = 20000000;

    for (int i = 0; i < iterations; i++) {
        sum = ((sum * 3) + i) % 1000003;
    }

    printf("Loop sum: %d\n", sum);
    return 0;
}
