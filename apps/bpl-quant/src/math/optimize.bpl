# One-dimensional root finding and minimization, plus Nelder-Mead.
#
# Objective functions are Lambdas so callers can capture model parameters.

import [Math] from "std/math.bpl";
import malloc, free from "std/c.bpl";

export [Optimize];
export [RootResult];
export [MinResult];

struct RootResult {
    x: float,
    fx: float,
    iterations: int,
    converged: bool,
}

struct MinResult {
    x: *float,
    fx: float,
    iterations: int,
    converged: bool,
    n: int,

    frame destroy(this: *MinResult) {
        if (this.x != nullptr) {
            free(cast<*void>(this.x));
            this.x = nullptr;
        }
    }
}

struct Optimize {
    frame bisect(f: Lambda<float>(float), lo0: float, hi0: float, tol: float, max_iter: int) ret RootResult {
        local lo: float = lo0;
        local hi: float = hi0;
        local flo: float = f(lo);
        local fhi: float = f(hi);
        local r: RootResult = RootResult { x: 0.0, fx: 0.0, iterations: 0, converged: false };
        if ((flo * fhi) > 0.0) {
            r.x = Math.abs(flo) < Math.abs(fhi) ? lo : hi;
            r.fx = Math.abs(flo) < Math.abs(fhi) ? flo : fhi;
            return r;
        }
        loop (local i: int = 0; i < max_iter; i = i + 1) {
            local mid: float = 0.5 * (lo + hi);
            local fm: float = f(mid);
            r.iterations = i + 1;
            if ((Math.abs(fm) < tol) || ((hi - lo) < tol)) {
                r.x = mid;
                r.fx = fm;
                r.converged = true;
                return r;
            }
            if ((fm * flo) < 0.0) {
                hi = mid;
                fhi = fm;
            } else {
                lo = mid;
                flo = fm;
            }
        }
        r.x = 0.5 * (lo + hi);
        r.fx = f(r.x);
        return r;
    }

    # Brent's method (inverse quadratic interpolation with bisection safety).
    frame brent(f: Lambda<float>(float), a0: float, b0: float, tol: float, max_iter: int) ret RootResult {
        local a: float = a0;
        local b: float = b0;
        local fa: float = f(a);
        local fb: float = f(b);
        local r: RootResult = RootResult { x: b, fx: fb, iterations: 0, converged: false };
        if ((fa * fb) > 0.0) {
            return r;
        }
        if (Math.abs(fa) < Math.abs(fb)) {
            local t: float = a;
            a = b;
            b = t;
            local tf: float = fa;
            fa = fb;
            fb = tf;
        }
        local c: float = a;
        local fc: float = fa;
        local mflag: bool = true;
        local d: float = 0.0;
        loop (local i: int = 0; i < max_iter; i = i + 1) {
            r.iterations = i + 1;
            if ((fb == 0.0) || (Math.abs(b - a) < tol)) {
                r.x = b;
                r.fx = fb;
                r.converged = true;
                return r;
            }
            local s: float = 0.0;
            if ((fa != fc) && (fb != fc)) {
                s = ((a * fb * fc) / ((fa - fb) * (fa - fc))) + ((b * fa * fc) / ((fb - fa) * (fb - fc))) + ((c * fa * fb) / ((fc - fa) * (fc - fb)));
            } else {
                s = b - ((fb * (b - a)) / (fb - fa));
            }
            local q: float = ((3.0 * a) + b) / 4.0;
            local cond1: bool = !(((s > q) && (s < b)) || ((s < q) && (s > b)));
            local cond2: bool = mflag && (Math.abs(s - b) >= (Math.abs(b - c) / 2.0));
            local cond3: bool = !mflag && (Math.abs(s - b) >= (Math.abs(c - d) / 2.0));
            local cond4: bool = mflag && (Math.abs(b - c) < tol);
            local cond5: bool = !mflag && (Math.abs(c - d) < tol);
            if (cond1 || cond2 || cond3 || cond4 || cond5) {
                s = (a + b) / 2.0;
                mflag = true;
            } else {
                mflag = false;
            }
            local fs: float = f(s);
            d = c;
            c = b;
            fc = fb;
            if ((fa * fs) < 0.0) {
                b = s;
                fb = fs;
            } else {
                a = s;
                fa = fs;
            }
            if (Math.abs(fa) < Math.abs(fb)) {
                local t2: float = a;
                a = b;
                b = t2;
                local tf2: float = fa;
                fa = fb;
                fb = tf2;
            }
        }
        r.x = b;
        r.fx = fb;
        return r;
    }

    frame newton(f: Lambda<float>(float), df: Lambda<float>(float), x0: float, tol: float, max_iter: int) ret RootResult {
        local x: float = x0;
        local r: RootResult = RootResult { x: x0, fx: 0.0, iterations: 0, converged: false };
        loop (local i: int = 0; i < max_iter; i = i + 1) {
            local fx: float = f(x);
            r.iterations = i + 1;
            r.x = x;
            r.fx = fx;
            if (Math.abs(fx) < tol) {
                r.converged = true;
                return r;
            }
            local d: float = df(x);
            if ((d == 0.0) || Math.isNan(d)) {
                return r;
            }
            x = x - (fx / d);
        }
        r.x = x;
        r.fx = f(x);
        r.converged = Math.abs(r.fx) < tol;
        return r;
    }

    frame goldenSection(f: Lambda<float>(float), a0: float, b0: float, tol: float) ret RootResult {
        local gr: float = 0.6180339887498949;
        local a: float = a0;
        local b: float = b0;
        local c: float = b - (gr * (b - a));
        local d: float = a + (gr * (b - a));
        local fc: float = f(c);
        local fd: float = f(d);
        local it: int = 0;
        loop ((Math.abs(b - a) > tol) && (it < 500)) {
            if (fc < fd) {
                b = d;
                d = c;
                fd = fc;
                c = b - (gr * (b - a));
                fc = f(c);
            } else {
                a = c;
                c = d;
                fc = fd;
                d = a + (gr * (b - a));
                fd = f(d);
            }
            it = it + 1;
        }
        local x: float = (a + b) / 2.0;
        return RootResult { x: x, fx: f(x), iterations: it, converged: it < 500 };
    }

    # Nelder-Mead simplex minimization in n dimensions.
    frame nelderMead(f: Lambda<float>(*float), start: *float, n: int, step: float, tol: float, max_iter: int) ret MinResult {
        local m: int = n + 1;
        local pts: *float = cast<*float>(malloc(cast<long>(m * n) * sizeof(float)));
        local vals: *float = cast<*float>(malloc(cast<long>(m) * sizeof(float)));
        local centroid: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local xr: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local xe: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local xc: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < m; i = i + 1) {
            loop (local j: int = 0; j < n; j = j + 1) {
                pts[(i * n) + j] = start[j];
            }
            if (i > 0) {
                pts[(i * n) + (i - 1)] = pts[(i * n) + (i - 1)] + step;
            }
            vals[i] = f(pts + (i * n));
        }
        local res: MinResult;
        res.n = n;
        res.converged = false;
        res.iterations = 0;
        loop (local it: int = 0; it < max_iter; it = it + 1) {
            res.iterations = it + 1;
            # Order the simplex by value (insertion sort on rows).
            loop (local i: int = 1; i < m; i = i + 1) {
                local j: int = i;
                loop ((j > 0) && (vals[j] < vals[j - 1])) {
                    local tv: float = vals[j];
                    vals[j] = vals[j - 1];
                    vals[j - 1] = tv;
                    loop (local k: int = 0; k < n; k = k + 1) {
                        local tp: float = pts[(j * n) + k];
                        pts[(j * n) + k] = pts[((j - 1) * n) + k];
                        pts[((j - 1) * n) + k] = tp;
                    }
                    j = j - 1;
                }
            }
            if (Math.abs(vals[m - 1] - vals[0]) < tol) {
                res.converged = true;
                break;
            }
            loop (local k: int = 0; k < n; k = k + 1) {
                local s: float = 0.0;
                loop (local i: int = 0; i < n; i = i + 1) {
                    s = s + pts[(i * n) + k];
                }
                centroid[k] = s / cast<float>(n);
            }
            local worst: *float = pts + ((m - 1) * n);
            loop (local k: int = 0; k < n; k = k + 1) {
                xr[k] = centroid[k] + (centroid[k] - worst[k]);
            }
            local fr: float = f(xr);
            if (fr < vals[0]) {
                loop (local k: int = 0; k < n; k = k + 1) {
                    xe[k] = centroid[k] + (2.0 * (centroid[k] - worst[k]));
                }
                local fe: float = f(xe);
                if (fe < fr) {
                    loop (local k: int = 0; k < n; k = k + 1) {
                        worst[k] = xe[k];
                    }
                    vals[m - 1] = fe;
                } else {
                    loop (local k: int = 0; k < n; k = k + 1) {
                        worst[k] = xr[k];
                    }
                    vals[m - 1] = fr;
                }
            } else if (fr < vals[m - 2]) {
                loop (local k: int = 0; k < n; k = k + 1) {
                    worst[k] = xr[k];
                }
                vals[m - 1] = fr;
            } else {
                loop (local k: int = 0; k < n; k = k + 1) {
                    xc[k] = centroid[k] + (0.5 * (worst[k] - centroid[k]));
                }
                local fcv: float = f(xc);
                if (fcv < vals[m - 1]) {
                    loop (local k: int = 0; k < n; k = k + 1) {
                        worst[k] = xc[k];
                    }
                    vals[m - 1] = fcv;
                } else {
                    # Shrink toward the best point.
                    loop (local i: int = 1; i < m; i = i + 1) {
                        loop (local k: int = 0; k < n; k = k + 1) {
                            pts[(i * n) + k] = pts[k] + (0.5 * (pts[(i * n) + k] - pts[k]));
                        }
                        vals[i] = f(pts + (i * n));
                    }
                }
            }
        }
        res.x = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local k: int = 0; k < n; k = k + 1) {
            res.x[k] = pts[k];
        }
        res.fx = vals[0];
        free(cast<*void>(pts));
        free(cast<*void>(vals));
        free(cast<*void>(centroid));
        free(cast<*void>(xr));
        free(cast<*void>(xe));
        free(cast<*void>(xc));
        return res;
    }

    # Composite Simpson integration on [a, b] with an even number of panels.
    frame simpson(f: Lambda<float>(float), a: float, b: float, panels: int) ret float {
        local n: int = panels;
        if ((n % 2) == 1) {
            n = n + 1;
        }
        local h: float = (b - a) / cast<float>(n);
        local s: float = f(a) + f(b);
        loop (local i: int = 1; i < n; i = i + 1) {
            local x: float = a + (h * cast<float>(i));
            s = s + (((i % 2) == 1 ? 4.0 : 2.0) * f(x));
        }
        return (s * h) / 3.0;
    }

    # 20-point Gauss-Legendre quadrature on [a, b].
    frame gaussLegendre(f: Lambda<float>(float), a: float, b: float) ret float {
        local x: float[10] = [0.0765265211334973, 0.2277858511416451, 0.3737060887154195, 0.5108670019508271, 0.6360536807265150, 0.7463319064601508, 0.8391169718222188, 0.9122344282513259, 0.9639719272779138, 0.9931285991850949];
        local w: float[10] = [0.1527533871307258, 0.1491729864726037, 0.1420961093183820, 0.1316886384491766, 0.1181945319615184, 0.1019301198172404, 0.0832767415767048, 0.0626720483341091, 0.0406014298003869, 0.0176140071391521];
        local mid: float = 0.5 * (a + b);
        local half: float = 0.5 * (b - a);
        local s: float = 0.0;
        loop (local i: int = 0; i < 10; i = i + 1) {
            s = s + (w[i] * (f(mid + (half * x[i])) + f(mid - (half * x[i]))));
        }
        return s * half;
    }
}
