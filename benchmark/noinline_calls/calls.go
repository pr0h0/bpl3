package main

import "fmt"

//go:noinline
func mix(value int, i int) int {
	return ((value * 17) + (i % 1009) + 23) % 1000003
}

func main() {
	iterations := 20000000
	value := 7

	for i := 0; i < iterations; i++ {
		value = mix(value, i)
	}

	fmt.Printf("Call sum: %d\n", value)
}
