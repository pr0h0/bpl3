package main

import "fmt"

func main() {
	count := 6000000
	a := make([]int64, count)
	b := make([]int64, count)

	for i := 0; i < count; i++ {
		a[i] = int64((i % 97) - 48)
		b[i] = int64((i % 89) - 44)
	}

	var sum int64 = 0
	for i := 0; i < count; i++ {
		sum += a[i] * b[i]
	}

	fmt.Printf("Vector dot: %d\n", sum)
}
