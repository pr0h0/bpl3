# Multi-asset scenario and stress-test engine.
#
# A StressBook holds equity, option, bond and FX positions on a small set of
# risk factors: one market index, equity underlyings with a beta to it and
# their own implied vols, a flat-plus-twist rate curve, a credit spread and
# FX rates. A Scenario shocks those factors (relative equity/FX moves,
# absolute vol points, basis-point rate shifts and twists, credit spread
# widening and a horizon for time decay). Every position is fully
# revalued; P&L is broken down by position and by factor group
# (one-at-a-time shocks, with the cross term reported as interaction).
#
# Also provided: built-in stylised historical scenarios, sensitivity
# ladders, a reverse stress test (the scale of a scenario that produces a
# target loss) and a Monte Carlo stressed VaR/ES from a one-factor model
# with fat-tailed (Student-t) market moves.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Text] from "../core/text.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [Sort] from "../math/sort.bpl";
import [Stats] from "../math/stats.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "../quant/black_scholes.bpl";
import [Bond] from "../rates/instruments.bpl";

export [StressBook];
export [StressPosition];
export [PositionKind];
export [Scenario];
export [StressResult];
export [FactorBreakdown];
export [ReverseStress];
export [StressVar];
export [Scenarios];

global const MAX_UNDERLYINGS: int = 16;
global const MAX_FX: int = 8;

enum PositionKind {
    Equity,
    Option,
    Bond,
    Fx,
}

struct StressPosition {
    kind: PositionKind,
    # Underlying (equity/option) or currency index (FX).
    index: int,
    quantity: float,
    is_call: bool,
    strike: float,
    expiry: float,
    # Bonds: coupon, maturity, frequency; `credit` applies the spread shock.
    coupon: float,
    maturity: float,
    frequency: int,
    credit: bool,
    label: string,
}

struct Scenario {
    name: string,
    market: float,
    # Optional per-underlying idiosyncratic moves on top of beta * market.
    idio: float[16],
    vol_points: float,
    # Vol shock scales with the equity move: vol += -skew * move.
    vol_skew: float,
    rate_bp: float,
    twist_bp: float,
    credit_bp: float,
    fx: float[8],
    horizon_days: float,
}

struct FactorBreakdown {
    equity: float,
    volatility: float,
    rates: float,
    credit: float,
    fx: float,
    time: float,
    interaction: float,
}

struct StressResult {
    base_value: float,
    stressed_value: float,
    pnl: float,
    by_factor: FactorBreakdown,
    # P&L per position (owned, `count` entries).
    by_position: *float,
    count: int,
    worst_position: int,

    frame destroy(this: *StressResult) {
        if (this.by_position != nullptr) {
            free(cast<*void>(this.by_position));
            this.by_position = nullptr;
        }
    }
}

struct ReverseStress {
    scale: float,
    pnl: float,
    iterations: int,
    found: bool,
}

struct StressVar {
    var: float,
    es: float,
    worst: float,
    mean: float,
    paths: int,
}

struct StressBook {
    spots: float[16],
    vols: float[16],
    betas: float[16],
    idio_vols: float[16],
    names: string[16],
    underlyings: int,
    fx_rates: float[8],
    fx_vols: float[8],
    fx_names: string[8],
    currencies: int,
    rate: float,
    spread: float,
    market_vol: float,
    positions: *StressPosition,
    count: int,
    cap: int,

    frame init(this: *StressBook, rate: float, spread: float, market_vol: float) {
        this.underlyings = 0;
        this.currencies = 0;
        this.rate = rate;
        this.spread = spread;
        this.market_vol = market_vol;
        this.cap = 16;
        this.positions = cast<*StressPosition>(malloc(cast<long>(this.cap) * sizeof(StressPosition)));
        this.count = 0;
    }

    frame destroy(this: *StressBook) {
        if (this.positions != nullptr) {
            free(cast<*void>(this.positions));
            this.positions = nullptr;
        }
        this.count = 0;
    }

    frame addUnderlying(this: *StressBook, name: string, spot: float, vol: float, beta: float, idio_vol: float) ret int {
        if (this.underlyings == MAX_UNDERLYINGS) {
            return -1;
        }
        local i: int = this.underlyings;
        this.names[i] = name;
        this.spots[i] = spot;
        this.vols[i] = vol;
        this.betas[i] = beta;
        this.idio_vols[i] = idio_vol;
        this.underlyings = i + 1;
        return i;
    }

    frame addCurrency(this: *StressBook, name: string, rate: float, vol: float) ret int {
        if (this.currencies == MAX_FX) {
            return -1;
        }
        local i: int = this.currencies;
        this.fx_names[i] = name;
        this.fx_rates[i] = rate;
        this.fx_vols[i] = vol;
        this.currencies = i + 1;
        return i;
    }

    frame push(this: *StressBook, p: StressPosition) ret int {
        if (this.count == this.cap) {
            local next: *StressPosition = cast<*StressPosition>(malloc(cast<long>(this.cap * 2) * sizeof(StressPosition)));
            loop (local i: int = 0; i < this.count; i = i + 1) {
                next[i] = this.positions[i];
            }
            free(cast<*void>(this.positions));
            this.positions = next;
            this.cap = this.cap * 2;
        }
        this.positions[this.count] = p;
        this.count = this.count + 1;
        return this.count - 1;
    }

    frame blank(kind: PositionKind, index: int, quantity: float, label: string) ret StressPosition {
        return StressPosition { kind: kind, index: index, quantity: quantity, is_call: true, strike: 0.0, expiry: 0.0, coupon: 0.0, maturity: 0.0, frequency: 2, credit: false, label: label };
    }

    frame addEquity(this: *StressBook, und: int, quantity: float, label: string) ret int {
        return this.push(StressBook.blank(PositionKind.Equity, und, quantity, label));
    }

    frame addOption(this: *StressBook, und: int, is_call: bool, strike: float, expiry: float, quantity: float, label: string) ret int {
        local p: StressPosition = StressBook.blank(PositionKind.Option, und, quantity, label);
        p.is_call = is_call;
        p.strike = strike;
        p.expiry = expiry;
        return this.push(p);
    }

    # `quantity` is face value in units of 100.
    frame addBond(this: *StressBook, coupon: float, maturity: float, frequency: int, credit: bool, quantity: float, label: string) ret int {
        local p: StressPosition = StressBook.blank(PositionKind.Bond, 0, quantity, label);
        p.coupon = coupon;
        p.maturity = maturity;
        p.frequency = frequency;
        p.credit = credit;
        return this.push(p);
    }

    # `quantity` units of foreign currency, valued at the FX rate.
    frame addFx(this: *StressBook, ccy: int, quantity: float, label: string) ret int {
        return this.push(StressBook.blank(PositionKind.Fx, ccy, quantity, label));
    }

    frame zero() ret Scenario {
        local s: Scenario;
        s.name = "none";
        s.market = 0.0;
        loop (local i: int = 0; i < MAX_UNDERLYINGS; i = i + 1) {
            s.idio[i] = 0.0;
        }
        loop (local i: int = 0; i < MAX_FX; i = i + 1) {
            s.fx[i] = 0.0;
        }
        s.vol_points = 0.0;
        s.vol_skew = 0.0;
        s.rate_bp = 0.0;
        s.twist_bp = 0.0;
        s.credit_bp = 0.0;
        s.horizon_days = 0.0;
        return s;
    }

    # Rate at maturity t under a scenario: parallel shift plus a linear
    # twist pivoting at 5y (short end moves -twist, 30y +twist).
    frame rateAt(this: *StressBook, sc: *Scenario, t: float) ret float {
        local w: float = Math.min(1.0, Math.max(-1.0, (t - 5.0) / 25.0));
        return this.rate + ((sc.rate_bp + (w * sc.twist_bp)) / 10000.0);
    }

    frame equityMove(this: *StressBook, sc: *Scenario, und: int) ret float {
        local m: float = (this.betas[und] * sc.market) + sc.idio[und];
        return m < -0.99 ? -0.99 : m;
    }

    frame shockedSpot(this: *StressBook, sc: *Scenario, und: int) ret float {
        return this.spots[und] * (1.0 + this.equityMove(sc, und));
    }

    frame shockedVol(this: *StressBook, sc: *Scenario, und: int) ret float {
        local v: float = (this.vols[und] + (sc.vol_points / 100.0)) - (sc.vol_skew * this.equityMove(sc, und));
        return v < 0.01 ? 0.01 : v;
    }

    # Value of one position under a scenario.
    frame positionValue(this: *StressBook, p: *StressPosition, sc: *Scenario) ret float {
        local dt: float = sc.horizon_days / 365.0;
        if (p.kind == PositionKind.Equity) {
            return p.quantity * this.shockedSpot(sc, p.index);
        }
        if (p.kind == PositionKind.Option) {
            local spot: float = this.shockedSpot(sc, p.index);
            local remaining: float = p.expiry - dt;
            if (remaining <= 0.0) {
                local intrinsic: float = p.is_call ? Math.max(spot - p.strike, 0.0) : Math.max(p.strike - spot, 0.0);
                return p.quantity * intrinsic;
            }
            local opt_spec: OptionSpec = OptionSpec.new(p.is_call ? OptionKind.Call : OptionKind.Put, spot, p.strike, this.rateAt(sc, remaining), 0.0, this.shockedVol(sc, p.index), remaining);
            return p.quantity * BlackScholes.price(&opt_spec);
        }
        if (p.kind == PositionKind.Bond) {
            local remaining: float = p.maturity - dt;
            if (remaining <= 0.0) {
                return p.quantity * (100.0 + ((100.0 * p.coupon) / cast<float>(p.frequency)));
            }
            local b: Bond = Bond.new(100.0, p.coupon, remaining, p.frequency);
            local y: float = this.rateAt(sc, remaining);
            if (p.credit) {
                y = y + this.spread + (sc.credit_bp / 10000.0);
            }
            return p.quantity * b.priceFromYield(y);
        }
        return p.quantity * this.fx_rates[p.index] * (1.0 + sc.fx[p.index]);
    }

    frame value(this: *StressBook, sc: *Scenario) ret float {
        local total: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            total = total + this.positionValue(this.positions + i, sc);
        }
        return total;
    }

    frame run(this: *StressBook, sc: *Scenario) ret StressResult {
        local base: Scenario = StressBook.zero();
        local r: StressResult;
        r.count = this.count;
        r.by_position = cast<*float>(malloc(cast<long>(this.count + 1) * sizeof(float)));
        r.base_value = 0.0;
        r.stressed_value = 0.0;
        r.worst_position = -1;
        local worst: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local b: float = this.positionValue(this.positions + i, &base);
            local s: float = this.positionValue(this.positions + i, sc);
            r.base_value = r.base_value + b;
            r.stressed_value = r.stressed_value + s;
            r.by_position[i] = s - b;
            if ((r.worst_position < 0) || ((s - b) < worst)) {
                worst = s - b;
                r.worst_position = i;
            }
        }
        r.pnl = r.stressed_value - r.base_value;
        r.by_factor = this.breakdown(sc, r.base_value, r.pnl);
        return r;
    }

    # One-at-a-time factor attribution.
    frame breakdown(this: *StressBook, sc: *Scenario, base_value: float, total: float) ret FactorBreakdown {
        local f: FactorBreakdown;
        local eq: Scenario = StressBook.zero();
        eq.market = sc.market;
        loop (local i: int = 0; i < MAX_UNDERLYINGS; i = i + 1) {
            eq.idio[i] = sc.idio[i];
        }
        f.equity = this.value(&eq) - base_value;
        local vol: Scenario = StressBook.zero();
        vol.vol_points = sc.vol_points;
        f.volatility = this.value(&vol) - base_value;
        local rates: Scenario = StressBook.zero();
        rates.rate_bp = sc.rate_bp;
        rates.twist_bp = sc.twist_bp;
        f.rates = this.value(&rates) - base_value;
        local credit: Scenario = StressBook.zero();
        credit.credit_bp = sc.credit_bp;
        f.credit = this.value(&credit) - base_value;
        local fx: Scenario = StressBook.zero();
        loop (local i: int = 0; i < MAX_FX; i = i + 1) {
            fx.fx[i] = sc.fx[i];
        }
        f.fx = this.value(&fx) - base_value;
        local time: Scenario = StressBook.zero();
        time.horizon_days = sc.horizon_days;
        f.time = this.value(&time) - base_value;
        f.interaction = total - (f.equity + f.volatility + f.rates + f.credit + f.fx + f.time);
        return f;
    }

    frame scaled(sc: *Scenario, k: float) ret Scenario {
        local s: Scenario = *sc;
        s.market = sc.market * k;
        loop (local i: int = 0; i < MAX_UNDERLYINGS; i = i + 1) {
            s.idio[i] = sc.idio[i] * k;
        }
        loop (local i: int = 0; i < MAX_FX; i = i + 1) {
            s.fx[i] = sc.fx[i] * k;
        }
        s.vol_points = sc.vol_points * k;
        s.rate_bp = sc.rate_bp * k;
        s.twist_bp = sc.twist_bp * k;
        s.credit_bp = sc.credit_bp * k;
        return s;
    }

    # Smallest scale k in (0, max_scale] of the scenario with P&L <= -loss,
    # by bracketing on a grid and then bisection.
    frame reverse(this: *StressBook, sc: *Scenario, loss: float, max_scale: float) ret ReverseStress {
        local out: ReverseStress = ReverseStress { scale: 0.0, pnl: 0.0, iterations: 0, found: false };
        local none: Scenario = StressBook.zero();
        local base: float = this.value(&none);
        local lo: float = 0.0;
        local hi: float = -1.0;
        local steps: int = 40;
        loop (local i: int = 1; i <= steps; i = i + 1) {
            local k: float = (max_scale * cast<float>(i)) / cast<float>(steps);
            local s: Scenario = StressBook.scaled(sc, k);
            out.iterations = out.iterations + 1;
            if ((this.value(&s) - base) <= -loss) {
                hi = k;
                break;
            }
            lo = k;
        }
        if (hi < 0.0) {
            local s: Scenario = StressBook.scaled(sc, max_scale);
            out.pnl = this.value(&s) - base;
            out.scale = max_scale;
            return out;
        }
        loop (local i: int = 0; (i < 60) && ((hi - lo) > 0.0000001); i = i + 1) {
            local mid: float = 0.5 * (lo + hi);
            local s: Scenario = StressBook.scaled(sc, mid);
            out.iterations = out.iterations + 1;
            if ((this.value(&s) - base) <= -loss) {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        local s: Scenario = StressBook.scaled(sc, hi);
        out.scale = hi;
        out.pnl = this.value(&s) - base;
        out.found = true;
        return out;
    }

    # P&L for market moves lo..hi in `n` steps (vol skew applied).
    frame equityLadder(this: *StressBook, lo: float, hi: float, n: int, skew: float, out: *float) {
        local none: Scenario = StressBook.zero();
        local base: float = this.value(&none);
        loop (local i: int = 0; i < n; i = i + 1) {
            local s: Scenario = StressBook.zero();
            s.market = n == 1 ? lo : lo + (((hi - lo) * cast<float>(i)) / cast<float>(n - 1));
            s.vol_skew = skew;
            out[i] = this.value(&s) - base;
        }
    }

    frame rateLadder(this: *StressBook, lo_bp: float, hi_bp: float, n: int, out: *float) {
        local none: Scenario = StressBook.zero();
        local base: float = this.value(&none);
        loop (local i: int = 0; i < n; i = i + 1) {
            local s: Scenario = StressBook.zero();
            s.rate_bp = n == 1 ? lo_bp : lo_bp + (((hi_bp - lo_bp) * cast<float>(i)) / cast<float>(n - 1));
            out[i] = this.value(&s) - base;
        }
    }

    # Student-t draw with `dof` degrees of freedom, scaled to unit variance.
    frame studentT(rng: *Xoshiro, dof: float) ret float {
        local z: float = rng.normal();
        local chi: float = 0.0;
        local k: int = cast<int>(dof);
        loop (local i: int = 0; i < k; i = i + 1) {
            local g: float = rng.normal();
            chi = chi + (g * g);
        }
        local t: float = z / Math.sqrt(chi / dof);
        return t * Math.sqrt((dof - 2.0) / dof);
    }

    # Monte Carlo over `horizon_days`: fat-tailed market factor, normal
    # idiosyncratic moves, vol moving against the market, normal rate,
    # credit and FX moves. Returns VaR/ES at `confidence` of the loss.
    frame monteCarlo(this: *StressBook, paths: int, horizon_days: float, confidence: float, dof: float, seed: u64) ret StressVar {
        local rng: Xoshiro = Xoshiro.new(seed);
        local root: float = Math.sqrt(horizon_days / 252.0);
        local none: Scenario = StressBook.zero();
        local base: float = this.value(&none);
        local pnl: *float = cast<*float>(malloc(cast<long>(paths) * sizeof(float)));
        local total: float = 0.0;
        loop (local p: int = 0; p < paths; p = p + 1) {
            local s: Scenario = StressBook.zero();
            s.market = StressBook.studentT(&rng, dof) * this.market_vol * root;
            loop (local i: int = 0; i < this.underlyings; i = i + 1) {
                s.idio[i] = rng.normal() * this.idio_vols[i] * root;
            }
            s.vol_skew = 0.5;
            s.rate_bp = rng.normal() * 80.0 * root;
            s.credit_bp = Math.max(-s.market * 300.0, -50.0) + (rng.normal() * 20.0 * root);
            loop (local i: int = 0; i < this.currencies; i = i + 1) {
                s.fx[i] = rng.normal() * this.fx_vols[i] * root;
            }
            pnl[p] = this.value(&s) - base;
            total = total + pnl[p];
        }
        Sort.floats(pnl, paths);
        local tail: int = cast<int>(Math.floor((1.0 - confidence) * cast<float>(paths)));
        if (tail < 1) {
            tail = 1;
        }
        local es: float = 0.0;
        loop (local i: int = 0; i < tail; i = i + 1) {
            es = es + pnl[i];
        }
        local out: StressVar;
        out.var = -Stats.quantileSorted(pnl, paths, 1.0 - confidence);
        out.es = -(es / cast<float>(tail));
        out.worst = -pnl[0];
        out.mean = total / cast<float>(paths);
        out.paths = paths;
        free(cast<*void>(pnl));
        return out;
    }

    frame positionLabel(this: *StressBook, i: int) ret string {
        local p: *StressPosition = this.positions + i;
        if (p.label != nullptr) {
            return p.label;
        }
        if (p.kind == PositionKind.Equity) {
            return this.names[p.index];
        }
        if (p.kind == PositionKind.Option) {
            return p.is_call ? "call" : "put";
        }
        if (p.kind == PositionKind.Bond) {
            return p.credit ? "corporate bond" : "government bond";
        }
        return this.fx_names[p.index];
    }

    frame kindName(k: PositionKind) ret string {
        if (k == PositionKind.Equity) {
            return "equity";
        }
        if (k == PositionKind.Option) {
            return "option";
        }
        if (k == PositionKind.Bond) {
            return "bond";
        }
        return "fx";
    }
}

# Stylised historical scenarios (approximate peak-to-trough factor moves).
struct Scenarios {
    frame count() ret int {
        return 7;
    }

    frame make(name: string, market: float, vol: float, rate: float, twist: float, credit: float, fx: float, days: float) ret Scenario {
        local s: Scenario = StressBook.zero();
        s.name = name;
        s.market = market;
        s.vol_points = vol;
        s.rate_bp = rate;
        s.twist_bp = twist;
        s.credit_bp = credit;
        loop (local i: int = 0; i < MAX_FX; i = i + 1) {
            s.fx[i] = fx;
        }
        s.horizon_days = days;
        return s;
    }

    frame at(i: int) ret Scenario {
        if (i == 0) {
            return Scenarios.make("black_monday_1987", -0.2, 25.0, -50.0, 0.0, 30.0, 0.02, 1.0);
        }
        if (i == 1) {
            return Scenarios.make("lehman_2008", -0.25, 30.0, -100.0, 40.0, 250.0, -0.08, 20.0);
        }
        if (i == 2) {
            return Scenarios.make("covid_2020", -0.3, 45.0, -150.0, 50.0, 200.0, -0.05, 23.0);
        }
        if (i == 3) {
            return Scenarios.make("rates_2022", -0.15, 8.0, 250.0, -60.0, 60.0, -0.12, 180.0);
        }
        if (i == 4) {
            return Scenarios.make("taper_tantrum_2013", -0.05, 4.0, 100.0, 60.0, 30.0, -0.03, 40.0);
        }
        if (i == 5) {
            return Scenarios.make("dotcom_2000", -0.35, 15.0, -200.0, 80.0, 120.0, 0.0, 250.0);
        }
        return Scenarios.make("relief_rally", 0.1, -6.0, 25.0, 10.0, -40.0, 0.03, 5.0);
    }

    frame find(name: string) ret int {
        loop (local i: int = 0; i < Scenarios.count(); i = i + 1) {
            local s: Scenario = Scenarios.at(i);
            if (Text.equals(s.name, name)) {
                return i;
            }
        }
        return -1;
    }
}
