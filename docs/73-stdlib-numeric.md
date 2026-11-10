# Matrices and Decimals

## Matrices (`std/matrix.bpl`)

`Matrix` stores doubles in row-major order. Create one with
`Matrix.new(rows, cols)` (zeros), `Matrix.identity(n)` or
`Matrix.fromValues(rows, cols, &values[0])`; read and write entries with
`get`/`set` (checked). Operations return new matrices the caller destroys:
`add`, `subtract`, `scale`, `multiply`, `hadamard` (element-wise), `transpose`,
`clone`, `solve(&rhs)` (any number of right-hand columns), and `inverse`.
`determinant`, `trace`, `rank`, `norm` (Frobenius) and
`approxEquals(&other, tolerance)` return scalars, and `toString(decimals)` a
String.

`determinant`, `solve` and `inverse` use LU decomposition with partial
pivoting. A pivot below `MATRIX_EPSILON` (1e-12) times the largest entry
counts as zero: `determinant` returns 0, while `solve` and `inverse` throw
`"Matrix is singular"`. Shape mismatches throw as well.

```bpl
import [Matrix] from "std/matrix.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local coefficients: float[4] = [2.0, 1.0, 1.0, 3.0];
    local right: float[2] = [3.0, 5.0];
    local a: Matrix = Matrix.fromValues(2, 2, &coefficients[0]);
    local b: Matrix = Matrix.fromValues(2, 1, &right[0]);
    local x: Matrix = a.solve(&b);
    printf("x = %.2f, y = %.2f\n", x.get(0, 0), x.get(1, 0)); # x = 0.80, y = 1.40
    x.destroy();
    a.destroy();
    b.destroy();
    return 0;
}
```

## Fixed-point decimals (`std/decimal.bpl`)

`Decimal` represents `units / 10^scale` exactly, with a 64-bit `units` and a
scale of 0-18 digits, which suits money. `Decimal.parse("12.340")` keeps the
written scale and returns `None` for malformed text; `Decimal.new(units,
scale)`, `fromLong`, `zero` and `fromFloat(value, scale)` (half-even rounding
of `value * 10^scale` in double precision) build values. `add`, `subtract`,
`negate`, `abs`, `multiply` (scales add) and `multiplyLong` are exact.
`divide(&other, scale, mode)`, `rescale(scale, mode)` and `round(scale)`
(half-even) round with one of `DECIMAL_ROUND_HALF_EVEN`, `HALF_UP`, `DOWN`,
`UP`, `FLOOR` or `CEILING`. `allocate(parts, index)` splits an amount into
parts that differ by at most one unit and sum exactly to it. `compare` and
`equals` ignore scale (`1.50 == 1.5`), `normalize` drops trailing zeros, and
`toString` prints exactly `scale` fractional digits. Overflow throws
`"Decimal overflow"` and division by zero `"Decimal division by zero"`.

```bpl
import [Decimal] from "std/decimal.bpl";
import [String] from "std/string.bpl";
import [Option] from "std/option.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local price: Decimal = Decimal.parse("19.99").unwrap();
    local rate: Decimal = Decimal.parse("0.0825").unwrap();
    local subtotal: Decimal = price.multiplyLong(cast<long>(3));
    local tax: Decimal = subtotal.multiply(&rate);
    local total: Decimal = subtotal.add(&tax);
    local text: String = total.round(2).toString();
    printf("%s\n", text.cstr()); # 64.92
    text.destroy();
    return 0;
}
```

Arbitrary-precision integers are in `std/bigint.bpl` and exact fractions in
`std/rational.bpl`; see the [API reference](48-stdlib-api.md).
