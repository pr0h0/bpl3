def mandelbrot(width, height, max_iter):
    inside = 0

    for y in range(height):
        for x in range(width):
            cr = (x / width) * 3.5 - 2.5
            ci = (y / height) * 2.0 - 1.0
            zr = 0.0
            zi = 0.0
            iteration = 0

            while ((zr * zr) + (zi * zi)) <= 4.0 and iteration < max_iter:
                next_zr = ((zr * zr) - (zi * zi)) + cr
                zi = ((2.0 * zr) * zi) + ci
                zr = next_zr
                iteration += 1

            if iteration == max_iter:
                inside += 1

    return inside


if __name__ == "__main__":
    print(f"Mandelbrot points: {mandelbrot(800, 600, 80)}")
