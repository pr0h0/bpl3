# Pluggable option pricing models.
#
# Every model implements the PricingModel spec; a ModelRegistry stores
# `*PricingModel` values in a struct field (a `*Spec` holds its object and
# method table by value) and prices one contract with every model for
# comparison. Models: Black-Scholes, Bachelier (normal), CRR binomial
# (European or American), the Merton jump-diffusion series and the
# Reiner-Rubinstein closed-form barrier option (down/up, in/out).

import [Math] from "std/math.bpl";
import [Text] from "../core/text.bpl";
import [Special] from "../math/special.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "./black_scholes.bpl";

export [PricingModel];
export [BlackScholesModel];
export [BachelierModel];
export [BinomialModel];
export [JumpModel];
export [BarrierModel];
export [ModelRegistry];
export [BarrierKind];

spec PricingModel {
    frame name(this: *Self) ret string;
    frame price(this: *Self, s: *OptionSpec) ret float;
}

struct BlackScholesModel: PricingModel {
    tag: int,

    frame name(this: *BlackScholesModel) ret string {
        return "black_scholes";
    }

    frame price(this: *BlackScholesModel, s: *OptionSpec) ret float {
        return BlackScholes.price(s);
    }
}

# Normal model: forward F = S e^{(r - q) T}, absolute vol sigma_n = vol * S
# (a lognormal vol mapped to the at-the-money normal vol).
struct BachelierModel: PricingModel {
    tag: int,

    frame name(this: *BachelierModel) ret string {
        return "bachelier";
    }

    frame price(this: *BachelierModel, s: *OptionSpec) ret float {
        local f: float = s.spot * Math.exp((s.rate - s.dividend) * s.expiry);
        local sn: float = s.vol * s.spot * Math.sqrt(s.expiry);
        local df: float = Math.exp(-s.rate * s.expiry);
        local d: float = (f - s.strike) / sn;
        local pdf: float = Math.exp(-0.5 * d * d) / 2.5066282746310002;
        local call: float = df * (((f - s.strike) * Special.normCdf(d)) + (sn * pdf));
        if (s.kind == OptionKind.Call) {
            return call;
        }
        return call - (df * (f - s.strike));
    }
}

struct BinomialModel: PricingModel {
    steps: int,
    american: bool,

    frame name(this: *BinomialModel) ret string {
        return this.american ? "crr_american" : "crr_european";
    }

    frame price(this: *BinomialModel, s: *OptionSpec) ret float {
        local n: int = this.steps < 1 ? 1 : (this.steps > 5000 ? 5000 : this.steps);
        local dt: float = s.expiry / cast<float>(n);
        local u: float = Math.exp(s.vol * Math.sqrt(dt));
        local d: float = 1.0 / u;
        local p: float = (Math.exp((s.rate - s.dividend) * dt) - d) / (u - d);
        local disc: float = Math.exp(-s.rate * dt);
        local values: float[5001];
        local call: bool = s.kind == OptionKind.Call;
        loop (local i: int = 0; i <= n; i = i + 1) {
            local st: float = s.spot * Math.pow(u, cast<float>(i)) * Math.pow(d, cast<float>(n - i));
            values[i] = call ? Math.max(st - s.strike, 0.0) : Math.max(s.strike - st, 0.0);
        }
        local step: int = n - 1;
        loop (step >= 0) {
            loop (local i: int = 0; i <= step; i = i + 1) {
                local cont: float = disc * ((p * values[i + 1]) + ((1.0 - p) * values[i]));
                if (this.american) {
                    local st: float = s.spot * Math.pow(u, cast<float>(i)) * Math.pow(d, cast<float>(step - i));
                    local ex: float = call ? st - s.strike : s.strike - st;
                    values[i] = Math.max(cont, ex);
                } else {
                    values[i] = cont;
                }
            }
            step = step - 1;
        }
        return values[0];
    }
}

# Merton (1976) series: sum over k jumps of Poisson weights times
# Black-Scholes with adjusted rate and vol.
struct JumpModel: PricingModel {
    intensity: float,
    jump_mean: float,
    jump_vol: float,

    frame name(this: *JumpModel) ret string {
        return "merton_jump";
    }

    frame price(this: *JumpModel, s: *OptionSpec) ret float {
        local kappa: float = Math.exp(this.jump_mean + (0.5 * this.jump_vol * this.jump_vol)) - 1.0;
        local lam: float = this.intensity * (1.0 + kappa);
        local total: float = 0.0;
        local weight: float = Math.exp(-lam * s.expiry);
        loop (local k: int = 0; k < 60; k = k + 1) {
            if (k > 0) {
                weight = (weight * lam * s.expiry) / cast<float>(k);
            }
            local kf: float = cast<float>(k);
            local vol: float = Math.sqrt((s.vol * s.vol) + ((kf * this.jump_vol * this.jump_vol) / s.expiry));
            local rate: float = (s.rate - (this.intensity * kappa)) + ((kf * Math.log(1.0 + kappa)) / s.expiry);
            local adj: OptionSpec = OptionSpec.new(s.kind, s.spot, s.strike, rate, s.dividend, vol, s.expiry);
            # Discount at the true rate: BS(rate_k) discounts at rate_k.
            total = total + (weight * BlackScholes.price(&adj) * Math.exp((rate - s.rate) * s.expiry));
            if ((k > 5) && (weight < 0.0000000000001)) {
                break;
            }
        }
        return total;
    }
}

enum BarrierKind {
    DownOut,
    DownIn,
    UpOut,
    UpIn,
}

# Reiner-Rubinstein (1991) closed forms for continuously monitored
# single-barrier options with a cash rebate paid at expiry (knock-in) or
# at the hit (knock-out).
struct BarrierModel: PricingModel {
    kind: BarrierKind,
    barrier: float,
    rebate: float,

    frame name(this: *BarrierModel) ret string {
        if (this.kind == BarrierKind.DownOut) {
            return "barrier_down_out";
        }
        if (this.kind == BarrierKind.DownIn) {
            return "barrier_down_in";
        }
        if (this.kind == BarrierKind.UpOut) {
            return "barrier_up_out";
        }
        return "barrier_up_in";
    }

    frame price(this: *BarrierModel, s: *OptionSpec) ret float {
        local sp: float = s.spot;
        local k: float = s.strike;
        local h: float = this.barrier;
        local t: float = s.expiry;
        local r: float = s.rate;
        local q: float = s.dividend;
        local v: float = s.vol;
        local down: bool = (this.kind == BarrierKind.DownOut) || (this.kind == BarrierKind.DownIn);
        local is_in: bool = (this.kind == BarrierKind.DownIn) || (this.kind == BarrierKind.UpIn);
        # Already breached: knock-outs pay the rebate, knock-ins become vanilla.
        if ((down && (sp <= h)) || (!down && (sp >= h))) {
            if (is_in) {
                return BlackScholes.price(s);
            }
            return this.rebate;
        }
        local phi: float = s.kind == OptionKind.Call ? 1.0 : -1.0;
        local eta: float = down ? 1.0 : -1.0;
        local vt: float = v * Math.sqrt(t);
        local mu: float = (r - q - (0.5 * v * v)) / (v * v);
        local lambda: float = Math.sqrt((mu * mu) + ((2.0 * r) / (v * v)));
        local x1: float = (Math.log(sp / k) / vt) + ((1.0 + mu) * vt);
        local x2: float = (Math.log(sp / h) / vt) + ((1.0 + mu) * vt);
        local y1: float = (Math.log((h * h) / (sp * k)) / vt) + ((1.0 + mu) * vt);
        local y2: float = (Math.log(h / sp) / vt) + ((1.0 + mu) * vt);
        local z: float = (Math.log(h / sp) / vt) + (lambda * vt);
        local dq: float = Math.exp(-q * t);
        local dr: float = Math.exp(-r * t);
        local hs: float = h / sp;
        local a: float = (phi * sp * dq * Special.normCdf(phi * x1)) - (phi * k * dr * Special.normCdf((phi * x1) - (phi * vt)));
        local b: float = (phi * sp * dq * Special.normCdf(phi * x2)) - (phi * k * dr * Special.normCdf((phi * x2) - (phi * vt)));
        local c: float = (phi * sp * dq * Math.pow(hs, 2.0 * (mu + 1.0)) * Special.normCdf(eta * y1)) - (phi * k * dr * Math.pow(hs, 2.0 * mu) * Special.normCdf((eta * y1) - (eta * vt)));
        local d: float = (phi * sp * dq * Math.pow(hs, 2.0 * (mu + 1.0)) * Special.normCdf(eta * y2)) - (phi * k * dr * Math.pow(hs, 2.0 * mu) * Special.normCdf((eta * y2) - (eta * vt)));
        local e: float = this.rebate * dr * (Special.normCdf((eta * x2) - (eta * vt)) - (Math.pow(hs, 2.0 * mu) * Special.normCdf((eta * y2) - (eta * vt))));
        local f: float = this.rebate * ((Math.pow(hs, mu + lambda) * Special.normCdf(eta * z)) + (Math.pow(hs, mu - lambda) * Special.normCdf((eta * z) - (2.0 * eta * lambda * vt))));
        local call: bool = phi > 0.0;
        local above: bool = k > h;
        if (this.kind == BarrierKind.DownIn) {
            if (call) {
                return above ? c + e : (a - b) + d + e;
            }
            return above ? (b - c) + d + e : a + e;
        }
        if (this.kind == BarrierKind.UpIn) {
            if (call) {
                return above ? a + e : (b - c) + d + e;
            }
            return above ? (a - b) + d + e : c + e;
        }
        if (this.kind == BarrierKind.DownOut) {
            if (call) {
                return above ? (a - c) + f : (b - d) + f;
            }
            return above ? (((a - b) + c) - d) + f : f;
        }
        if (call) {
            return above ? f : (((a - b) + c) - d) + f;
        }
        return above ? (b - d) + f : (a - c) + f;
    }
}

struct ModelRegistry {
    models: *PricingModel[8],
    count: int,

    frame create() ret ModelRegistry {
        local r: ModelRegistry;
        r.count = 0;
        return r;
    }

    frame add(this: *ModelRegistry, m: *PricingModel) ret bool {
        if (this.count == 8) {
            return false;
        }
        this.models[this.count] = m;
        this.count = this.count + 1;
        return true;
    }

    frame find(this: *ModelRegistry, name: string) ret *PricingModel {
        loop (local i: int = 0; i < this.count; i = i + 1) {
            if (Text.equals(this.models[i].name(), name)) {
                return this.models[i];
            }
        }
        return nullptr;
    }

    frame at(this: *ModelRegistry, i: int) ret *PricingModel {
        return this.models[i];
    }
}
