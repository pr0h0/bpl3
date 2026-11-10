# Characteristic-function option pricing.
#
# Complex arithmetic, a radix-2 FFT, the Heston model priced by the
# Gil-Pelaez/Lewis integral (with the "little trap" formulation), Carr-Madan
# FFT pricing across a strike grid, and the Variance Gamma model.

import malloc, free from "std/c.bpl";
import [Math], PI from "std/math.bpl";
import [OptionSpec], [OptionKind] from "./black_scholes.bpl";

export [Cx];
export [Fft];
export [CharFn];
export [FourierPricer];
export [HestonModel];
export [VarianceGamma];

struct Cx {
    re: float,
    im: float,

    frame of(re: float, im: float) ret Cx {
        return Cx { re: re, im: im };
    }

    frame real(re: float) ret Cx {
        return Cx { re: re, im: 0.0 };
    }

    frame add(a: Cx, b: Cx) ret Cx {
        return Cx { re: a.re + b.re, im: a.im + b.im };
    }

    frame sub(a: Cx, b: Cx) ret Cx {
        return Cx { re: a.re - b.re, im: a.im - b.im };
    }

    frame mul(a: Cx, b: Cx) ret Cx {
        return Cx { re: (a.re * b.re) - (a.im * b.im), im: (a.re * b.im) + (a.im * b.re) };
    }

    frame scale(a: Cx, k: float) ret Cx {
        return Cx { re: a.re * k, im: a.im * k };
    }

    frame div(a: Cx, b: Cx) ret Cx {
        # Smith's algorithm avoids overflow for large |b|.
        if (Math.abs(b.re) >= Math.abs(b.im)) {
            local r: float = b.im / b.re;
            local d: float = b.re + (b.im * r);
            return Cx { re: (a.re + (a.im * r)) / d, im: (a.im - (a.re * r)) / d };
        }
        local r2: float = b.re / b.im;
        local d2: float = b.im + (b.re * r2);
        return Cx { re: ((a.re * r2) + a.im) / d2, im: ((a.im * r2) - a.re) / d2 };
    }

    frame neg(a: Cx) ret Cx {
        return Cx { re: -a.re, im: -a.im };
    }

    frame abs(a: Cx) ret float {
        return Math.sqrt((a.re * a.re) + (a.im * a.im));
    }

    frame arg(a: Cx) ret float {
        return Math.atan2(a.im, a.re);
    }

    frame exp(a: Cx) ret Cx {
        local m: float = Math.exp(a.re);
        return Cx { re: m * Math.cos(a.im), im: m * Math.sin(a.im) };
    }

    # Principal logarithm.
    frame log(a: Cx) ret Cx {
        return Cx { re: Math.log(Cx.abs(a)), im: Cx.arg(a) };
    }

    # Principal square root.
    frame sqrt(a: Cx) ret Cx {
        local r: float = Cx.abs(a);
        local re: float = Math.sqrt((r + a.re) / 2.0);
        local im: float = Math.sqrt((r - a.re) / 2.0);
        if (a.im < 0.0) {
            im = -im;
        }
        return Cx { re: re, im: im };
    }

    frame pow(a: Cx, p: float) ret Cx {
        if ((a.re == 0.0) && (a.im == 0.0)) {
            return Cx.real(0.0);
        }
        return Cx.exp(Cx.scale(Cx.log(a), p));
    }
}

struct Fft {
    # In-place iterative radix-2 FFT; n must be a power of two. inverse divides by n.
    frame transform(re: *float, im: *float, n: int, inverse: bool) {
        local j: int = 0;
        loop (local i: int = 1; i < n; i = i + 1) {
            local bit: int = n >> 1;
            loop ((j & bit) != 0) {
                j = j ^ bit;
                bit = bit >> 1;
            }
            j = j ^ bit;
            if (i < j) {
                local tr: float = re[i];
                re[i] = re[j];
                re[j] = tr;
                local ti: float = im[i];
                im[i] = im[j];
                im[j] = ti;
            }
        }
        local len: int = 2;
        loop (len <= n) {
            local angle: float = ((2.0 * PI) / cast<float>(len)) * (inverse ? 1.0 : -1.0);
            local wr: float = Math.cos(angle);
            local wi: float = Math.sin(angle);
            local i: int = 0;
            loop (i < n) {
                local cr: float = 1.0;
                local ci: float = 0.0;
                loop (local k: int = 0; k < (len / 2); k = k + 1) {
                    local a: int = i + k;
                    local b: int = i + k + (len / 2);
                    local xr: float = (re[b] * cr) - (im[b] * ci);
                    local xi: float = (re[b] * ci) + (im[b] * cr);
                    re[b] = re[a] - xr;
                    im[b] = im[a] - xi;
                    re[a] = re[a] + xr;
                    im[a] = im[a] + xi;
                    local ncr: float = (cr * wr) - (ci * wi);
                    ci = (cr * wi) + (ci * wr);
                    cr = ncr;
                }
                i = i + len;
            }
            len = len << 1;
        }
        if (inverse) {
            loop (local k: int = 0; k < n; k = k + 1) {
                re[k] = re[k] / cast<float>(n);
                im[k] = im[k] / cast<float>(n);
            }
        }
    }

    frame isPowerOfTwo(n: int) ret bool {
        return (n > 0) && ((n & (n - 1)) == 0);
    }

    # Direct O(n^2) DFT used to verify the FFT.
    frame naive(re: *float, im: *float, n: int, out_re: *float, out_im: *float) {
        loop (local k: int = 0; k < n; k = k + 1) {
            local sr: float = 0.0;
            local si: float = 0.0;
            loop (local t: int = 0; t < n; t = t + 1) {
                local angle: float = (-2.0 * PI * cast<float>(k * t)) / cast<float>(n);
                sr = (sr + (re[t] * Math.cos(angle))) - (im[t] * Math.sin(angle));
                si = si + (re[t] * Math.sin(angle)) + (im[t] * Math.cos(angle));
            }
            out_re[k] = sr;
            out_im[k] = si;
        }
    }
}

struct HestonModel {
    v0: float,
    kappa: float,
    theta: float,
    xi: float,
    rho: float,
}

struct VarianceGamma {
    sigma: float,
    nu: float,
    theta: float,
}

# A characteristic function of ln(S_T): Heston, Black-Scholes or Variance Gamma.
enum CharFn {
    BlackScholes(float),
    Heston(HestonModel),
    VG(VarianceGamma),
}

struct FourierPricer {
    # phi(u) = E[exp(i u ln S_T)] under the risk-neutral measure.
    frame characteristic(model: *CharFn, u: Cx, spot: float, rate: float, div: float, t: float) ret Cx {
        local i: Cx = Cx.of(0.0, 1.0);
        local drift_log: Cx = Cx.mul(i, Cx.scale(u, Math.log(spot) + ((rate - div) * t)));
        return match (*model) {
            CharFn.BlackScholes(vol) => FourierPricer.bsChar(u, vol, t, drift_log),
            CharFn.Heston(h) => FourierPricer.hestonChar(u, h, t, drift_log),
            CharFn.VG(v) => FourierPricer.vgChar(u, v, t, drift_log),
        };
    }

    frame bsChar(u: Cx, vol: float, t: float, drift_log: Cx) ret Cx {
        # exp(i u (ln S + (r - q - vol^2/2) t) - vol^2 u^2 t / 2)
        local i: Cx = Cx.of(0.0, 1.0);
        local u2: Cx = Cx.mul(u, u);
        local correction: Cx = Cx.mul(i, Cx.scale(u, -0.5 * vol * vol * t));
        local diffusion: Cx = Cx.scale(u2, -0.5 * vol * vol * t);
        return Cx.exp(Cx.add(drift_log, Cx.add(correction, diffusion)));
    }

    # Albrecher et al. "little Heston trap" form, continuous in u.
    frame hestonChar(u: Cx, h: HestonModel, t: float, drift_log: Cx) ret Cx {
        local i: Cx = Cx.of(0.0, 1.0);
        local xi2: float = h.xi * h.xi;
        local rho_xi_iu: Cx = Cx.mul(i, Cx.scale(u, h.rho * h.xi));
        local b: Cx = Cx.sub(Cx.real(h.kappa), rho_xi_iu);
        local u2_plus_iu: Cx = Cx.add(Cx.mul(u, u), Cx.mul(i, u));
        local d: Cx = Cx.sqrt(Cx.add(Cx.mul(b, b), Cx.scale(u2_plus_iu, xi2)));
        local g: Cx = Cx.div(Cx.sub(b, d), Cx.add(b, d));
        local edt: Cx = Cx.exp(Cx.scale(d, -t));
        local one: Cx = Cx.real(1.0);
        local ratio: Cx = Cx.div(Cx.sub(one, Cx.mul(g, edt)), Cx.sub(one, g));
        local c_term: Cx = Cx.scale(Cx.sub(Cx.scale(Cx.sub(b, d), t), Cx.scale(Cx.log(ratio), 2.0)), (h.kappa * h.theta) / xi2);
        local d_term: Cx = Cx.mul(Cx.scale(Cx.sub(b, d), 1.0 / xi2), Cx.div(Cx.sub(one, edt), Cx.sub(one, Cx.mul(g, edt))));
        return Cx.exp(Cx.add(drift_log, Cx.add(c_term, Cx.scale(d_term, h.v0))));
    }

    # Variance Gamma with the martingale correction omega.
    frame vgChar(u: Cx, v: VarianceGamma, t: float, drift_log: Cx) ret Cx {
        local i: Cx = Cx.of(0.0, 1.0);
        local omega: float = Math.log(1.0 - (v.theta * v.nu) - (0.5 * v.sigma * v.sigma * v.nu)) / v.nu;
        local base: Cx = Cx.sub(Cx.sub(Cx.real(1.0), Cx.mul(i, Cx.scale(u, v.theta * v.nu))), Cx.scale(Cx.mul(u, u), -0.5 * v.sigma * v.sigma * v.nu));
        # base = 1 - i theta nu u + sigma^2 nu u^2 / 2
        local power: Cx = Cx.pow(base, -t / v.nu);
        return Cx.mul(Cx.exp(Cx.add(drift_log, Cx.mul(i, Cx.scale(u, omega * t)))), power);
    }

    # Gil-Pelaez: C = S e^{-qT} P1 - K e^{-rT} P2 with Gauss-Legendre on [0, umax].
    frame price(model: *CharFn, s: *OptionSpec, umax: float, panels: int) ret float {
        local i: Cx = Cx.of(0.0, 1.0);
        local lnk: float = Math.log(s.strike);
        local minus_i: Cx = Cx.of(0.0, -1.0);
        local phi_mi: Cx = FourierPricer.characteristic(model, minus_i, s.spot, s.rate, s.dividend, s.expiry);
        local gx: float[10] = [0.0765265211334973, 0.2277858511416451, 0.3737060887154195, 0.5108670019508271, 0.6360536807265150, 0.7463319064601508, 0.8391169718222188, 0.9122344282513259, 0.9639719272779138, 0.9931285991850949];
        local gw: float[10] = [0.1527533871307258, 0.1491729864726037, 0.1420961093183820, 0.1316886384491766, 0.1181945319615184, 0.1019301198172404, 0.0832767415767048, 0.0626720483341091, 0.0406014298003869, 0.0176140071391521];
        local p1: float = 0.0;
        local p2: float = 0.0;
        local h: float = umax / cast<float>(panels);
        loop (local k: int = 0; k < panels; k = k + 1) {
            local a: float = h * cast<float>(k);
            local mid: float = a + (h / 2.0);
            loop (local j: int = 0; j < 20; j = j + 1) {
                local node: float = j < 10 ? mid + ((h / 2.0) * gx[j]) : mid - ((h / 2.0) * gx[j - 10]);
                local weight: float = ((j < 10 ? gw[j] : gw[j - 10]) * h) / 2.0;
                if (node <= 0.0) {
                    continue;
                }
                local u: Cx = Cx.real(node);
                local e: Cx = Cx.exp(Cx.mul(minus_i, Cx.scale(u, lnk)));
                local phi_u: Cx = FourierPricer.characteristic(model, u, s.spot, s.rate, s.dividend, s.expiry);
                local shifted: Cx = Cx.sub(u, i);
                local phi_s: Cx = FourierPricer.characteristic(model, shifted, s.spot, s.rate, s.dividend, s.expiry);
                local iu: Cx = Cx.mul(i, u);
                local f2: Cx = Cx.div(Cx.mul(e, phi_u), iu);
                local f1: Cx = Cx.div(Cx.mul(e, phi_s), Cx.mul(iu, phi_mi));
                p1 = p1 + (weight * f1.re);
                p2 = p2 + (weight * f2.re);
            }
        }
        p1 = 0.5 + (p1 / PI);
        p2 = 0.5 + (p2 / PI);
        local call: float = (s.spot * Math.exp(-s.dividend * s.expiry) * p1) - (s.strike * Math.exp(-s.rate * s.expiry) * p2);
        if (s.kind == OptionKind.Call) {
            return call;
        }
        return (call - (s.spot * Math.exp(-s.dividend * s.expiry))) + (s.strike * Math.exp(-s.rate * s.expiry));
    }

    # Carr-Madan FFT: call prices on a log-strike grid centred on ln(spot).
    # Writes n strikes and prices; returns the grid spacing in log strike.
    frame carrMadan(model: *CharFn, spot: float, rate: float, div: float, t: float, alpha: float, n: int, eta: float, strikes: *float, prices: *float) ret float {
        local lambda: float = (2.0 * PI) / (cast<float>(n) * eta);
        local b: float = (cast<float>(n) * lambda) / 2.0;
        local re: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local im: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local i: Cx = Cx.of(0.0, 1.0);
        local disc: float = Math.exp(-rate * t);
        local ln_s: float = Math.log(spot);
        loop (local j: int = 0; j < n; j = j + 1) {
            local v: float = eta * cast<float>(j);
            # psi(v) = e^{-rT} phi(v - (alpha + 1) i) / (alpha^2 + alpha - v^2 + i (2 alpha + 1) v)
            local arg: Cx = Cx.of(v, -(alpha + 1.0));
            local phi: Cx = FourierPricer.characteristic(model, arg, spot, rate, div, t);
            local denom: Cx = Cx.of(((alpha * alpha) + alpha) - (v * v), ((2.0 * alpha) + 1.0) * v);
            local psi: Cx = Cx.scale(Cx.div(phi, denom), disc);
            # Simpson weights and the shift to centre the grid at ln(spot).
            local simpson: float = ((3.0 + ((j % 2) == 0 ? -1.0 : 1.0)) - (j == 0 ? 1.0 : 0.0)) / 3.0;
            local shift: Cx = Cx.exp(Cx.mul(i, Cx.real(v * (b - ln_s))));
            local term: Cx = Cx.scale(Cx.mul(psi, shift), eta * simpson);
            re[j] = term.re;
            im[j] = term.im;
        }
        Fft.transform(re, im, n, false);
        loop (local k: int = 0; k < n; k = k + 1) {
            local lnk: float = (ln_s - b) + (lambda * cast<float>(k));
            strikes[k] = Math.exp(lnk);
            prices[k] = (Math.exp(-alpha * lnk) / PI) * re[k];
        }
        free(cast<*void>(re));
        free(cast<*void>(im));
        return lambda;
    }

    # Linear interpolation of a Carr-Madan grid at a single strike.
    frame interpolate(strikes: *float, prices: *float, n: int, k: float) ret float {
        loop (local i: int = 1; i < n; i = i + 1) {
            if (strikes[i] >= k) {
                local w: float = (Math.log(k) - Math.log(strikes[i - 1])) / (Math.log(strikes[i]) - Math.log(strikes[i - 1]));
                return prices[i - 1] + (w * (prices[i] - prices[i - 1]));
            }
        }
        return prices[n - 1];
    }
}
