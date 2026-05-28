extern printf(fmt: string, ...);

frame mandelbrot(width: int, height: int, max_iter: int) ret int {
    local inside: int = 0;
    local y: int = 0;

    loop (y < height) {
        local x: int = 0;
        loop (x < width) {
            local cr: double = ((cast<double>(x) / cast<double>(width)) * 3.5) - 2.5;
            local ci: double = ((cast<double>(y) / cast<double>(height)) * 2.0) - 1.0;
            local zr: double = 0.0;
            local zi: double = 0.0;
            local iter: int = 0;

            loop ((((zr * zr) + (zi * zi)) <= 4.0) && (iter < max_iter)) {
                local next_zr: double = ((zr * zr) - (zi * zi)) + cr;
                zi = ((2.0 * zr) * zi) + ci;
                zr = next_zr;
                iter = iter + 1;
            }

            if (iter == max_iter) {
                inside = inside + 1;
            }

            x = x + 1;
        }
        y = y + 1;
    }

    return inside;
}

frame main() ret int {
    local points: int = mandelbrot(800, 600, 80);
    printf("Mandelbrot points: %d\n", points);
    return 0;
}
