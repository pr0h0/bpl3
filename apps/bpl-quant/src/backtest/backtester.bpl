# Vectorised backtester.
#
# Input: bar closes and a target position per bar (NaN = keep the previous
# target). A target set at bar i is traded at bar i+1's open (no look-ahead),
# paying commission (bps of notional) plus half the spread as slippage.
# Drift rebalances smaller than `rebalance_band` of equity are skipped.
# Output: equity curve, trades, and performance statistics.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Stats] from "../math/stats.bpl";
import [BarSeries] from "../series/bars.bpl";
import [Indicators], [MacdOut], [BandsOut] from "../series/indicators.bpl";
import [JsonWriter] from "../core/json_writer.bpl";

export [Backtest];
export [BacktestConfig];
export [BacktestReport];
export [Strategies];

struct BacktestConfig {
    initial_cash: float,
    commission_bps: float,
    spread_bps: float,
    max_leverage: float,
    periods_per_year: float,
    # Skip rebalances smaller than this fraction of equity (sign flips always trade).
    rebalance_band: float,
}

struct TradeRecord {
    bar: int,
    quantity: float,
    price: float,
    cost: float,
}

struct BacktestReport {
    bars: int,
    equity: *float,
    holdings: *float,
    trades: *TradeRecord,
    trade_count: int,
    trade_cap: int,
    final_equity: float,
    total_return: float,
    annual_return: float,
    annual_vol: float,
    sharpe: float,
    sortino: float,
    max_drawdown: float,
    calmar: float,
    win_rate: float,
    profit_factor: float,
    exposure: float,
    turnover: float,
    costs: float,
    round_trips: int,

    frame destroy(this: *BacktestReport) {
        if (this.equity != nullptr) {
            free(cast<*void>(this.equity));
            free(cast<*void>(this.holdings));
            free(cast<*void>(this.trades));
            this.equity = nullptr;
        }
    }

    frame addTrade(this: *BacktestReport, t: TradeRecord) {
        if (this.trade_count == this.trade_cap) {
            local next_cap: int = this.trade_cap * 2;
            local next: *TradeRecord = cast<*TradeRecord>(malloc(cast<long>(next_cap) * sizeof(TradeRecord)));
            loop (local i: int = 0; i < this.trade_count; i = i + 1) {
                next[i] = this.trades[i];
            }
            free(cast<*void>(this.trades));
            this.trades = next;
            this.trade_cap = next_cap;
        }
        this.trades[this.trade_count] = t;
        this.trade_count = this.trade_count + 1;
    }

    frame writeJson(this: *BacktestReport, w: *JsonWriter, curve_points: int) {
        w.fieldInt("bars", cast<long>(this.bars));
        w.fieldNum("final_equity", this.final_equity);
        w.fieldNum("total_return", this.total_return);
        w.fieldNum("annual_return", this.annual_return);
        w.fieldNum("annual_vol", this.annual_vol);
        w.fieldNum("sharpe", this.sharpe);
        w.fieldNum("sortino", this.sortino);
        w.fieldNum("max_drawdown", this.max_drawdown);
        w.fieldNum("calmar", this.calmar);
        w.fieldNum("win_rate", this.win_rate);
        w.fieldNum("profit_factor", this.profit_factor);
        w.fieldNum("exposure", this.exposure);
        w.fieldNum("turnover", this.turnover);
        w.fieldNum("costs", this.costs);
        w.fieldInt("trades", cast<long>(this.trade_count));
        w.fieldInt("round_trips", cast<long>(this.round_trips));
        if ((curve_points > 0) && (this.bars > 0)) {
            w.key("equity_curve").beginArray();
            local step: int = this.bars / curve_points;
            if (step < 1) {
                step = 1;
            }
            local i: int = 0;
            loop (i < this.bars) {
                w.num(this.equity[i]);
                i = i + step;
            }
            w.endArray();
        }
    }
}

struct Backtest {
    frame defaults() ret BacktestConfig {
        return BacktestConfig { initial_cash: 100000.0, commission_bps: 1.0, spread_bps: 2.0, max_leverage: 2.0, periods_per_year: 252.0, rebalance_band: 0.02 };
    }

    # targets[i] is a fraction of equity (1 = fully long, -1 = fully short).
    frame run(bars: *BarSeries, targets: *float, cfg: *BacktestConfig) ret BacktestReport {
        local n: int = bars.len;
        local r: BacktestReport;
        r.bars = n;
        r.equity = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        r.holdings = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        r.trade_cap = 64;
        r.trade_count = 0;
        r.trades = cast<*TradeRecord>(malloc(cast<long>(r.trade_cap) * sizeof(TradeRecord)));
        r.costs = 0.0;
        r.round_trips = 0;
        local cash: float = cfg.initial_cash;
        local shares: float = 0.0;
        local target: float = 0.0;
        local traded_notional: float = 0.0;
        local exposed: int = 0;
        local entry_value: float = 0.0;
        local wins: int = 0;
        local losses: int = 0;
        local gross_win: float = 0.0;
        local gross_loss: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            # Execute the target decided at the previous bar at this bar's open.
            if (i > 0) {
                local t: float = targets[i - 1];
                if (t == t) {
                    target = Math.clamp(t, -cfg.max_leverage, cfg.max_leverage);
                }
                local px: float = bars.open[i];
                local equity_now: float = cash + (shares * px);
                local wanted: float = (equity_now * target) / px;
                local delta: float = wanted - shares;
                local flips: bool = ((shares > 0.0) && (wanted <= 0.0)) || ((shares < 0.0) && (wanted >= 0.0)) || ((shares == 0.0) && (wanted != 0.0));
                local material: bool = Math.abs(delta * px) > (cfg.rebalance_band * Math.abs(equity_now));
                if ((Math.abs(delta * px) > 0.01) && (flips || material)) {
                    local slip: float = (px * cfg.spread_bps) / 20000.0;
                    local fill: float = delta > 0.0 ? px + slip : px - slip;
                    local commission: float = (Math.abs(delta * fill) * cfg.commission_bps) / 10000.0;
                    local was_flat: bool = shares == 0.0;
                    local closing: bool = ((shares > 0.0) && (wanted <= 0.0)) || ((shares < 0.0) && (wanted >= 0.0));
                    if (closing) {
                        local pnl: float = equity_now - entry_value;
                        if (pnl > 0.0) {
                            wins = wins + 1;
                            gross_win = gross_win + pnl;
                        } else {
                            losses = losses + 1;
                            gross_loss = gross_loss - pnl;
                        }
                        r.round_trips = r.round_trips + 1;
                    }
                    cash = cash - (delta * fill) - commission;
                    shares = wanted;
                    r.costs = r.costs + commission + (Math.abs(delta) * slip);
                    traded_notional = traded_notional + Math.abs(delta * fill);
                    if ((was_flat || closing) && (shares != 0.0)) {
                        entry_value = cash + (shares * px);
                    }
                    r.addTrade(TradeRecord { bar: i, quantity: delta, price: fill, cost: commission });
                }
            }
            r.holdings[i] = shares;
            r.equity[i] = cash + (shares * bars.close[i]);
            if (shares != 0.0) {
                exposed = exposed + 1;
            }
        }
        Backtest.statistics(&r, cfg, traded_notional, exposed);
        local trips: int = wins + losses;
        r.win_rate = trips > 0 ? cast<float>(wins) / cast<float>(trips) : 0.0;
        r.profit_factor = gross_loss > 0.0 ? gross_win / gross_loss : (gross_win > 0.0 ? 1000000.0 : 0.0);
        return r;
    }

    frame statistics(r: *BacktestReport, cfg: *BacktestConfig, traded_notional: float, exposed: int) {
        local n: int = r.bars;
        r.final_equity = n > 0 ? r.equity[n - 1] : cfg.initial_cash;
        r.total_return = (r.final_equity / cfg.initial_cash) - 1.0;
        local rets: *float = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        local m: int = 0;
        loop (local i: int = 1; i < n; i = i + 1) {
            if (r.equity[i - 1] > 0.0) {
                rets[m] = (r.equity[i] / r.equity[i - 1]) - 1.0;
                m = m + 1;
            }
        }
        local years: float = cast<float>(n) / cfg.periods_per_year;
        r.annual_return = (years > 0.0) && (r.final_equity > 0.0) ? Math.pow(r.final_equity / cfg.initial_cash, 1.0 / years) - 1.0 : 0.0;
        r.annual_vol = m > 1 ? Stats.stddev(rets, m) * Math.sqrt(cfg.periods_per_year) : 0.0;
        r.sharpe = m > 1 ? Stats.sharpe(rets, m, 0.0, cfg.periods_per_year) : 0.0;
        r.sortino = m > 1 ? Stats.sortino(rets, m, 0.0, cfg.periods_per_year) : 0.0;
        r.max_drawdown = Stats.maxDrawdown(r.equity, n);
        r.calmar = r.max_drawdown > 0.0 ? r.annual_return / r.max_drawdown : 0.0;
        r.exposure = n > 0 ? cast<float>(exposed) / cast<float>(n) : 0.0;
        r.turnover = years > 0.0 ? traded_notional / cfg.initial_cash / years : 0.0;
        free(cast<*void>(rets));
    }
}

# Built-in strategies producing target positions.
struct Strategies {
    frame targets(n: int) ret *float {
        local out: *float = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = 0.0 / 0.0;
        }
        return out;
    }

    frame smaCross(bars: *BarSeries, fast: int, slow: int, allow_short: bool) ret *float {
        local n: int = bars.len;
        local out: *float = Strategies.targets(n);
        local f: *float = Indicators.alloc(n);
        local s: *float = Indicators.alloc(n);
        Indicators.sma(bars.close, n, fast, f);
        Indicators.sma(bars.close, n, slow, s);
        loop (local i: int = 0; i < n; i = i + 1) {
            if ((f[i] == f[i]) && (s[i] == s[i])) {
                out[i] = f[i] > s[i] ? 1.0 : (allow_short ? -1.0 : 0.0);
            }
        }
        free(cast<*void>(f));
        free(cast<*void>(s));
        return out;
    }

    # RSI mean reversion: long below `lower`, flat above 50; short above `upper`.
    frame rsiReversion(bars: *BarSeries, period: int, lower: float, upper: float) ret *float {
        local n: int = bars.len;
        local out: *float = Strategies.targets(n);
        local r: *float = Indicators.alloc(n);
        Indicators.rsi(bars.close, n, period, r);
        local pos: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (r[i] != r[i]) {
                continue;
            }
            if (r[i] < lower) {
                pos = 1.0;
            } else if (r[i] > upper) {
                pos = -1.0;
            } else if (((pos > 0.0) && (r[i] > 50.0)) || ((pos < 0.0) && (r[i] < 50.0))) {
                pos = 0.0;
            }
            out[i] = pos;
        }
        free(cast<*void>(r));
        return out;
    }

    # Bollinger breakout: long on a close above the upper band until the middle.
    frame bollingerBreakout(bars: *BarSeries, period: int, k: float) ret *float {
        local n: int = bars.len;
        local out: *float = Strategies.targets(n);
        local b: BandsOut = Indicators.bollinger(bars.close, n, period, k);
        local pos: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (b.upper[i] != b.upper[i]) {
                continue;
            }
            if (bars.close[i] > b.upper[i]) {
                pos = 1.0;
            } else if (bars.close[i] < b.lower[i]) {
                pos = -1.0;
            } else if (((pos > 0.0) && (bars.close[i] < b.middle[i])) || ((pos < 0.0) && (bars.close[i] > b.middle[i]))) {
                pos = 0.0;
            }
            out[i] = pos;
        }
        b.destroy();
        return out;
    }

    # MACD histogram sign with a volatility-scaled position size.
    frame macdTrend(bars: *BarSeries, target_vol: float) ret *float {
        local n: int = bars.len;
        local out: *float = Strategies.targets(n);
        local m: MacdOut = Indicators.macd(bars.close, n, 12, 26, 9);
        local vol: *float = Indicators.alloc(n);
        Indicators.realizedVol(bars.close, n, 20, 252.0, vol);
        loop (local i: int = 0; i < n; i = i + 1) {
            if ((m.histogram[i] != m.histogram[i]) || (vol[i] != vol[i]) || (vol[i] <= 0.0)) {
                continue;
            }
            local size: float = Math.min(2.0, target_vol / vol[i]);
            out[i] = m.histogram[i] > 0.0 ? size : -size;
        }
        m.destroy();
        free(cast<*void>(vol));
        return out;
    }

    # Time-series momentum: sign of the trailing `lookback` return.
    frame momentum(bars: *BarSeries, lookback: int) ret *float {
        local n: int = bars.len;
        local out: *float = Strategies.targets(n);
        loop (local i: int = lookback; i < n; i = i + 1) {
            out[i] = bars.close[i] > bars.close[i - lookback] ? 1.0 : -1.0;
        }
        return out;
    }

    frame buyAndHold(bars: *BarSeries) ret *float {
        local out: *float = Strategies.targets(bars.len);
        if (bars.len > 0) {
            out[0] = 1.0;
        }
        return out;
    }

    # Grid search over SMA windows; returns the best Sharpe and writes the windows.
    frame optimizeSma(bars: *BarSeries, cfg: *BacktestConfig, best_fast: *int, best_slow: *int) ret float {
        local best: float = -1000000.0;
        local fasts: int[6] = [5, 10, 15, 20, 30, 40];
        local slows: int[6] = [30, 50, 75, 100, 150, 200];
        *best_fast = 0;
        *best_slow = 0;
        loop (local a: int = 0; a < 6; a = a + 1) {
            loop (local b: int = 0; b < 6; b = b + 1) {
                if ((fasts[a] >= slows[b]) || (slows[b] >= bars.len)) {
                    continue;
                }
                local t: *float = Strategies.smaCross(bars, fasts[a], slows[b], true);
                local r: BacktestReport = Backtest.run(bars, t, cfg);
                if (r.sharpe > best) {
                    best = r.sharpe;
                    *best_fast = fasts[a];
                    *best_slow = slows[b];
                }
                r.destroy();
                free(cast<*void>(t));
            }
        }
        return best;
    }
}
