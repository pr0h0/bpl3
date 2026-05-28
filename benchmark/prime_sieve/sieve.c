#include <stdio.h>
#include <stdlib.h>

int main() {
    int limit = 10000000;
    int size = limit + 1;
    unsigned char* is_prime = (unsigned char*)malloc(size);
    
    for (int i = 0; i < size; i++) is_prime[i] = 1;
    
    is_prime[0] = 0;
    is_prime[1] = 0;
    
    for (int p = 2; p * p <= limit; p++) {
        if (is_prime[p]) {
            for (int j = p * p; j <= limit; j += p)
                is_prime[j] = 0;
        }
    }
    
    int count = 0;
    for (int i = 0; i <= limit; i++) {
        if (is_prime[i]) count++;
    }
    
    printf("Primes up to %d: %d\n", limit, count);
    free(is_prime);
    return 0;
}
