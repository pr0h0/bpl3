#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

int main() {
    int count = 6000000;
    int64_t* a = (int64_t*)malloc((size_t)count * sizeof(int64_t));
    int64_t* b = (int64_t*)malloc((size_t)count * sizeof(int64_t));

    for (int i = 0; i < count; i++) {
        a[i] = (int64_t)((i % 97) - 48);
        b[i] = (int64_t)((i % 89) - 44);
    }

    int64_t sum = 0;
    for (int i = 0; i < count; i++) {
        sum += a[i] * b[i];
    }

    printf("Vector dot: %lld\n", (long long)sum);
    free(a);
    free(b);
    return 0;
}
