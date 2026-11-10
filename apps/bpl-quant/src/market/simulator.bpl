# Synthetic order-flow generator.
#
# Produces a reproducible stream of limit, market, IOC and stop orders around
# a mean-reverting fair value, with occasional cancels and replaces. Used by
# the self-test, the in-process benchmark and the /sim endpoints.

import [Math] from "std/math.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [Side], [OrderType], [TimeInForce], [OrderStatus] from "./order.bpl";
import [Engine], [OrderRequest], [ExecReport] from "./engine.bpl";
import [LVec] from "../core/vec.bpl";

export [FlowSimulator];
export [SimSummary];

struct SimSummary {
    orders: long,
    cancels: long,
    replaces: long,
    trades: long,
    volume: long,
    rejected: long,
    resting: long,
    final_fair: float,
}

struct FlowSimulator {
    rng: Xoshiro,
    symbol: int,
    fair: float,
    anchor: float,
    tick: long,
    vol: float,
    accounts: int,
    live_ids: LVec,
    market_ratio: float,
    cancel_ratio: float,
    stop_ratio: float,

    frame new(seed: u64, symbol: int, fair: float) ret FlowSimulator {
        local s: FlowSimulator;
        s.rng = Xoshiro.new(seed);
        s.symbol = symbol;
        s.fair = fair;
        s.anchor = fair;
        s.tick = 100;
        s.vol = 0.0008;
        s.accounts = 50;
        s.live_ids = LVec.new(1024);
        s.market_ratio = 0.08;
        s.cancel_ratio = 0.25;
        s.stop_ratio = 0.02;
        return s;
    }

    frame destroy(this: *FlowSimulator) {
        this.live_ids.destroy();
    }

    # Ornstein-Uhlenbeck step of the fair value in log space.
    frame stepFair(this: *FlowSimulator) {
        local x: float = Math.log(this.fair / this.anchor);
        x = (x - (0.01 * x)) + (this.vol * this.rng.normal());
        this.fair = this.anchor * Math.exp(x);
    }

    frame priceTicks(this: *FlowSimulator, price: float) ret long {
        local t: long = cast<long>((price * 10000.0) + 0.5);
        local snapped: long = (t / this.tick) * this.tick;
        return snapped < this.tick ? this.tick : snapped;
    }

    frame removeLive(this: *FlowSimulator, pos: int) {
        this.live_ids.data[pos] = this.live_ids.data[this.live_ids.len - 1];
        this.live_ids.len = this.live_ids.len - 1;
    }

    # Runs `count` events against the engine and summarizes the outcome.
    frame run(this: *FlowSimulator, engine: *Engine, count: int) ret SimSummary {
        local sum: SimSummary = SimSummary { orders: 0, cancels: 0, replaces: 0, trades: 0, volume: 0, rejected: 0, resting: 0, final_fair: 0.0 };
        loop (local i: int = 0; i < count; i = i + 1) {
            this.stepFair();
            local u: float = this.rng.nextFloat();
            if ((u < this.cancel_ratio) && (this.live_ids.len > 0)) {
                local pos: int = this.rng.range(0, this.live_ids.len);
                local id: long = this.live_ids.data[pos];
                this.removeLive(pos);
                if (this.rng.chance(0.3)) {
                    local o_price: float = this.fair * (1.0 + (0.002 * this.rng.normal()));
                    local r: ExecReport = engine.replace(id, this.priceTicks(o_price), cast<long>(this.rng.range(1, 20)) * 10);
                    if (r.resting) {
                        this.live_ids.push(r.order_id);
                    }
                    sum.replaces = sum.replaces + 1;
                    sum.trades = sum.trades + cast<long>(r.trades);
                    sum.volume = sum.volume + r.filled;
                } else {
                    if (engine.cancel(id)) {
                        sum.cancels = sum.cancels + 1;
                    }
                }
                continue;
            }
            local side: Side = this.rng.chance(0.5) ? Side.Buy : Side.Sell;
            local qty: long = cast<long>(this.rng.range(1, 50)) * 10;
            local account: int = this.rng.range(0, this.accounts);
            local req: OrderRequest = OrderRequest.limit(this.symbol, account, side, 0, qty);
            local v: float = this.rng.nextFloat();
            if (v < this.market_ratio) {
                req.kind = OrderType.Market;
                req.tif = TimeInForce.ImmediateOrCancel;
            } else if (v < (this.market_ratio + this.stop_ratio)) {
                req.kind = OrderType.Stop;
                local offset: float = 0.004 + (0.004 * this.rng.nextFloat());
                req.stop_price = this.priceTicks(side == Side.Buy ? this.fair * (1.0 + offset) : this.fair * (1.0 - offset));
            } else {
                # Passive orders sit a few ticks away from fair; some cross.
                local dist: float = (Math.abs(this.rng.normal()) * 0.0015) - 0.0003;
                local px: float = side == Side.Buy ? this.fair * (1.0 - dist) : this.fair * (1.0 + dist);
                req.price = this.priceTicks(px);
                local w: float = this.rng.nextFloat();
                if (w < 0.05) {
                    req.tif = TimeInForce.ImmediateOrCancel;
                } else if (w < 0.07) {
                    req.tif = TimeInForce.FillOrKill;
                } else if (w < 0.15) {
                    req.tif = TimeInForce.Day;
                }
            }
            local r: ExecReport = engine.submit(&req);
            sum.orders = sum.orders + 1;
            sum.trades = sum.trades + cast<long>(r.trades);
            sum.volume = sum.volume + r.filled;
            if (r.status == OrderStatus.Rejected) {
                sum.rejected = sum.rejected + 1;
            }
            if (r.resting || (r.status == OrderStatus.Pending)) {
                this.live_ids.push(r.order_id);
            }
        }
        # Drop ids that were filled or cancelled by other orders.
        local i: int = 0;
        loop (i < this.live_ids.len) {
            if (engine.findOrder(this.live_ids.data[i]) == nullptr) {
                this.removeLive(i);
            } else {
                i = i + 1;
            }
        }
        sum.resting = cast<long>(this.live_ids.len);
        sum.final_fair = this.fair;
        return sum;
    }
}
