import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Ordinary rational subtraction broke twice without any test noticing, because
// the suite only checked the boundary values a report had named. This walks a
// grid of every sign combination and asserts the laws the operations have to
// obey, so a change that works for the reported case but not for 1/2 - 1/3
// fails here.
test("rational arithmetic obeys its identities across every sign", () => {
  expectCorrectnessSuite([
    {
      name: "rational-identities",
      validateLlvm: true,
      source: `
      import [Rational] from "std/rational.bpl";
      import printf from "std/c.bpl";

      frame same(a: Rational, b: Rational) ret bool {
        return (a.num == b.num) && (a.den == b.den);
      }

      frame main() ret int {
        local failures: int = 0;
        local checked: int = 0;

        loop (local an: int = -4; an <= 4; an = an + 1) {
          loop (local ad: int = 1; ad <= 4; ad = ad + 1) {
            local a: Rational = Rational.new(cast<long>(an), cast<long>(ad));

            # The constructor must always leave a positive denominator and a
            # fully reduced fraction.
            if (a.den <= cast<long>(0)) { failures = failures + 1; }
            if (Rational.gcd(a.num, a.den) != cast<long>(1)) {
              if (a.num != cast<long>(0)) { failures = failures + 1; }
            }

            loop (local bn: int = -4; bn <= 4; bn = bn + 1) {
              loop (local bd: int = 1; bd <= 4; bd = bd + 1) {
                local b: Rational = Rational.new(cast<long>(bn), cast<long>(bd));
                checked = checked + 1;

                # Addition and subtraction invert each other, in both orders.
                if (!same(a.add(b).sub(b), a)) { failures = failures + 1; }
                if (!same(a.sub(b).add(b), a)) { failures = failures + 1; }

                # Addition and multiplication commute.
                if (!same(a.add(b), b.add(a))) { failures = failures + 1; }
                if (!same(a.mul(b), b.mul(a))) { failures = failures + 1; }

                # Subtracting in the other order negates the result.
                local forward: Rational = a.sub(b);
                local backward: Rational = b.sub(a);
                if (forward.num != -backward.num) { failures = failures + 1; }
                if (forward.den != backward.den) { failures = failures + 1; }

                # Multiplication and division invert each other.
                if (bn != 0) {
                  if (!same(a.mul(b).div(b), a)) { failures = failures + 1; }
                  if (!same(a.div(b).mul(b), a)) { failures = failures + 1; }
                }

                # Ordering agrees with subtraction's sign.
                local order: int = a.compare(&b);
                if ((order < 0) && (forward.num >= cast<long>(0))) {
                  failures = failures + 1;
                }
                if ((order > 0) && (forward.num <= cast<long>(0))) {
                  failures = failures + 1;
                }
                if ((order == 0) && (forward.num != cast<long>(0))) {
                  failures = failures + 1;
                }
              }
            }
          }
        }

        # Spot values, computed independently.
        local half: Rational = Rational.new(1, 2);
        local third: Rational = Rational.new(1, 3);
        local negQuarter: Rational = Rational.new(-1, 4);
        local difference: Rational = half.sub(third);
        local sum: Rational = half.add(third);
        local product: Rational = half.mul(negQuarter);
        local quotient: Rational = half.div(negQuarter);

        printf("%d %d %ld/%ld %ld/%ld %ld/%ld %ld/%ld\\n",
          failures, checked,
          difference.num, difference.den,
          sum.num, sum.den,
          product.num, product.den,
          quotient.num, quotient.den);
        return 0;
      }`,
      // 9 numerators x 4 denominators, squared. 1/2-1/3=1/6, 1/2+1/3=5/6,
      // 1/2*-1/4=-1/8, 1/2 / -1/4 = -2.
      expectedStdout: "0 1296 1/6 5/6 -1/8 -2/1\n",
    },
  ]);
}, 120000);
