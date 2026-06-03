package main

import "fmt"

func main() {
	var iterations int64 = 8000000
	var numerator int64 = 123456789
	var sum int64 = 0

	for i := int64(0); i < iterations; i++ {
		denom := (i % 997) + 1
		sum += (numerator / denom) + (numerator % denom)
	}

	fmt.Printf("Constant numerator: %d\n", sum)
}
