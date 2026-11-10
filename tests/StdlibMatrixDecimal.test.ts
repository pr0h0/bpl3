import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("solves linear systems and rounds fixed-point decimals", () => {
  expectCorrectnessSuite([
    {
      name: "matrix and decimal",
      validateLlvm: true,
      expectedStdout:
        "solve\n[2.000]\n[3.000]\n[-1.000]\ndet -1.000 trace 3.0 rank 3\ninverse ok T\ninverse\n[4.000, 3.000, -1.000]\n[-2.000, -2.000, 1.000]\n[5.000, 4.000, -1.000]\nw*wt\n[14.000, 32.000]\n[32.000, 77.000]\nsum\n[2.000, 4.000, 6.000]\n[8.000, 10.000, 12.000]\nscaled\n[0.500, 1.000, 1.500]\n[2.000, 2.500, 3.000]\nhadamard\n[1.000, 4.000, 9.000]\n[16.000, 25.000, 36.000]\ndiff\n[0.000, 0.000, 0.000]\n[0.000, 0.000, 0.000]\nnorm 9.5394 rank 2\nsingular det 0.0 rank 1\nerror Matrix is singular\nerror Matrix dimensions do not match for multiplication\ntotal 59.97\ntax raw 4.947525\ntax 4.95\nsum 64.92\n10/3 3.3333\nround 2.5: 2 3 2 3 2 3\nround 3.5: 4 4 3 4 3 4\nround -2.5: -2 -3 -2 -3 -3 -2\nround -2.4: -2 -2 -2 -3 -3 -2\nallocate 33.34 33.33 33.33\ncompare 0 -1 1 zero T neg T\nnormalize 1.5\nsmall -0.05\nfloat 2.68\ntoFloat 12.3456 parse bad none none none\nerror Decimal overflow\nerror Decimal division by zero\n",
      source: `import [Matrix] from "std/matrix.bpl";
import [Decimal], DECIMAL_ROUND_HALF_EVEN, DECIMAL_ROUND_HALF_UP, DECIMAL_ROUND_DOWN, DECIMAL_ROUND_UP, DECIMAL_ROUND_FLOOR, DECIMAL_ROUND_CEILING from "std/decimal.bpl";
import [String] from "std/string.bpl";
import [Option] from "std/option.bpl";
extern printf(fmt: string, ...);
frame showM(label: string, m: Matrix) {
    local text: String = m.toString(3);
    printf("%s\\n%s", label, text.cstr());
    text.destroy();
    local copy: Matrix = m;
    copy.destroy();
}
frame showD(label: string, d: Decimal) {
    local text: String = d.toString();
    printf("%s %s\\n", label, text.cstr());
    text.destroy();
}
frame dec(text: string) ret Decimal { return Decimal.parse(text).unwrap(); }
frame main() ret int {
    local values: float[9] = [2.0, 1.0, -1.0, -3.0, -1.0, 2.0, -2.0, 1.0, 2.0];
    local a: Matrix = Matrix.fromValues(3, 3, &values[0]);
    local rhsValues: float[3] = [8.0, -11.0, -3.0];
    local rhs: Matrix = Matrix.fromValues(3, 1, &rhsValues[0]);
    showM("solve", a.solve(&rhs));
    printf("det %.3f trace %.1f rank %d\\n", a.determinant(), a.trace(), a.rank());
    local inv: Matrix = a.inverse();
    local product: Matrix = a.multiply(&inv);
    local id: Matrix = Matrix.identity(3);
    printf("inverse ok %s\\n", product.approxEquals(&id, 0.000000001) ? "T" : "F");
    showM("inverse", inv);
    local wide: float[6] = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
    local w: Matrix = Matrix.fromValues(2, 3, &wide[0]);
    local wt: Matrix = w.transpose();
    showM("w*wt", w.multiply(&wt));
    showM("sum", w.add(&w));
    showM("scaled", w.scale(0.5));
    showM("hadamard", w.hadamard(&w));
    showM("diff", w.subtract(&w));
    printf("norm %.4f rank %d\\n", w.norm(), w.rank());
    local singularValues: float[4] = [1.0, 2.0, 2.0, 4.0];
    local singular: Matrix = Matrix.fromValues(2, 2, &singularValues[0]);
    printf("singular det %.1f rank %d\\n", singular.determinant(), singular.rank());
    try { singular.inverse(); } catch (m: string) { printf("error %s\\n", m); }
    try { w.multiply(&w); } catch (m: string) { printf("error %s\\n", m); }
    local price: Decimal = dec("19.99");
    local qty: Decimal = Decimal.fromLong(cast<long>(3));
    local total: Decimal = price.multiply(&qty);
    showD("total", total);
    local rate: Decimal = dec("0.0825");
    local taxed: Decimal = total.multiply(&rate);
    showD("tax raw", taxed);
    showD("tax", taxed.round(2));
    local sum: Decimal = total.add(&taxed);
    showD("sum", sum.round(2));
    local third: Decimal = Decimal.fromLong(cast<long>(10)).divide(&qty, 4, DECIMAL_ROUND_HALF_EVEN);
    showD("10/3", third);
    local modes: int[6] = [DECIMAL_ROUND_HALF_EVEN, DECIMAL_ROUND_HALF_UP, DECIMAL_ROUND_DOWN, DECIMAL_ROUND_UP, DECIMAL_ROUND_FLOOR, DECIMAL_ROUND_CEILING];
    local samples: string[4] = ["2.5", "3.5", "-2.5", "-2.4"];
    loop (local s: int = 0; s < 4; s = s + 1) {
        local v: Decimal = dec(samples[s]);
        printf("round %s:", samples[s]);
        loop (local m: int = 0; m < 6; m = m + 1) {
            local r: Decimal = v.rescale(0, modes[m]);
            printf(" %ld", r.units);
        }
        printf("\\n");
    }
    local hundred: Decimal = dec("100.00");
    printf("allocate");
    loop (local i: int = 0; i < 3; i = i + 1) {
        local part: Decimal = hundred.allocate(3, i);
        local text: String = part.toString();
        printf(" %s", text.cstr());
        text.destroy();
    }
    printf("\\n");
    local x: Decimal = dec("1.50");
    local y: Decimal = dec("1.5");
    printf("compare %d %d %d zero %s neg %s\\n", x.compare(&y), x.compare(&price), price.compare(&x), Decimal.zero().isZero() ? "T" : "F", dec("-0.01").isNegative() ? "T" : "F");
    showD("normalize", dec("1.500").normalize());
    showD("small", dec("-.05"));
    showD("float", Decimal.fromFloat(2.675, 2));
    printf("toFloat %.4f parse bad %s %s %s\\n", dec("12.3456").toFloat(), Decimal.parse("1.2.3").isNone() ? "none" : "some", Decimal.parse("").isNone() ? "none" : "some", Decimal.parse("abc").isNone() ? "none" : "some");
    try { dec("9223372036854775807").multiplyLong(cast<long>(2)); } catch (m: string) { printf("error %s\\n", m); }
    local nothing: Decimal = Decimal.zero();
    try { price.divide(&nothing, 2, DECIMAL_ROUND_HALF_UP); } catch (m: string) { printf("error %s\\n", m); }
    return 0;
}
`,
    },
  ]);
}, 120000);
