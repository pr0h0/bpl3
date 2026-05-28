package main

import "fmt"

func mandelbrot(width int, height int, maxIter int) int {
	inside := 0

	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			cr := (float64(x)/float64(width))*3.5 - 2.5
			ci := (float64(y)/float64(height))*2.0 - 1.0
			zr := 0.0
			zi := 0.0
			iter := 0

			for ((zr*zr)+(zi*zi)) <= 4.0 && iter < maxIter {
				nextZr := ((zr * zr) - (zi * zi)) + cr
				zi = ((2.0 * zr) * zi) + ci
				zr = nextZr
				iter++
			}

			if iter == maxIter {
				inside++
			}
		}
	}

	return inside
}

func main() {
	points := mandelbrot(800, 600, 80)
	fmt.Printf("Mandelbrot points: %d\n", points)
}
