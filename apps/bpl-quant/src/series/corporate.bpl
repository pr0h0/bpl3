# Corporate actions and liquidity measures over bar series.
#
# Corporate actions: splits (ratio, e.g. 2 for a 2-for-1) and cash
# dividends with an ex-date. back-adjust() rewrites history so prices are
# comparable across the action (ratio method: prices before the ex-date
# are multiplied by the cumulative factor, volumes divided by the split
# ratio). totalReturn() builds a total-return index that reinvests
# dividends on their ex-dates.
#
# Liquidity: Amihud illiquidity (|r| / dollar volume), Roll's implied
# spread from the serial covariance of price changes, Corwin-Schultz
# high-low spread, Kyle's lambda (regression of price change on signed
# volume) and a bulk-volume VPIN (order-flow toxicity).

import [Math] from "std/math.bpl";
import [BarSeries] from "./bars.bpl";
import [Special] from "../math/special.bpl";

export [CorporateAction];
export [ActionKind];
export [Corporate];
export [Liquidity];

enum ActionKind {
    Split,
    Dividend,
}

struct CorporateAction {
    kind: ActionKind,
    # Bar time of the ex-date (the first bar trading ex).
    time: long,
    # Split ratio (new shares per old share) or dividend per share.
    value: float,
}

struct Corporate {
    # Index of the first bar with time >= t (len if none).
    frame firstAtOrAfter(s: *BarSeries, t: long) ret int {
        local lo: int = 0;
        local hi: int = s.len;
        loop (lo < hi) {
            local mid: int = (lo + hi) / 2;
            if (s.time[mid] < t) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    # Price adjustment factor for one action: split -> 1 / ratio;
    # dividend -> 1 - D / close of the bar before the ex-date.
    frame factor(s: *BarSeries, a: *CorporateAction, ex: int) ret float {
        if (a.kind == ActionKind.Split) {
            return a.value > 0.0 ? 1.0 / a.value : 1.0;
        }
        if (ex <= 0) {
            return 1.0;
        }
        local prev: float = s.close[ex - 1];
        return prev > 0.0 ? 1.0 - (a.value / prev) : 1.0;
    }

    # Back-adjusts `s` in place for `actions` (any order); returns the
    # number of actions applied (those whose ex-date falls inside the data).
    frame backAdjust(s: *BarSeries, actions: *CorporateAction, count: int) ret int {
        local applied: int = 0;
        loop (local k: int = 0; k < count; k = k + 1) {
            local a: *CorporateAction = actions + k;
            local ex: int = Corporate.firstAtOrAfter(s, a.time);
            if ((ex <= 0) || (ex >= s.len)) {
                continue;
            }
            local f: float = Corporate.factor(s, a, ex);
            loop (local i: int = 0; i < ex; i = i + 1) {
                s.open[i] = s.open[i] * f;
                s.high[i] = s.high[i] * f;
                s.low[i] = s.low[i] * f;
                s.close[i] = s.close[i] * f;
                s.vwap[i] = s.vwap[i] * f;
                if (a.kind == ActionKind.Split) {
                    s.volume[i] = s.volume[i] * a.value;
                }
            }
            applied = applied + 1;
        }
        return applied;
    }

    # Total-return index starting at `base`: price return plus dividends
    # reinvested at the ex-date close; splits use the split ratio.
    frame totalReturn(s: *BarSeries, actions: *CorporateAction, count: int, base: float, out: *float) {
        if (s.len == 0) {
            return;
        }
        out[0] = base;
        loop (local i: int = 1; i < s.len; i = i + 1) {
            local price_now: float = s.close[i];
            local income: float = 0.0;
            local ratio: float = 1.0;
            loop (local k: int = 0; k < count; k = k + 1) {
                local ex: int = Corporate.firstAtOrAfter(s, actions[k].time);
                if (ex == i) {
                    if (actions[k].kind == ActionKind.Dividend) {
                        income = income + actions[k].value;
                    } else if (actions[k].value > 0.0) {
                        ratio = ratio * actions[k].value;
                    }
                }
            }
            local growth: float = ((price_now * ratio) + (income * ratio)) / s.close[i - 1];
            out[i] = out[i - 1] * growth;
        }
    }

    # Trailing 12-month (`window` seconds) dividend yield at the last bar.
    frame trailingYield(s: *BarSeries, actions: *CorporateAction, count: int, window: long) ret float {
        if (s.len == 0) {
            return 0.0;
        }
        local now: long = s.time[s.len - 1];
        local paid: float = 0.0;
        loop (local k: int = 0; k < count; k = k + 1) {
            if ((actions[k].kind == ActionKind.Dividend) && (actions[k].time <= now) && (actions[k].time > (now - window))) {
                paid = paid + actions[k].value;
            }
        }
        return paid / s.close[s.len - 1];
    }
}

struct Liquidity {
    # Mean |return| / dollar volume, scaled by 1e6.
    frame amihud(s: *BarSeries) ret float {
        local sum: float = 0.0;
        local n: int = 0;
        loop (local i: int = 1; i < s.len; i = i + 1) {
            local dollar: float = s.close[i] * s.volume[i];
            if (dollar > 0.0) {
                sum = sum + (Math.abs((s.close[i] / s.close[i - 1]) - 1.0) / dollar);
                n = n + 1;
            }
        }
        return n > 0 ? (sum / cast<float>(n)) * 1000000.0 : 0.0;
    }

    # Roll (1984): spread = 2 sqrt(-cov(dp_t, dp_{t-1})); 0 when the
    # covariance is positive. Returned as a fraction of the mean price.
    frame roll(prices: *float, n: int) ret float {
        if (n < 3) {
            return 0.0;
        }
        local m: int = n - 1;
        local mean_a: float = 0.0;
        local mean_b: float = 0.0;
        loop (local i: int = 1; i < m; i = i + 1) {
            mean_a = mean_a + (prices[i + 1] - prices[i]);
            mean_b = mean_b + (prices[i] - prices[i - 1]);
        }
        local k: float = cast<float>(m - 1);
        mean_a = mean_a / k;
        mean_b = mean_b / k;
        local cov: float = 0.0;
        local avg_price: float = 0.0;
        loop (local i: int = 1; i < m; i = i + 1) {
            cov = cov + (((prices[i + 1] - prices[i]) - mean_a) * ((prices[i] - prices[i - 1]) - mean_b));
            avg_price = avg_price + prices[i];
        }
        cov = cov / k;
        avg_price = avg_price / k;
        if (cov >= 0.0) {
            return 0.0;
        }
        return (2.0 * Math.sqrt(-cov)) / avg_price;
    }

    # Corwin-Schultz (2012) spread estimate averaged over two-bar windows.
    frame corwinSchultz(s: *BarSeries) ret float {
        local k: float = 3.0 - (2.0 * Math.sqrt(2.0));
        local total: float = 0.0;
        local n: int = 0;
        loop (local i: int = 1; i < s.len; i = i + 1) {
            local b1: float = Math.log(s.high[i] / s.low[i]);
            local b0: float = Math.log(s.high[i - 1] / s.low[i - 1]);
            local beta: float = (b1 * b1) + (b0 * b0);
            local hi: float = Math.max(s.high[i], s.high[i - 1]);
            local lo: float = Math.min(s.low[i], s.low[i - 1]);
            local g: float = Math.log(hi / lo);
            local gamma: float = g * g;
            local alpha: float = ((Math.sqrt(2.0 * beta) - Math.sqrt(beta)) / k) - Math.sqrt(gamma / k);
            local spread: float = (2.0 * (Math.exp(alpha) - 1.0)) / (1.0 + Math.exp(alpha));
            total = total + Math.max(spread, 0.0);
            n = n + 1;
        }
        return n > 0 ? total / cast<float>(n) : 0.0;
    }

    # Kyle's lambda: OLS slope of price change on signed volume.
    frame kyleLambda(dp: *float, signed_volume: *float, n: int) ret float {
        local mx: float = 0.0;
        local my: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            mx = mx + signed_volume[i];
            my = my + dp[i];
        }
        mx = mx / cast<float>(n);
        my = my / cast<float>(n);
        local sxx: float = 0.0;
        local sxy: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            sxx = sxx + ((signed_volume[i] - mx) * (signed_volume[i] - mx));
            sxy = sxy + ((signed_volume[i] - mx) * (dp[i] - my));
        }
        return sxx > 0.0 ? sxy / sxx : 0.0;
    }

    # Bulk volume classification VPIN over `buckets` equal-volume buckets
    # using bar returns: buy fraction = Phi(r / sigma).
    frame vpin(s: *BarSeries, buckets: int) ret float {
        if ((s.len < 3) || (buckets < 1)) {
            return 0.0;
        }
        local total_volume: float = 0.0;
        local mean: float = 0.0;
        loop (local i: int = 1; i < s.len; i = i + 1) {
            total_volume = total_volume + s.volume[i];
            mean = mean + (s.close[i] - s.close[i - 1]);
        }
        mean = mean / cast<float>(s.len - 1);
        local var: float = 0.0;
        loop (local i: int = 1; i < s.len; i = i + 1) {
            local d: float = (s.close[i] - s.close[i - 1]) - mean;
            var = var + (d * d);
        }
        local sd: float = Math.sqrt(var / cast<float>(s.len - 2));
        if ((sd <= 0.0) || (total_volume <= 0.0)) {
            return 0.0;
        }
        local size: float = total_volume / cast<float>(buckets);
        local imbalance: float = 0.0;
        local bucket_buy: float = 0.0;
        local bucket_sell: float = 0.0;
        local filled: float = 0.0;
        local done: int = 0;
        loop (local i: int = 1; (i < s.len) && (done < buckets); i = i + 1) {
            local frac: float = Special.normCdf((s.close[i] - s.close[i - 1]) / sd);
            local left: float = s.volume[i];
            loop ((left > 0.0) && (done < buckets)) {
                local take: float = Math.min(left, size - filled);
                bucket_buy = bucket_buy + (take * frac);
                bucket_sell = bucket_sell + (take * (1.0 - frac));
                filled = filled + take;
                left = left - take;
                if (filled >= (size - 0.0000001)) {
                    imbalance = imbalance + Math.abs(bucket_buy - bucket_sell);
                    bucket_buy = 0.0;
                    bucket_sell = 0.0;
                    filled = 0.0;
                    done = done + 1;
                }
            }
        }
        return done > 0 ? imbalance / (cast<float>(done) * size) : 0.0;
    }
}
