# Option portfolio risk: positions in European options and the underlying
# across several underlyings, aggregated Greeks, full-revaluation scenario
# grids over spot and volatility shocks, and Sobol quasi-Monte Carlo.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Special] from "../math/special.bpl";
import [OptionSpec], [OptionKind], [BlackScholes], [Greeks] from "./black_scholes.bpl";

export [OptionBook];
export [BookPosition];
export [BookGreeks];
export [ScenarioGrid];
export [Sobol];

struct BookPosition {
    underlying: int,
    is_option: bool,
    kind: OptionKind,
    strike: float,
    expiry: float,
    quantity: float,
}

struct BookGreeks {
    value: float,
    delta: float,
    gamma: float,
    vega: float,
    theta: float,
    rho: float,
}

struct ScenarioGrid {
    spot_shocks: *float,
    vol_shocks: *float,
    ns: int,
    nv: int,
    pnl: *float,
    worst: float,
    worst_spot: float,
    worst_vol: float,

    frame destroy(this: *ScenarioGrid) {
        free(cast<*void>(this.spot_shocks));
        free(cast<*void>(this.vol_shocks));
        free(cast<*void>(this.pnl));
    }

    frame at(this: *ScenarioGrid, i: int, j: int) ret float {
        return this.pnl[(i * this.nv) + j];
    }
}

struct OptionBook {
    spots: float[16],
    vols: float[16],
    underlyings: int,
    rate: float,
    positions: *BookPosition,
    count: int,
    cap: int,

    frame init(this: *OptionBook, rate: float) {
        this.underlyings = 0;
        this.rate = rate;
        this.cap = 16;
        this.count = 0;
        this.positions = cast<*BookPosition>(malloc(cast<long>(this.cap) * sizeof(BookPosition)));
    }

    frame destroy(this: *OptionBook) {
        free(cast<*void>(this.positions));
        this.positions = nullptr;
    }

    frame addUnderlying(this: *OptionBook, spot: float, vol: float) ret int {
        local id: int = this.underlyings;
        this.spots[id] = spot;
        this.vols[id] = vol;
        this.underlyings = id + 1;
        return id;
    }

    frame add(this: *OptionBook, p: BookPosition) {
        if (this.count == this.cap) {
            local next_cap: int = this.cap * 2;
            local next: *BookPosition = cast<*BookPosition>(malloc(cast<long>(next_cap) * sizeof(BookPosition)));
            loop (local i: int = 0; i < this.count; i = i + 1) {
                next[i] = this.positions[i];
            }
            free(cast<*void>(this.positions));
            this.positions = next;
            this.cap = next_cap;
        }
        this.positions[this.count] = p;
        this.count = this.count + 1;
    }

    frame specFor(this: *OptionBook, p: *BookPosition, spot: float, vol: float, expiry: float) ret OptionSpec {
        return OptionSpec.new(p.kind, spot, p.strike, this.rate, 0.0, vol, expiry);
    }

    # Value with per-underlying spot/vol multipliers and an elapsed time.
    frame valueShocked(this: *OptionBook, spot_mult: float, vol_add: float, elapsed: float) ret float {
        local total: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local p: *BookPosition = this.positions + i;
            local s: float = this.spots[p.underlying] * spot_mult;
            if (!p.is_option) {
                total = total + (p.quantity * s);
                continue;
            }
            local t: float = p.expiry - elapsed;
            if (t <= 0.0) {
                local intrinsic: float = p.kind == OptionKind.Call ? s - p.strike : p.strike - s;
                total = total + (p.quantity * (intrinsic > 0.0 ? intrinsic : 0.0));
                continue;
            }
            local v: float = this.vols[p.underlying] + vol_add;
            if (v < 0.01) {
                v = 0.01;
            }
            local sp: OptionSpec = this.specFor(p, s, v, t);
            total = total + (p.quantity * BlackScholes.price(&sp));
        }
        return total;
    }

    frame value(this: *OptionBook) ret float {
        return this.valueShocked(1.0, 0.0, 0.0);
    }

    # Greeks aggregated in currency terms (delta in underlying units x spot).
    frame greeks(this: *OptionBook) ret BookGreeks {
        local g: BookGreeks = BookGreeks { value: 0.0, delta: 0.0, gamma: 0.0, vega: 0.0, theta: 0.0, rho: 0.0 };
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local p: *BookPosition = this.positions + i;
            local s: float = this.spots[p.underlying];
            if (!p.is_option) {
                g.value = g.value + (p.quantity * s);
                g.delta = g.delta + (p.quantity * s);
                continue;
            }
            local sp: OptionSpec = this.specFor(p, s, this.vols[p.underlying], p.expiry);
            local og: Greeks = BlackScholes.greeks(&sp);
            g.value = g.value + (p.quantity * og.price);
            g.delta = g.delta + (p.quantity * og.delta * s);
            g.gamma = g.gamma + ((p.quantity * og.gamma * s * s) / 100.0);
            g.vega = g.vega + (p.quantity * og.vega);
            g.theta = g.theta + (p.quantity * og.theta);
            g.rho = g.rho + (p.quantity * og.rho);
        }
        return g;
    }

    frame grid(this: *OptionBook, spot_lo: float, spot_hi: float, ns: int, vol_lo: float, vol_hi: float, nv: int, elapsed: float) ret ScenarioGrid {
        local r: ScenarioGrid;
        r.ns = ns;
        r.nv = nv;
        r.spot_shocks = cast<*float>(malloc(cast<long>(ns) * sizeof(float)));
        r.vol_shocks = cast<*float>(malloc(cast<long>(nv) * sizeof(float)));
        r.pnl = cast<*float>(malloc(cast<long>(ns * nv) * sizeof(float)));
        local base: float = this.value();
        r.worst = 0.0;
        r.worst_spot = 0.0;
        r.worst_vol = 0.0;
        loop (local i: int = 0; i < ns; i = i + 1) {
            r.spot_shocks[i] = ns == 1 ? spot_lo : spot_lo + (((spot_hi - spot_lo) * cast<float>(i)) / cast<float>(ns - 1));
        }
        loop (local j: int = 0; j < nv; j = j + 1) {
            r.vol_shocks[j] = nv == 1 ? vol_lo : vol_lo + (((vol_hi - vol_lo) * cast<float>(j)) / cast<float>(nv - 1));
        }
        loop (local i: int = 0; i < ns; i = i + 1) {
            loop (local j: int = 0; j < nv; j = j + 1) {
                local v: float = this.valueShocked(1.0 + r.spot_shocks[i], r.vol_shocks[j], elapsed) - base;
                r.pnl[(i * nv) + j] = v;
                if (((i == 0) && (j == 0)) || (v < r.worst)) {
                    r.worst = v;
                    r.worst_spot = r.spot_shocks[i];
                    r.worst_vol = r.vol_shocks[j];
                }
            }
        }
        return r;
    }

    # Delta-gamma approximation of the P&L for a relative spot move.
    frame deltaGamma(g: *BookGreeks, move: float) ret float {
        return (g.delta * move) + (0.5 * g.gamma * 100.0 * move * move);
    }
}

# Sobol low-discrepancy sequence (Joe-Kuo direction numbers, first 8 dimensions).
struct Sobol {
    dims: int,
    index: u64,
    directions: u64[256],
    state: u64[8],

    frame init(this: *Sobol, dims: int) {
        this.dims = dims < 1 ? 1 : (dims > 8 ? 8 : dims);
        this.index = cast<u64>(0);
        local s: int[8] = [1, 1, 2, 3, 3, 4, 4, 4];
        local a: int[8] = [0, 0, 1, 1, 2, 1, 4, 7];
        local m: int[32] = [1, 0, 0, 0, 1, 0, 0, 0, 1, 3, 0, 0, 1, 3, 1, 0, 1, 1, 1, 0, 1, 1, 3, 3, 1, 3, 5, 13, 1, 1, 5, 5];
        loop (local d: int = 0; d < this.dims; d = d + 1) {
            local base: int = d * 32;
            if (d == 0) {
                loop (local k: int = 0; k < 32; k = k + 1) {
                    this.directions[base + k] = cast<u64>(1) << cast<u64>(31 - k);
                }
            } else {
                local sd: int = s[d];
                loop (local k: int = 0; k < sd; k = k + 1) {
                    this.directions[base + k] = cast<u64>(m[(d * 4) + k]) << cast<u64>(31 - k);
                }
                loop (local k: int = sd; k < 32; k = k + 1) {
                    local v: u64 = this.directions[(base + k) - sd] ^ (this.directions[(base + k) - sd] >> cast<u64>(sd));
                    loop (local j: int = 1; j < sd; j = j + 1) {
                        if (((a[d] >> (sd - 1 - j)) & 1) == 1) {
                            v = v ^ this.directions[(base + k) - j];
                        }
                    }
                    this.directions[base + k] = v;
                }
            }
            this.state[d] = cast<u64>(0);
        }
    }

    # Writes the next point in [0, 1)^dims (Gray-code ordering).
    frame next(this: *Sobol, out: *float) {
        local c: int = 0;
        local value: u64 = this.index;
        loop ((value & cast<u64>(1)) == cast<u64>(1)) {
            value = value >> cast<u64>(1);
            c = c + 1;
        }
        if (c > 31) {
            c = 31;
        }
        loop (local d: int = 0; d < this.dims; d = d + 1) {
            this.state[d] = this.state[d] ^ this.directions[(d * 32) + c];
            out[d] = cast<float>(this.state[d]) / 4294967296.0;
        }
        this.index = this.index + cast<u64>(1);
    }

    # European option by quasi-Monte Carlo with inverse-normal transform.
    frame european(s: *OptionSpec, paths: int) ret float {
        local sob: Sobol;
        sob.init(1);
        local u: float[1] = [0.0];
        local drift: float = (s.rate - s.dividend - (0.5 * s.vol * s.vol)) * s.expiry;
        local diffusion: float = s.vol * Math.sqrt(s.expiry);
        local is_call: bool = s.kind == OptionKind.Call;
        local sum: float = 0.0;
        # The first point is 0.5: the sequence never returns 0, whose inverse normal is infinite.
        loop (local p: int = 0; p < paths; p = p + 1) {
            sob.next(&u[0]);
            local z: float = Special.invNormCdf(u[0]);
            local st: float = s.spot * Math.exp(drift + (diffusion * z));
            local pay: float = is_call ? st - s.strike : s.strike - st;
            sum = sum + (pay > 0.0 ? pay : 0.0);
        }
        return (Math.exp(-s.rate * s.expiry) * sum) / cast<float>(paths);
    }
}
