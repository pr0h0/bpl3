# Implied volatility solvers.
#
# Newton-Raphson on vega with a bracketing bisection fallback. The solver
# checks no-arbitrage bounds first so impossible prices report an error rather
# than a meaningless volatility.

import [Math] from "std/math.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "./black_scholes.bpl";
import [Optimize], [RootResult] from "../math/optimize.bpl";

export [ImpliedVol];
export [IvResult];

struct IvResult {
    vol: float,
    iterations: int,
    ok: bool,
    method: string,
    error: string,
}

struct ImpliedVol {
    frame bounds(s: *OptionSpec, lo: *float, hi: *float) {
        local df: float = Math.exp(-s.rate * s.expiry);
        local qf: float = Math.exp(-s.dividend * s.expiry);
        if (s.isCall()) {
            local intrinsic: float = (s.spot * qf) - (s.strike * df);
            *lo = intrinsic > 0.0 ? intrinsic : 0.0;
            *hi = s.spot * qf;
        } else {
            local intrinsic: float = (s.strike * df) - (s.spot * qf);
            *lo = intrinsic > 0.0 ? intrinsic : 0.0;
            *hi = s.strike * df;
        }
    }

    frame solve(s: *OptionSpec, target: float) ret IvResult {
        local res: IvResult = IvResult { vol: 0.0, iterations: 0, ok: false, method: "newton", error: nullptr };
        local lo: float = 0.0;
        local hi: float = 0.0;
        ImpliedVol.bounds(s, &lo, &hi);
        if ((target <= lo) || (target >= hi)) {
            res.error = "price outside no-arbitrage bounds";
            return res;
        }
        local vol: float = BlackScholes.volGuess(s, target);
        loop (local i: int = 0; i < 50; i = i + 1) {
            local trial: OptionSpec = s.withVol(vol);
            local diff: float = BlackScholes.price(&trial) - target;
            res.iterations = i + 1;
            if (Math.abs(diff) < 0.00000001) {
                res.vol = vol;
                res.ok = true;
                return res;
            }
            local d1: float = BlackScholes.d1(&trial);
            local vega: float = trial.spot * Math.exp(-trial.dividend * trial.expiry) * Math.exp(-0.5 * d1 * d1) * 0.3989422804014327 * Math.sqrt(trial.expiry);
            if (vega < 0.00000001) {
                break;
            }
            local next: float = vol - (diff / vega);
            if (!(next > 0.0001) || (next > 10.0)) {
                break;
            }
            vol = next;
        }
        return ImpliedVol.solveBisect(s, target);
    }

    frame solveBisect(s: *OptionSpec, target: float) ret IvResult {
        local sp: OptionSpec = *s;
        local objective: Lambda<float>(float) = |v: float| ret float {
            local t: OptionSpec = sp.withVol(v);
            return BlackScholes.price(&t) - target;
        };
        local r: RootResult = Optimize.brent(objective, 0.0001, 10.0, 0.0000000001, 200);
        return IvResult { vol: r.x, iterations: r.iterations, ok: r.converged, method: "brent", error: r.converged ? nullptr : "did not converge" };
    }

    # Volatility smile from a strike grid of market prices.
    frame smile(s: *OptionSpec, strikes: *float, prices: *float, n: int, out: *float) ret int {
        local solved: int = 0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local sp: OptionSpec = *s;
            sp.strike = strikes[i];
            local r: IvResult = ImpliedVol.solve(&sp, prices[i]);
            if (r.ok) {
                out[i] = r.vol;
                solved = solved + 1;
            } else {
                out[i] = 0.0 / 0.0;
            }
        }
        return solved;
    }
}
