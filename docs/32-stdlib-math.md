# Standard Library: Math

The `Math` struct provides common mathematical functions for both integers and floating-point numbers.

## Import

```bpl
import [Math] from "std/math.bpl";
```

## Constants

```bpl
global const PI: float = 3.14159265358979323846;
global const E: float = 2.71828182845904523536;
global const TAU: float = 6.28318530717958647692;
global const SQRT2: float = 1.41421356237309504880;
global const LN2: float = 0.69314718055994530942;
global const LN10: float = 2.30258509299404568402;
```

## Basic Functions (Overloaded for int/float)

| Function                                                 | Description                    |
| -------------------------------------------------------- | ------------------------------ |
| `Math.abs(x: int) ret int`                               | Absolute value of integer      |
| `Math.abs(x: float) ret float`                           | Absolute value of float        |
| `Math.min(a: int, b: int) ret int`                       | Minimum of two integers        |
| `Math.min(a: float, b: float) ret float`                 | Minimum of two floats          |
| `Math.max(a: int, b: int) ret int`                       | Maximum of two integers        |
| `Math.max(a: float, b: float) ret float`                 | Maximum of two floats          |
| `Math.clamp(x: int, min: int, max: int) ret int`         | Clamp integer to range         |
| `Math.clamp(x: float, min: float, max: float) ret float` | Clamp float to range           |
| `Math.sign(x: int) ret int`                              | Sign of integer (-1, 0, 1)     |
| `Math.sign(x: float) ret float`                          | Sign of float (-1.0, 0.0, 1.0) |

## Float Functions

| Function                                            | Description           |
| --------------------------------------------------- | --------------------- |
| `Math.sqrt(x: float) ret float`                     | Square root           |
| `Math.pow(x: float, y: float) ret float`            | Power (x^y)           |
| `Math.exp(x: float) ret float`                      | Exponential (e^x)     |
| `Math.log(x: float) ret float`                      | Natural logarithm     |
| `Math.log10(x: float) ret float`                    | Base-10 logarithm     |
| `Math.log2(x: float) ret float`                     | Base-2 logarithm      |
| `Math.floor(x: float) ret float`                    | Round down            |
| `Math.ceil(x: float) ret float`                     | Round up              |
| `Math.round(x: float) ret float`                    | Round to nearest      |
| `Math.copysign(x: float, y: float) ret float`       | Copy sign of y to x   |
| `Math.mod(x: float, y: float) ret float`            | Floating-point modulo |
| `Math.lerp(a: float, b: float, t: float) ret float` | Linear interpolation  |

## Trigonometric Functions

| Function                                   | Description              |
| ------------------------------------------ | ------------------------ |
| `Math.sin(x: float) ret float`             | Sine                     |
| `Math.cos(x: float) ret float`             | Cosine                   |
| `Math.tan(x: float) ret float`             | Tangent                  |
| `Math.asin(x: float) ret float`            | Arc sine                 |
| `Math.acos(x: float) ret float`            | Arc cosine               |
| `Math.atan(x: float) ret float`            | Arc tangent              |
| `Math.atan2(y: float, x: float) ret float` | Two-argument arc tangent |

## Angle Conversion

| Function                              | Description        |
| ------------------------------------- | ------------------ |
| `Math.degToRad(deg: float) ret float` | Degrees to radians |
| `Math.radToDeg(rad: float) ret float` | Radians to degrees |

## Integer Utilities

| Function                              | Description             |
| ------------------------------------- | ----------------------- |
| `Math.gcd(a: int, b: int) ret int`    | Greatest common divisor |
| `Math.lcm(a: int, b: int) ret int`    | Least common multiple   |
| `Math.factorial(n: int) ret long`     | Factorial (n!)          |
| `Math.fibonacci(n: int) ret long`     | Fibonacci number        |
| `Math.isPowerOfTwo(x: int) ret bool`  | Check if power of two   |
| `Math.nextPowerOfTwo(x: int) ret int` | Next power of two       |
| `Math.isEven(x: int) ret bool`        | Check if even           |
| `Math.isOdd(x: int) ret bool`         | Check if odd            |

## Example

```bpl
import [Math] from "std/math.bpl";
extern printf(fmt: string, ...);

frame main() {
    # Basic operations
    printf("abs(-5) = %d\n", Math.abs(-5));
    printf("abs(-3.14) = %f\n", Math.abs(-3.14));
    printf("min(10, 20) = %d\n", Math.min(10, 20));
    printf("max(10.5, 20.5) = %f\n", Math.max(10.5, 20.5));
    printf("clamp(15, 0, 10) = %d\n", Math.clamp(15, 0, 10));

    # Trigonometry
    printf("sin(PI/2) = %f\n", Math.sin(PI / 2.0));
    printf("cos(0) = %f\n", Math.cos(0.0));

    # Other functions
    printf("sqrt(16) = %f\n", Math.sqrt(16.0));
    printf("pow(2, 8) = %f\n", Math.pow(2.0, 8.0));
    printf("gcd(48, 18) = %d\n", Math.gcd(48, 18));
    printf("factorial(5) = %ld\n", Math.factorial(5));
}
```
