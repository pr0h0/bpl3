package main

import "fmt"

func main() {
	iterations := 20000000
	var x uint32 = 2463534242
	var sum uint32 = 0

	for i := 0; i < iterations; i++ {
		x ^= x << 13
		x ^= x >> 17
		x ^= x << 5
		sum += x & 1023
	}

	fmt.Printf("Bit twiddle: %d %d\n", x, sum)
}
