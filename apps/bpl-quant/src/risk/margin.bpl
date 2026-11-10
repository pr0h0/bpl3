# Scenario-based (SPAN-style) portfolio margin.
#
# Each product (an underlying with futures-like delta positions and
# options on it) is revalued under the 16 standard SPAN scenarios: price
# moves of 0, +-1/3, +-2/3 and +-3/3 of the price scan range, each with
# volatility up and down by the vol scan range, plus two extreme moves of
# +-2 price ranges of which 35% counts. The product's scan risk is the
# worst scenario loss. Short options must carry at least the short option
# minimum per contract. Products in the same spread group earn an
# inter-commodity credit: a fraction of the smaller side of offsetting
# deltas. Total margin = sum(max(scan risk, short option minimum)) minus
# credits, floored at zero.

import [Math] from "std/math.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "../quant/black_scholes.bpl";

export [SpanBook];
export [SpanProduct];
export [SpanOption];
export [SpanResult];

global const MAX_PRODUCTS: int = 16;
global const MAX_OPTIONS: int = 64;

struct SpanProduct {
    name: string,
    price: float,
    vol: float,
    # Scan ranges: price as a fraction of price, vol in absolute points.
    price_range: float,
    vol_range: float,
    multiplier: float,
    futures: float,
    group: int,
    short_option_min: float,
}

struct SpanOption {
    product: int,
    is_call: bool,
    strike: float,
    expiry: float,
    quantity: float,
}

struct SpanResult {
    scan_risk: float[16],
    worst_scenario: int[16],
    product_margin: float[16],
    net_delta: float[16],
    credit: float,
    total: float,
    scenario_pnl: float[256],
}

struct SpanBook {
    products: SpanProduct[16],
    product_count: int,
    options: SpanOption[64],
    option_count: int,
    rate: float,
    # Credit rate for offsetting deltas inside a spread group.
    spread_credit: float,

    frame init(this: *SpanBook, rate: float, spread_credit: float) {
        this.product_count = 0;
        this.option_count = 0;
        this.rate = rate;
        this.spread_credit = spread_credit;
    }

    frame addProduct(this: *SpanBook, p: SpanProduct) ret int {
        if (this.product_count == MAX_PRODUCTS) {
            return -1;
        }
        this.products[this.product_count] = p;
        this.product_count = this.product_count + 1;
        return this.product_count - 1;
    }

    frame addOption(this: *SpanBook, o: SpanOption) ret int {
        if ((this.option_count == MAX_OPTIONS) || (o.product < 0) || (o.product >= this.product_count)) {
            return -1;
        }
        this.options[this.option_count] = o;
        this.option_count = this.option_count + 1;
        return this.option_count - 1;
    }

    # Scenario i in 0..15: (price fraction of range, vol sign, weight).
    frame scenario(i: int, move: *float, vol_sign: *float, weight: *float) {
        local moves: float[8] = [0.0, 0.0, 1.0, 1.0, -1.0, -1.0, 2.0, -2.0];
        if (i < 14) {
            local level: int = i / 2;
            # Levels: 0, +1/3, -1/3, +2/3, -2/3, +3/3, -3/3.
            local frac: float[7] = [0.0, 1.0 / 3.0, -1.0 / 3.0, 2.0 / 3.0, -2.0 / 3.0, 1.0, -1.0];
            *move = frac[level];
            *vol_sign = (i % 2) == 0 ? 1.0 : -1.0;
            *weight = 1.0;
            return;
        }
        *move = moves[(i - 14) + 6];
        *vol_sign = 0.0;
        *weight = 0.35;
    }

    frame optionValue(this: *SpanBook, o: *SpanOption, price: float, vol: float) ret float {
        local opt_spec: OptionSpec = OptionSpec.new(o.is_call ? OptionKind.Call : OptionKind.Put, price, o.strike, this.rate, 0.0, Math.max(vol, 0.01), o.expiry);
        return BlackScholes.price(&opt_spec);
    }

    # P&L of product `p` (futures plus its options) in scenario `i`.
    frame scenarioPnl(this: *SpanBook, p: int, i: int) ret float {
        local prod: *SpanProduct = &this.products[p];
        local move: float = 0.0;
        local vol_sign: float = 0.0;
        local weight: float = 0.0;
        SpanBook.scenario(i, &move, &vol_sign, &weight);
        local shocked: float = prod.price * (1.0 + (move * prod.price_range));
        local vol: float = prod.vol + (vol_sign * prod.vol_range);
        local pnl: float = prod.futures * (shocked - prod.price) * prod.multiplier;
        loop (local k: int = 0; k < this.option_count; k = k + 1) {
            local o: *SpanOption = &this.options[k];
            if (o.product != p) {
                continue;
            }
            local base: float = this.optionValue(o, prod.price, prod.vol);
            local now: float = this.optionValue(o, shocked, vol);
            pnl = pnl + (o.quantity * (now - base) * prod.multiplier);
        }
        return pnl * weight;
    }

    frame netDelta(this: *SpanBook, p: int) ret float {
        local prod: *SpanProduct = &this.products[p];
        local d: float = prod.futures;
        loop (local k: int = 0; k < this.option_count; k = k + 1) {
            local o: *SpanOption = &this.options[k];
            if (o.product != p) {
                continue;
            }
            local opt_spec: OptionSpec = OptionSpec.new(o.is_call ? OptionKind.Call : OptionKind.Put, prod.price, o.strike, this.rate, 0.0, prod.vol, o.expiry);
            d = d + (o.quantity * BlackScholes.greeks(&opt_spec).delta);
        }
        return d;
    }

    frame shortOptions(this: *SpanBook, p: int) ret float {
        local n: float = 0.0;
        loop (local k: int = 0; k < this.option_count; k = k + 1) {
            if ((this.options[k].product == p) && (this.options[k].quantity < 0.0)) {
                n = n - this.options[k].quantity;
            }
        }
        return n;
    }

    # Fills `r` in place (the result is a few KB; see BUG-803).
    frame compute(this: *SpanBook, r: *SpanResult) {
        r.credit = 0.0;
        r.total = 0.0;
        loop (local p: int = 0; p < this.product_count; p = p + 1) {
            local worst: float = 0.0;
            local worst_i: int = 0;
            loop (local i: int = 0; i < 16; i = i + 1) {
                local pnl: float = this.scenarioPnl(p, i);
                r.scenario_pnl[(p * 16) + i] = pnl;
                if (-pnl > worst) {
                    worst = -pnl;
                    worst_i = i;
                }
            }
            r.scan_risk[p] = worst;
            r.worst_scenario[p] = worst_i;
            local som: float = this.shortOptions(p) * this.products[p].short_option_min;
            r.product_margin[p] = Math.max(worst, som);
            r.net_delta[p] = this.netDelta(p);
            r.total = r.total + r.product_margin[p];
        }
        # Inter-commodity credit per spread group: offset long against short
        # delta value (delta x price x multiplier x price range).
        loop (local g: int = 1; g <= MAX_PRODUCTS; g = g + 1) {
            local longs: float = 0.0;
            local shorts: float = 0.0;
            loop (local p: int = 0; p < this.product_count; p = p + 1) {
                local prod: *SpanProduct = &this.products[p];
                if (prod.group != g) {
                    continue;
                }
                local risk: float = r.net_delta[p] * prod.price * prod.multiplier * prod.price_range;
                if (risk > 0.0) {
                    longs = longs + risk;
                } else {
                    shorts = shorts - risk;
                }
            }
            r.credit = r.credit + (this.spread_credit * Math.min(longs, shorts));
        }
        r.total = Math.max(0.0, r.total - r.credit);
    }

    frame scenarioLabel(i: int) ret string {
        local labels: string[16] = ["unch vol up", "unch vol down", "+1/3 vol up", "+1/3 vol down", "-1/3 vol up", "-1/3 vol down", "+2/3 vol up", "+2/3 vol down", "-2/3 vol up", "-2/3 vol down", "+3/3 vol up", "+3/3 vol down", "-3/3 vol up", "-3/3 vol down", "+2x extreme", "-2x extreme"];
        return labels[i];
    }
}
