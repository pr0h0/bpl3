package main

import "fmt"

func main() {
	limit := 10000000
	size := limit + 1
	isPrime := make([]byte, size)

	for i := 0; i < size; i++ {
		isPrime[i] = 1
	}

	isPrime[0] = 0
	isPrime[1] = 0

	for p := 2; p*p <= limit; p++ {
		if isPrime[p] != 0 {
			for j := p * p; j <= limit; j += p {
				isPrime[j] = 0
			}
		}
	}

	count := 0
	for i := 0; i <= limit; i++ {
		if isPrime[i] != 0 {
			count++
		}
	}

	fmt.Printf("Primes up to %d: %d\n", limit, count)
}
