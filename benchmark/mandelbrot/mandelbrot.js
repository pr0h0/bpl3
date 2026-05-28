function mandelbrot(width, height, maxIter) {
  let inside = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cr = (x / width) * 3.5 - 2.5;
      const ci = (y / height) * 2.0 - 1.0;
      let zr = 0.0;
      let zi = 0.0;
      let iter = 0;

      while ((zr * zr) + (zi * zi) <= 4.0 && iter < maxIter) {
        const nextZr = ((zr * zr) - (zi * zi)) + cr;
        zi = ((2.0 * zr) * zi) + ci;
        zr = nextZr;
        iter++;
      }

      if (iter === maxIter) {
        inside++;
      }
    }
  }

  return inside;
}

console.log(`Mandelbrot points: ${mandelbrot(800, 600, 80)}`);
