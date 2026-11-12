# Pairs trading and position sizing.
#
# PairsBacktest: rolling-window OLS hedge ratio of log prices, spread
# z-score, enter at |z| >= entry, exit when z crosses back inside `exit`,
# stop out at |z| >= stop; dollar-neutral legs, costs per unit of turnover,
# P&L marked daily. Reports trades, win rate, Sharpe, drawdown and the
# spread half-life from an AR(1) fit.
#
# Sizing: full and fractional Kelly for a return series, volatility
# targeting, and fixed-fractional position size for a stop distance.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";

export [PairsBacktest];
export [PairsConfig];
export [PairsResult];
export [Sizing];

struct PairsConfig {
    window: int,
    entry: float,
    exit: float,
    stop: float,
    cost_bps: float,
    capital: float,
}

struct PairsResult {
    trades: int,
    wins: int,
    stops: int,
    total_return: float,
    sharpe: float,
    max_drawdown: float,
    half_life: float,
    last_z: float,
    last_beta: float,
    exposure: float,
}

struct PairsBacktest {
    frame halfLife(spread: *float, n: int) ret float {
        # AR(1): ds_t = a + b s_{t-1}; half-life = -ln 2 / ln(1 + b).
        local mx: float = 0.0;
        local my: float = 0.0;
        loop (local t: int = 1; t < n; t = t + 1) {
            mx = mx + spread[t - 1];
            my = my + (spread[t] - spread[t - 1]);
        }
        local m: float = cast<float>(n - 1);
        mx = mx / m;
        my = my / m;
        local sxx: float = 0.0;
        local sxy: float = 0.0;
        loop (local t: int = 1; t < n; t = t + 1) {
            local x: float = spread[t - 1] - mx;
            sxx = sxx + (x * x);
            sxy = sxy + (x * ((spread[t] - spread[t - 1]) - my));
        }
        local b: float = sxx > 0.0 ? sxy / sxx : 0.0;
        if ((b >= 0.0) || (b <= -1.0)) {
            return 1000000.0;
        }
        return -Math.log(2.0) / Math.log(1.0 + b);
    }

    frame run(a: *float, b: *float, n: int, cfg: *PairsConfig) ret PairsResult {
        local r: PairsResult = PairsResult { trades: 0, wins: 0, stops: 0, total_return: 0.0, sharpe: 0.0, max_drawdown: 0.0, half_life: 0.0, last_z: 0.0, last_beta: 0.0, exposure: 0.0 };
        local w: int = cfg.window;
        if ((n <= (w + 2)) || (w < 5)) {
            return r;
        }
        local spread: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local daily: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local position: float = 0.0;
        local units_a: float = 0.0;
        local units_b: float = 0.0;
        local equity: float = cfg.capital;
        local peak: float = equity;
        local entry_equity: float = equity;
        local days: int = 0;
        local held: int = 0;
        local fee: float = cfg.cost_bps / 10000.0;
        loop (local t: int = w; t < n; t = t + 1) {
            # Rolling OLS of log a on log b over [t - w, t).
            local mx: float = 0.0;
            local my: float = 0.0;
            loop (local k: int = t - w; k < t; k = k + 1) {
                mx = mx + Math.log(b[k]);
                my = my + Math.log(a[k]);
            }
            mx = mx / cast<float>(w);
            my = my / cast<float>(w);
            local sxx: float = 0.0;
            local sxy: float = 0.0;
            loop (local k: int = t - w; k < t; k = k + 1) {
                local x: float = Math.log(b[k]) - mx;
                sxx = sxx + (x * x);
                sxy = sxy + (x * (Math.log(a[k]) - my));
            }
            local beta: float = sxx > 0.0 ? sxy / sxx : 1.0;
            local alpha: float = my - (beta * mx);
            local ss: float = 0.0;
            loop (local k: int = t - w; k < t; k = k + 1) {
                local e: float = Math.log(a[k]) - alpha - (beta * Math.log(b[k]));
                ss = ss + (e * e);
            }
            local sd: float = Math.sqrt(ss / cast<float>(w - 2));
            local s_now: float = Math.log(a[t]) - alpha - (beta * Math.log(b[t]));
            spread[t] = s_now;
            local z: float = sd > 0.0 ? s_now / sd : 0.0;
            r.last_z = z;
            r.last_beta = beta;
            # Mark yesterday's position to today's prices.
            local pnl: float = (units_a * (a[t] - a[t - 1])) + (units_b * (b[t] - b[t - 1]));
            equity = equity + pnl;
            daily[days] = pnl / Math.max(equity - pnl, 1.0);
            days = days + 1;
            peak = Math.max(peak, equity);
            r.max_drawdown = Math.max(r.max_drawdown, 1.0 - (equity / peak));
            local close: bool = false;
            if (position != 0.0) {
                held = held + 1;
                if (Math.abs(z) >= cfg.stop) {
                    close = true;
                    r.stops = r.stops + 1;
                } else if (((position > 0.0) && (z >= -cfg.exit)) || ((position < 0.0) && (z <= cfg.exit))) {
                    close = true;
                }
            }
            if (close) {
                local turnover: float = (Math.abs(units_a) * a[t]) + (Math.abs(units_b) * b[t]);
                equity = equity - (turnover * fee);
                if (equity > entry_equity) {
                    r.wins = r.wins + 1;
                }
                position = 0.0;
                units_a = 0.0;
                units_b = 0.0;
            } else if ((position == 0.0) && (Math.abs(z) >= cfg.entry) && (Math.abs(z) < cfg.stop)) {
                # Short the spread when z is high: sell a, buy beta of b.
                position = z > 0.0 ? -1.0 : 1.0;
                local leg: float = 0.5 * equity;
                units_a = (position * leg) / a[t];
                units_b = (-position * leg * beta) / b[t];
                local turnover: float = (Math.abs(units_a) * a[t]) + (Math.abs(units_b) * b[t]);
                equity = equity - (turnover * fee);
                entry_equity = equity;
                r.trades = r.trades + 1;
            }
        }
        r.total_return = (equity / cfg.capital) - 1.0;
        r.exposure = days > 0 ? cast<float>(held) / cast<float>(days) : 0.0;
        local mean: float = 0.0;
        loop (local i: int = 0; i < days; i = i + 1) {
            mean = mean + daily[i];
        }
        mean = mean / cast<float>(days);
        local var: float = 0.0;
        loop (local i: int = 0; i < days; i = i + 1) {
            var = var + ((daily[i] - mean) * (daily[i] - mean));
        }
        local sd: float = days > 1 ? Math.sqrt(var / cast<float>(days - 1)) : 0.0;
        r.sharpe = sd > 0.0 ? (mean / sd) * Math.sqrt(252.0) : 0.0;
        r.half_life = PairsBacktest.halfLife(spread + w, n - w);
        free(cast<*void>(spread));
        free(cast<*void>(daily));
        return r;
    }
}

struct Sizing {
    # Continuous Kelly fraction mu / sigma^2 for periodic excess returns.
    frame kelly(r: *float, n: int) ret float {
        local mean: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            mean = mean + r[i];
        }
        mean = mean / cast<float>(n);
        local var: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            var = var + ((r[i] - mean) * (r[i] - mean));
        }
        var = var / cast<float>(n - 1);
        return var > 0.0 ? mean / var : 0.0;
    }

    # Discrete Kelly for a bet paying `odds` to 1 with win probability p.
    frame kellyBet(p: float, odds: float) ret float {
        return odds > 0.0 ? ((p * (odds + 1.0)) - 1.0) / odds : 0.0;
    }

    # Expected log growth of a fraction f on a return series.
    frame growth(r: *float, n: int, f: float) ret float {
        local g: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local x: float = 1.0 + (f * r[i]);
            if (x <= 0.0) {
                return -1000000.0;
            }
            g = g + Math.log(x);
        }
        return g / cast<float>(n);
    }

    # Leverage that scales realized vol to `target` (annualised).
    frame volTarget(r: *float, n: int, target: float, periods_per_year: float, max_leverage: float) ret float {
        local var: float = 0.0;
        local mean: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            mean = mean + r[i];
        }
        mean = mean / cast<float>(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            var = var + ((r[i] - mean) * (r[i] - mean));
        }
        local vol: float = Math.sqrt((var / cast<float>(n - 1)) * periods_per_year);
        if (vol <= 0.0) {
            return max_leverage;
        }
        return Math.min(max_leverage, target / vol);
    }

    # Shares to buy so a stop at `stop_price` risks `risk_fraction` of equity.
    frame fixedFractional(equity: float, risk_fraction: float, entry_price: float, stop_price: float) ret float {
        # The parameter is not called `entry` (BUG-820).
        local entry: float = entry_price;
        local per_share: float = Math.abs(entry - stop_price);
        if (per_share <= 0.0) {
            return 0.0;
        }
        return Math.floor((equity * risk_fraction) / per_share);
    }
}
