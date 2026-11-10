# Special functions used by pricing and statistics.
#
# normCdf uses the West (2005) double-precision version of Hart's algorithm,
# accurate to about 1e-15. invNormCdf uses Acklam's rational approximation
# refined with one Halley step. lgamma uses a Lanczos approximation; the
# incomplete beta and gamma functions use Lentz continued fractions.

import [Math], PI from "std/math.bpl";

export [Special];

global const SQRT_2PI: float = 2.50662827463100050242;
global const INV_SQRT_2PI: float = 0.39894228040143267794;
global const EPS: float = 0.0000000000000002220446;
global const TINY: float = 0.000000000000000000000000000001;

struct Special {
    frame normPdf(x: float) ret float {
        return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
    }

    frame normCdf(x: float) ret float {
        local z: float = Math.abs(x);
        local c: float = 0.0;
        if (z > 37.0) {
            c = 0.0;
        } else {
            local e: float = Math.exp((-z * z) / 2.0);
            if (z < 7.07106781186547) {
                local n: float = (0.0352624965998911 * z) + 0.700383064443688;
                n = (n * z) + 6.37396220353165;
                n = (n * z) + 33.912866078383;
                n = (n * z) + 112.079291497871;
                n = (n * z) + 221.213596169931;
                n = (n * z) + 220.206867912376;
                local d: float = (0.0883883476483184 * z) + 1.75566716318264;
                d = (d * z) + 16.064177579207;
                d = (d * z) + 86.7807322029461;
                d = (d * z) + 296.564248779674;
                d = (d * z) + 637.333633378831;
                d = (d * z) + 793.826512519948;
                d = (d * z) + 440.413735824752;
                c = (e * n) / d;
            } else {
                local f: float = z + 0.65;
                f = z + (4.0 / f);
                f = z + (3.0 / f);
                f = z + (2.0 / f);
                f = z + (1.0 / f);
                c = e / f / 2.506628274631;
            }
        }
        if (x > 0.0) {
            return 1.0 - c;
        }
        return c;
    }

    frame erf(x: float) ret float {
        return (2.0 * Special.normCdf(x * 1.41421356237309504880)) - 1.0;
    }

    frame erfc(x: float) ret float {
        return 2.0 * Special.normCdf(-x * 1.41421356237309504880);
    }

    # Inverse of the standard normal CDF.
    frame invNormCdf(p: float) ret float {
        if (p <= 0.0) {
            return -1.0 / 0.0;
        }
        if (p >= 1.0) {
            return 1.0 / 0.0;
        }
        local a1: float = -39.69683028665376;
        local a2: float = 220.9460984245205;
        local a3: float = -275.9285104469687;
        local a4: float = 138.3577518672690;
        local a5: float = -30.66479806614716;
        local a6: float = 2.506628277459239;
        local b1: float = -54.47609879822406;
        local b2: float = 161.5858368580409;
        local b3: float = -155.6989798598866;
        local b4: float = 66.80131188771972;
        local b5: float = -13.28068155288572;
        local c1: float = -0.007784894002430293;
        local c2: float = -0.3223964580411365;
        local c3: float = -2.400758277161838;
        local c4: float = -2.549732539343734;
        local c5: float = 4.374664141464968;
        local c6: float = 2.938163982698783;
        local d1: float = 0.007784695709041462;
        local d2: float = 0.3224671290700398;
        local d3: float = 2.445134137142996;
        local d4: float = 3.754408661907416;
        local plow: float = 0.02425;
        local x: float = 0.0;
        if (p < plow) {
            local q: float = Math.sqrt(-2.0 * Math.log(p));
            x = ((((((((((c1 * q) + c2) * q) + c3) * q) + c4) * q) + c5) * q) + c6) / ((((((((d1 * q) + d2) * q) + d3) * q) + d4) * q) + 1.0);
        } else if (p <= (1.0 - plow)) {
            local q: float = p - 0.5;
            local r: float = q * q;
            x = (((((((((((a1 * r) + a2) * r) + a3) * r) + a4) * r) + a5) * r) + a6) * q) / ((((((((((b1 * r) + b2) * r) + b3) * r) + b4) * r) + b5) * r) + 1.0);
        } else {
            local q: float = Math.sqrt(-2.0 * Math.log(1.0 - p));
            x = -((((((((((c1 * q) + c2) * q) + c3) * q) + c4) * q) + c5) * q) + c6) / ((((((((d1 * q) + d2) * q) + d3) * q) + d4) * q) + 1.0);
        }
        # One Halley refinement step.
        local e: float = Special.normCdf(x) - p;
        local u: float = e * SQRT_2PI * Math.exp((x * x) / 2.0);
        x = x - (u / (1.0 + ((x * u) / 2.0)));
        return x;
    }

    frame lgamma(x: float) ret float {
        if (x < 0.5) {
            # Reflection formula.
            return Math.log(PI / Math.abs(Math.sin(PI * x))) - Special.lgamma(1.0 - x);
        }
        local g: float = 7.0;
        local coef: float[9] = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 0.0000099843695780195716, 0.00000015056327351493116];
        local xx: float = x - 1.0;
        local a: float = coef[0];
        local t: float = xx + g + 0.5;
        loop (local i: int = 1; i < 9; i = i + 1) {
            a = a + (coef[i] / (xx + cast<float>(i)));
        }
        return (((0.5 * Math.log(2.0 * PI)) + ((xx + 0.5) * Math.log(t))) - t) + Math.log(a);
    }

    frame gamma(x: float) ret float {
        if (x < 0.5) {
            return PI / (Math.sin(PI * x) * Special.gamma(1.0 - x));
        }
        return Math.exp(Special.lgamma(x));
    }

    frame beta(a: float, b: float) ret float {
        return Math.exp((Special.lgamma(a) + Special.lgamma(b)) - Special.lgamma(a + b));
    }

    frame logChoose(n: int, k: int) ret float {
        return Special.lgamma(cast<float>(n + 1)) - Special.lgamma(cast<float>(k + 1)) - Special.lgamma(cast<float>((n - k) + 1));
    }

    # Continued fraction for the regularized incomplete beta function.
    frame betacf(a: float, b: float, x: float) ret float {
        local qab: float = a + b;
        local qap: float = a + 1.0;
        local qam: float = a - 1.0;
        local c: float = 1.0;
        local d: float = 1.0 - ((qab * x) / qap);
        if (Math.abs(d) < TINY) {
            d = TINY;
        }
        d = 1.0 / d;
        local h: float = d;
        loop (local m: int = 1; m <= 300; m = m + 1) {
            local mf: float = cast<float>(m);
            local m2: float = 2.0 * mf;
            local aa: float = (mf * (b - mf) * x) / ((qam + m2) * (a + m2));
            d = 1.0 + (aa * d);
            if (Math.abs(d) < TINY) {
                d = TINY;
            }
            c = 1.0 + (aa / c);
            if (Math.abs(c) < TINY) {
                c = TINY;
            }
            d = 1.0 / d;
            h = h * d * c;
            aa = (-(a + mf) * (qab + mf) * x) / ((a + m2) * (qap + m2));
            d = 1.0 + (aa * d);
            if (Math.abs(d) < TINY) {
                d = TINY;
            }
            c = 1.0 + (aa / c);
            if (Math.abs(c) < TINY) {
                c = TINY;
            }
            d = 1.0 / d;
            local del: float = d * c;
            h = h * del;
            if (Math.abs(del - 1.0) < 0.0000000000001) {
                break;
            }
        }
        return h;
    }

    frame incompleteBeta(a: float, b: float, x: float) ret float {
        if (x <= 0.0) {
            return 0.0;
        }
        if (x >= 1.0) {
            return 1.0;
        }
        local lbt: float = (Special.lgamma(a + b) - Special.lgamma(a) - Special.lgamma(b)) + (a * Math.log(x)) + (b * Math.log(1.0 - x));
        local bt: float = Math.exp(lbt);
        if (x < ((a + 1.0) / (a + b + 2.0))) {
            return (bt * Special.betacf(a, b, x)) / a;
        }
        return 1.0 - ((bt * Special.betacf(b, a, 1.0 - x)) / b);
    }

    # Regularized lower incomplete gamma P(a, x).
    frame incompleteGamma(a: float, x: float) ret float {
        if (x <= 0.0) {
            return 0.0;
        }
        local gln: float = Special.lgamma(a);
        if (x < (a + 1.0)) {
            local ap: float = a;
            local sum: float = 1.0 / a;
            local del: float = sum;
            loop (local n: int = 0; n < 500; n = n + 1) {
                ap = ap + 1.0;
                del = (del * x) / ap;
                sum = sum + del;
                if (Math.abs(del) < (Math.abs(sum) * 0.000000000000001)) {
                    break;
                }
            }
            return sum * Math.exp((-x + (a * Math.log(x))) - gln);
        }
        local b: float = (x + 1.0) - a;
        local c: float = 1.0 / TINY;
        local d: float = 1.0 / b;
        local h: float = d;
        loop (local i: int = 1; i < 500; i = i + 1) {
            local fi: float = cast<float>(i);
            local an: float = -fi * (fi - a);
            b = b + 2.0;
            d = (an * d) + b;
            if (Math.abs(d) < TINY) {
                d = TINY;
            }
            c = b + (an / c);
            if (Math.abs(c) < TINY) {
                c = TINY;
            }
            d = 1.0 / d;
            local del: float = d * c;
            h = h * del;
            if (Math.abs(del - 1.0) < 0.000000000000001) {
                break;
            }
        }
        return 1.0 - (Math.exp((-x + (a * Math.log(x))) - gln) * h);
    }

    frame studentTCdf(t: float, dof: float) ret float {
        local x: float = dof / (dof + (t * t));
        local tail: float = 0.5 * Special.incompleteBeta(dof / 2.0, 0.5, x);
        if (t > 0.0) {
            return 1.0 - tail;
        }
        return tail;
    }

    frame studentTPdf(t: float, dof: float) ret float {
        local lg: float = Special.lgamma((dof + 1.0) / 2.0) - Special.lgamma(dof / 2.0);
        return Math.exp(lg - (0.5 * Math.log(dof * PI)) - (((dof + 1.0) / 2.0) * Math.log(1.0 + ((t * t) / dof))));
    }

    # Inverse Student-t CDF by bisection on the monotone CDF.
    frame studentTInv(p: float, dof: float) ret float {
        local lo: float = -1000.0;
        local hi: float = 1000.0;
        loop (local i: int = 0; i < 200; i = i + 1) {
            local mid: float = 0.5 * (lo + hi);
            if (Special.studentTCdf(mid, dof) < p) {
                lo = mid;
            } else {
                hi = mid;
            }
            if ((hi - lo) < 0.000000000001) {
                break;
            }
        }
        return 0.5 * (lo + hi);
    }

    frame chiSquareCdf(x: float, k: float) ret float {
        return Special.incompleteGamma(k / 2.0, x / 2.0);
    }

    # Bivariate standard normal CDF (Drezner-Wesolowsky with Gauss-Legendre).
    frame bivariateNormCdf(a: float, b: float, rho: float) ret float {
        local x: float[5] = [0.24840615, 0.39233107, 0.21141819, 0.033246660, 0.00082485334];
        local y: float[5] = [0.10024215, 0.48281397, 1.0609498, 1.7797294, 2.6697604];
        local a1: float = a / Math.sqrt(2.0 * (1.0 - (rho * rho)));
        local b1: float = b / Math.sqrt(2.0 * (1.0 - (rho * rho)));
        if ((a <= 0.0) && (b <= 0.0) && (rho <= 0.0)) {
            local sum: float = 0.0;
            loop (local i: int = 0; i < 5; i = i + 1) {
                loop (local j: int = 0; j < 5; j = j + 1) {
                    sum = sum + (x[i] * x[j] * Math.exp((a1 * ((2.0 * y[i]) - a1)) + (b1 * ((2.0 * y[j]) - b1)) + (2.0 * rho * (y[i] - a1) * (y[j] - b1))));
                }
            }
            return (Math.sqrt(1.0 - (rho * rho)) / PI) * sum;
        }
        if ((a <= 0.0) && (b >= 0.0) && (rho >= 0.0)) {
            return Special.normCdf(a) - Special.bivariateNormCdf(a, -b, -rho);
        }
        if ((a >= 0.0) && (b <= 0.0) && (rho >= 0.0)) {
            return Special.normCdf(b) - Special.bivariateNormCdf(-a, b, -rho);
        }
        if ((a >= 0.0) && (b >= 0.0) && (rho <= 0.0)) {
            return ((Special.normCdf(a) + Special.normCdf(b)) - 1.0) + Special.bivariateNormCdf(-a, -b, rho);
        }
        local denom: float = Math.sqrt(((a * a) - (2.0 * rho * a * b)) + (b * b));
        local rho1: float = (((rho * a) - b) * Special.sign(a)) / denom;
        local rho2: float = (((rho * b) - a) * Special.sign(b)) / denom;
        local delta: float = (1.0 - (Special.sign(a) * Special.sign(b))) / 4.0;
        return (Special.bivariateNormCdf(a, 0.0, rho1) + Special.bivariateNormCdf(b, 0.0, rho2)) - delta;
    }

    frame sign(x: float) ret float {
        if (x > 0.0) {
            return 1.0;
        }
        if (x < 0.0) {
            return -1.0;
        }
        return 0.0;
    }

    frame machineEpsilon() ret float {
        return EPS;
    }
}
