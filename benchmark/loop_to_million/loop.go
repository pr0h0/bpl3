package main

import "fmt"

func main() {
	sum := 0
	iterations := 20000000

	for i := 0; i < iterations; i++ {
		sum = ((sum * 3) + i) % 1000003
	}

	fmt.Printf("Loop sum: %d\n", sum)
}
