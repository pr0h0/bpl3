# Volatility smile and surface models.
#
# SABR (Hagan et al. 2002 lognormal expansion) with calibration of alpha,
# rho and nu for fixed beta; raw SVI (Gatheral) per expiry slice with a
# butterfly-arbitrage check; a surface of SVI slices interpolated in total
# variance; and Dupire local volatility by finite differences on the surface.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Optimize], [MinResult] from "../math/optimize.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "./black_scholes.bpl";

export [Sabr];
export [Svi];
export [VolSurface];

# std/math has no hyperbolic functions; maps R to (-1, 1) for rho parameters.
frame tanh(x: float) ret float {
    if (x > 20.0) {
        return 1.0;
    }
    if (x < -20.0) {
        return -1.0;
    }
    local e: float = Math.exp(2.0 * x);
    return (e - 1.0) / (e + 1.0);
}

struct Sabr {
    alpha: float,
    beta: float,
    rho: float,
    nu: float,
    rmse: float,

    frame impliedVol(this: *Sabr, fwd: float, strike: float, t: float) ret float {
        local a: float = this.alpha;
        local b: float = this.beta;
        local r: float = this.rho;
        local v: float = this.nu;
        local omb: float = 1.0 - b;
        if (Math.abs(fwd - strike) < (0.0000001 * fwd)) {
            local fb: float = Math.pow(fwd, omb);
            local term: float = 1.0 + ((((((omb * omb) / 24.0) * a * a) / (fb * fb)) + ((0.25 * r * b * v * a) / fb) + (((2.0 - (3.0 * r * r)) / 24.0) * v * v)) * t);
            return (a / fb) * term;
        }
        local logfk: float = Math.log(fwd / strike);
        local fk: float = Math.pow(fwd * strike, omb / 2.0);
        local z: float = (v / a) * fk * logfk;
        local x: float = Math.log(((Math.sqrt((1.0 - (2.0 * r * z)) + (z * z)) + z) - r) / (1.0 - r));
        local denom: float = fk * (1.0 + (((omb * omb) / 24.0) * logfk * logfk) + ((Math.pow(omb, 4.0) / 1920.0) * Math.pow(logfk, 4.0)));
        local term: float = 1.0 + ((((((omb * omb) / 24.0) * a * a) / (fk * fk)) + ((0.25 * r * b * v * a) / fk) + (((2.0 - (3.0 * r * r)) / 24.0) * v * v)) * t);
        local ratio: float = Math.abs(x) < 0.0000000001 ? 1.0 : z / x;
        return (a / denom) * ratio * term;
    }

    # Calibrates alpha, rho, nu (beta fixed) to market vols by least squares.
    frame calibrate(fwd: float, t: float, beta: float, strikes: *float, vols: *float, n: int) ret Sabr {
        local ks: *float = strikes;
        local vs: *float = vols;
        local objective: Lambda<float>(*float) = |p: *float| ret float {
            local alpha: float = Math.exp(p[0]);
            local rho: float = tanh(p[1]);
            local nu: float = Math.exp(p[2]);
            local m: Sabr = Sabr { alpha: alpha, beta: beta, rho: rho, nu: nu, rmse: 0.0 };
            local s: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                local d: float = m.impliedVol(fwd, ks[i], t) - vs[i];
                s = s + (d * d);
            }
            return s != s ? 1000000.0 : s;
        };
        # Initial alpha from the ATM vol: alpha ~ vol_atm * F^(1-beta).
        local atm: float = vols[n / 2];
        local start: float[3] = [Math.log(atm * Math.pow(fwd, 1.0 - beta)), 0.0, Math.log(0.5)];
        local res: MinResult = Optimize.nelderMead(objective, &start[0], 3, 0.3, 0.00000000000000000001, 20000);
        local out: Sabr = Sabr { alpha: Math.exp(res.x[0]), beta: beta, rho: tanh(res.x[1]), nu: Math.exp(res.x[2]), rmse: Math.sqrt(res.fx / cast<float>(n)) };
        res.destroy();
        return out;
    }
}

struct Svi {
    a: float,
    b: float,
    rho: float,
    m: float,
    sigma: float,
    rmse: float,

    # Total implied variance w(k) at log-moneyness k = ln(K / F).
    frame totalVariance(this: *Svi, k: float) ret float {
        local d: float = k - this.m;
        return this.a + (this.b * ((this.rho * d) + Math.sqrt((d * d) + (this.sigma * this.sigma))));
    }

    frame impliedVol(this: *Svi, k: float, t: float) ret float {
        local w: float = this.totalVariance(k);
        return w > 0.0 ? Math.sqrt(w / t) : 0.0;
    }

    # Gatheral's g(k); negative values mean butterfly arbitrage.
    frame density(this: *Svi, k: float) ret float {
        local h: float = 0.0001;
        local w: float = this.totalVariance(k);
        local w1: float = (this.totalVariance(k + h) - this.totalVariance(k - h)) / (2.0 * h);
        local w2: float = ((this.totalVariance(k + h) - (2.0 * w)) + this.totalVariance(k - h)) / (h * h);
        local term: float = 1.0 - ((k * w1) / (2.0 * w));
        return ((term * term) - (((w1 * w1) / 4.0) * ((1.0 / w) + 0.25))) + (w2 / 2.0);
    }

    frame arbitrageFree(this: *Svi, lo: float, hi: float, points: int) ret bool {
        loop (local i: int = 0; i < points; i = i + 1) {
            local k: float = lo + (((hi - lo) * cast<float>(i)) / cast<float>(points - 1));
            if (this.density(k) < -0.0000001) {
                return false;
            }
        }
        return (this.a + (this.b * this.sigma * Math.sqrt(1.0 - (this.rho * this.rho)))) >= 0.0;
    }

    frame calibrate(ks: *float, total_vars: *float, n: int) ret Svi {
        local kk: *float = ks;
        local ww: *float = total_vars;
        local objective: Lambda<float>(*float) = |p: *float| ret float {
            local s: Svi = Svi { a: p[0], b: Math.exp(p[1]), rho: tanh(p[2]), m: p[3], sigma: Math.exp(p[4]), rmse: 0.0 };
            local err: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                local d: float = s.totalVariance(kk[i]) - ww[i];
                err = err + (d * d);
            }
            # Penalize negative minimum variance.
            local min_w: float = s.a + (s.b * s.sigma * Math.sqrt(1.0 - (s.rho * s.rho)));
            if (min_w < 0.0) {
                err = err + (min_w * min_w * 1000.0);
            }
            return err;
        };
        local wmin: float = total_vars[0];
        loop (local i: int = 1; i < n; i = i + 1) {
            wmin = Math.min(wmin, total_vars[i]);
        }
        local start: float[5] = [wmin * 0.5, Math.log(0.1), 0.0, 0.0, Math.log(0.1)];
        local res: MinResult = Optimize.nelderMead(objective, &start[0], 5, 0.1, 0.000000000000000000000001, 40000);
        local out: Svi = Svi { a: res.x[0], b: Math.exp(res.x[1]), rho: tanh(res.x[2]), m: res.x[3], sigma: Math.exp(res.x[4]), rmse: Math.sqrt(res.fx / cast<float>(n)) };
        res.destroy();
        return out;
    }
}

struct VolSurface {
    expiries: *float,
    slices: *Svi,
    count: int,
    spot: float,
    rate: float,
    dividend: float,

    frame new(capacity: int, spot: float, rate: float, dividend: float) ret VolSurface {
        local s: VolSurface;
        s.expiries = cast<*float>(malloc(cast<long>(capacity) * sizeof(float)));
        s.slices = cast<*Svi>(malloc(cast<long>(capacity) * sizeof(Svi)));
        s.count = 0;
        s.spot = spot;
        s.rate = rate;
        s.dividend = dividend;
        return s;
    }

    frame destroy(this: *VolSurface) {
        if (this.expiries != nullptr) {
            free(cast<*void>(this.expiries));
            free(cast<*void>(this.slices));
            this.expiries = nullptr;
        }
    }

    # Slices must be added in increasing expiry.
    frame addSlice(this: *VolSurface, t: float, slice: Svi) {
        this.expiries[this.count] = t;
        this.slices[this.count] = slice;
        this.count = this.count + 1;
    }

    frame forward(this: *VolSurface, t: float) ret float {
        return this.spot * Math.exp((this.rate - this.dividend) * t);
    }

    # Total variance at (k, t): linear in t between slices, flat-vol extrapolation.
    frame totalVariance(this: *VolSurface, k: float, t: float) ret float {
        if (this.count == 0) {
            return 0.0;
        }
        if (t <= this.expiries[0]) {
            return (this.slices[0].totalVariance(k) * t) / this.expiries[0];
        }
        loop (local i: int = 1; i < this.count; i = i + 1) {
            if (t <= this.expiries[i]) {
                local t0: float = this.expiries[i - 1];
                local t1: float = this.expiries[i];
                local w0: float = this.slices[i - 1].totalVariance(k);
                local w1: float = this.slices[i].totalVariance(k);
                return w0 + (((w1 - w0) * (t - t0)) / (t1 - t0));
            }
        }
        local last: int = this.count - 1;
        return (this.slices[last].totalVariance(k) * t) / this.expiries[last];
    }

    frame impliedVol(this: *VolSurface, strike: float, t: float) ret float {
        local k: float = Math.log(strike / this.forward(t));
        local w: float = this.totalVariance(k, t);
        return w > 0.0 ? Math.sqrt(w / t) : 0.0;
    }

    frame price(this: *VolSurface, is_call: bool, strike: float, t: float) ret float {
        local sp: OptionSpec = OptionSpec.new(is_call ? OptionKind.Call : OptionKind.Put, this.spot, strike, this.rate, this.dividend, this.impliedVol(strike, t), t);
        return BlackScholes.price(&sp);
    }

    # Dupire local volatility from total variance derivatives (Gatheral form).
    frame localVol(this: *VolSurface, strike: float, t: float) ret float {
        local k: float = Math.log(strike / this.forward(t));
        local hk: float = 0.001;
        local ht: float = Math.min(0.001, t / 4.0);
        local w: float = this.totalVariance(k, t);
        local wt: float = (this.totalVariance(k, t + ht) - this.totalVariance(k, t - ht)) / (2.0 * ht);
        local wk: float = (this.totalVariance(k + hk, t) - this.totalVariance(k - hk, t)) / (2.0 * hk);
        local wkk: float = ((this.totalVariance(k + hk, t) - (2.0 * w)) + this.totalVariance(k - hk, t)) / (hk * hk);
        local denom: float = (1.0 - ((k / w) * wk)) + (0.25 * ((-0.25 - (1.0 / w)) + ((k * k) / (w * w))) * wk * wk) + (0.5 * wkk);
        if ((denom <= 0.0) || (wt <= 0.0)) {
            return 0.0 / 0.0;
        }
        return Math.sqrt(wt / denom);
    }

    # Calendar arbitrage: total variance must not decrease in t at fixed k.
    frame calendarFree(this: *VolSurface, lo: float, hi: float, points: int) ret bool {
        loop (local i: int = 1; i < this.count; i = i + 1) {
            loop (local j: int = 0; j < points; j = j + 1) {
                local k: float = lo + (((hi - lo) * cast<float>(j)) / cast<float>(points - 1));
                if (this.slices[i].totalVariance(k) < (this.slices[i - 1].totalVariance(k) - 0.0000001)) {
                    return false;
                }
            }
        }
        return true;
    }
}
