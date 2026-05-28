#include <stdio.h>

static int mandelbrot(int width, int height, int max_iter) {
    int inside = 0;

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            double cr = ((double)x / (double)width) * 3.5 - 2.5;
            double ci = ((double)y / (double)height) * 2.0 - 1.0;
            double zr = 0.0;
            double zi = 0.0;
            int iter = 0;

            while (((zr * zr) + (zi * zi)) <= 4.0 && iter < max_iter) {
                double next_zr = ((zr * zr) - (zi * zi)) + cr;
                zi = ((2.0 * zr) * zi) + ci;
                zr = next_zr;
                iter++;
            }

            if (iter == max_iter) {
                inside++;
            }
        }
    }

    return inside;
}

int main() {
    int points = mandelbrot(800, 600, 80);
    printf("Mandelbrot points: %d\n", points);
    return 0;
}
