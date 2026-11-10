# Performance attribution.
#
# Brinson-Fachler (allocation against the total benchmark return) and
# Brinson-Hood-Beebower single-period sector attribution, Carino and
# Menchero multi-period linking, and contribution to return. Inputs are
# per-sector portfolio/benchmark weights and returns; weights are expected
# to sum to one on each side (a cash sector covers the remainder).

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";

export [Brinson];
export [SectorEffect];
export [BrinsonResult];
export [Linking];

struct SectorEffect {
    allocation: float,
    selection: float,
    interaction: float,
    total: float,
    contribution_portfolio: float,
    contribution_benchmark: float,
}

struct BrinsonResult {
    sectors: *SectorEffect,
    count: int,
    portfolio_return: float,
    benchmark_return: float,
    active_return: float,
    allocation: float,
    selection: float,
    interaction: float,
    weight_error: float,

    frame destroy(this: *BrinsonResult) {
        if (this.sectors != nullptr) {
            free(cast<*void>(this.sectors));
            this.sectors = nullptr;
        }
    }
}

struct Brinson {
    # fachler = true: allocation uses (rb_i - Rb); false: BHB uses rb_i.
    frame single(wp: *float, wb: *float, rp: *float, rb: *float, n: int, fachler: bool) ret BrinsonResult {
        local r: BrinsonResult;
        r.count = n;
        r.sectors = cast<*SectorEffect>(malloc(cast<long>(n + 1) * sizeof(SectorEffect)));
        r.portfolio_return = 0.0;
        r.benchmark_return = 0.0;
        local sum_wp: float = 0.0;
        local sum_wb: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            r.portfolio_return = r.portfolio_return + (wp[i] * rp[i]);
            r.benchmark_return = r.benchmark_return + (wb[i] * rb[i]);
            sum_wp = sum_wp + wp[i];
            sum_wb = sum_wb + wb[i];
        }
        r.weight_error = Math.max(Math.abs(sum_wp - 1.0), Math.abs(sum_wb - 1.0));
        r.active_return = r.portfolio_return - r.benchmark_return;
        r.allocation = 0.0;
        r.selection = 0.0;
        r.interaction = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local e: *SectorEffect = r.sectors + i;
            local active_w: float = wp[i] - wb[i];
            local relative: float = fachler ? rb[i] - r.benchmark_return : rb[i];
            e.allocation = active_w * relative;
            e.selection = wb[i] * (rp[i] - rb[i]);
            e.interaction = active_w * (rp[i] - rb[i]);
            e.total = e.allocation + e.selection + e.interaction;
            e.contribution_portfolio = wp[i] * rp[i];
            e.contribution_benchmark = wb[i] * rb[i];
            r.allocation = r.allocation + e.allocation;
            r.selection = r.selection + e.selection;
            r.interaction = r.interaction + e.interaction;
        }
        return r;
    }
}

# Multi-period linking of arithmetic effects so they sum to the compounded
# active return.
struct Linking {
    frame compound(returns: *float, n: int) ret float {
        local g: float = 1.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            g = g * (1.0 + returns[i]);
        }
        return g - 1.0;
    }

    # ln(1 + a) - ln(1 + b) over a - b, with the limit 1 / (1 + a) at a = b.
    frame carinoK(a: float, b: float) ret float {
        if (Math.abs(a - b) < 0.000000000001) {
            return 1.0 / (1.0 + a);
        }
        return (Math.log(1.0 + a) - Math.log(1.0 + b)) / (a - b);
    }

    # Carino factors: effect_t * k_t / K sums to Rp - Rb over the periods.
    frame carino(rp: *float, rb: *float, n: int, out: *float) {
        local total_p: float = Linking.compound(rp, n);
        local total_b: float = Linking.compound(rb, n);
        local big_k: float = Linking.carinoK(total_p, total_b);
        loop (local t: int = 0; t < n; t = t + 1) {
            out[t] = Linking.carinoK(rp[t], rb[t]) / big_k;
        }
    }

    # Menchero: a uniform scale M plus a correction proportional to each
    # period's active return so the linked effects add up exactly.
    frame menchero(rp: *float, rb: *float, n: int, out: *float) {
        local total_p: float = Linking.compound(rp, n);
        local total_b: float = Linking.compound(rb, n);
        local active: float = total_p - total_b;
        local nf: float = cast<float>(n);
        local m: float = 1.0;
        if (Math.abs(active) > 0.000000000001) {
            m = (active / nf) / (Math.pow(1.0 + total_p, 1.0 / nf) - Math.pow(1.0 + total_b, 1.0 / nf));
        } else {
            m = Math.pow(1.0 + total_p, (nf - 1.0) / nf);
        }
        local sum_a: float = 0.0;
        local sum_a2: float = 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            local a: float = rp[t] - rb[t];
            sum_a = sum_a + a;
            sum_a2 = sum_a2 + (a * a);
        }
        local alpha: float = sum_a2 > 0.0 ? (active - (m * sum_a)) / sum_a2 : 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            out[t] = m + (alpha * (rp[t] - rb[t]));
        }
    }

    # Links per-period effects `effects[t]` with factors `k[t]`.
    frame link(effects: *float, k: *float, n: int) ret float {
        local s: float = 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            s = s + (effects[t] * k[t]);
        }
        return s;
    }
}
