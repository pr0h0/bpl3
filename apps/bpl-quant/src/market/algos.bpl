# Execution algorithms and a market-making agent, run against the live
# matching engine with simulated background flow.
#
# TWAP slices a parent order evenly in time, VWAP follows a U-shaped
# intraday volume profile, POV trades a fixed share of observed volume.
# Each reports implementation shortfall against the arrival mid.
# The Avellaneda-Stoikov market maker quotes around a reservation price
# skewed by inventory and tracks P&L and inventory risk.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Side], [OrderType], [TimeInForce], [Ticks], [Trade] from "./order.bpl";
import [Engine], [OrderRequest], [ExecReport] from "./engine.bpl";
import [OrderBook] from "./book.bpl";
import [FlowSimulator], [SimSummary] from "./simulator.bpl";

export [ExecAlgo];
export [AlgoKind];
export [AlgoReport];
export [MarketMaker];
export [MakerReport];

enum AlgoKind {
    Twap,
    Vwap,
    Pov,
}

struct AlgoReport {
    target: long,
    filled: long,
    notional: float,
    average_price: float,
    arrival_mid: float,
    shortfall_bps: float,
    slices: int,
    child_orders: int,
    market_volume: long,
    participation: float,
}

struct ExecAlgo {
    frame mid(b: *OrderBook) ret float {
        return b.mid() / 10000.0;
    }

    # U-shaped volume profile weight for slice i of n.
    frame vwapWeight(i: int, n: int) ret float {
        local x: float = (cast<float>(i) + 0.5) / cast<float>(n);
        return 1.0 + (1.5 * (x - 0.5) * (x - 0.5) * 4.0);
    }

    # Sends one aggressive child order for `qty` (marketable limit with a cap).
    frame child(e: *Engine, symbol: int, account: int, side: Side, qty: long, cap_bps: float, report: *AlgoReport) {
        if (qty <= 0) {
            return;
        }
        local b: *OrderBook = e.book(symbol);
        local ref: float = ExecAlgo.mid(b);
        local limit: float = side == Side.Buy ? ref * (1.0 + (cap_bps / 10000.0)) : ref * (1.0 - (cap_bps / 10000.0));
        local req: OrderRequest = OrderRequest.limit(symbol, account, side, Ticks.fromFloat(limit), qty);
        req.tif = TimeInForce.ImmediateOrCancel;
        local r: ExecReport = e.submit(&req);
        report.child_orders = report.child_orders + 1;
        report.filled = report.filled + r.filled;
        report.notional = report.notional + (cast<float>(r.notional) / cast<float>(Ticks.perUnit()));
    }

    frame run(e: *Engine, sim: *FlowSimulator, kind: AlgoKind, symbol: int, account: int, side: Side, target: long, slices: int, events_per_slice: int, participation: float, cap_bps: float) ret AlgoReport {
        local r: AlgoReport = AlgoReport { target: target, filled: 0, notional: 0.0, average_price: 0.0, arrival_mid: 0.0, shortfall_bps: 0.0, slices: slices, child_orders: 0, market_volume: 0, participation: 0.0 };
        # Warm the book so there is a two-sided market at arrival.
        sim.run(e, events_per_slice);
        local b: *OrderBook = e.book(symbol);
        r.arrival_mid = ExecAlgo.mid(b);
        local weights: *float = cast<*float>(malloc(cast<long>(slices) * sizeof(float)));
        local total_w: float = 0.0;
        loop (local i: int = 0; i < slices; i = i + 1) {
            weights[i] = kind == AlgoKind.Vwap ? ExecAlgo.vwapWeight(i, slices) : 1.0;
            total_w = total_w + weights[i];
        }
        local scheduled: float = 0.0;
        loop (local i: int = 0; (i < slices) && (r.filled < target); i = i + 1) {
            local before_volume: long = b.volume;
            sim.run(e, events_per_slice);
            local slice_volume: long = b.volume - before_volume;
            r.market_volume = r.market_volume + slice_volume;
            local qty: long = 0;
            if (kind == AlgoKind.Pov) {
                qty = cast<long>(Math.round((participation * cast<float>(slice_volume)) / (1.0 - participation)));
            } else {
                scheduled = scheduled + ((cast<float>(target) * weights[i]) / total_w);
                qty = cast<long>(Math.round(scheduled)) - r.filled;
            }
            if (qty > (target - r.filled)) {
                qty = target - r.filled;
            }
            ExecAlgo.child(e, symbol, account, side, qty, cap_bps, &r);
        }
        # Clean-up: complete any remainder with a final sweep.
        if (r.filled < target) {
            ExecAlgo.child(e, symbol, account, side, target - r.filled, cap_bps * 4.0, &r);
        }
        free(cast<*void>(weights));
        if (r.filled > 0) {
            r.average_price = r.notional / cast<float>(r.filled);
            local signed: float = side == Side.Buy ? 1.0 : -1.0;
            r.shortfall_bps = ((signed * (r.average_price - r.arrival_mid)) / r.arrival_mid) * 10000.0;
        }
        local total_volume: long = r.market_volume + r.filled;
        r.participation = total_volume > 0 ? cast<float>(r.filled) / cast<float>(total_volume) : 0.0;
        return r;
    }

    frame kindName(kind: AlgoKind) ret string {
        return match (kind) {
            AlgoKind.Twap => "twap",
            AlgoKind.Vwap => "vwap",
            AlgoKind.Pov => "pov",
        };
    }
}

struct MakerReport {
    steps: int,
    quotes: long,
    fills: long,
    volume: long,
    final_inventory: long,
    max_inventory: long,
    cash: float,
    mark_to_market: float,
    pnl: float,
    average_spread_bps: float,
}

struct MarketMaker {
    gamma: float,
    sigma: float,
    kappa: float,
    horizon: float,
    size: long,
    max_inventory: long,

    # Reservation price and half-spread from Avellaneda-Stoikov (2008).
    frame quotes(this: *MarketMaker, mid: float, inventory: long, t_left: float, bid: *float, ask: *float) {
        local q: float = cast<float>(inventory);
        local s2: float = this.sigma * this.sigma;
        local reservation: float = mid - (q * this.gamma * s2 * t_left);
        local spread: float = (this.gamma * s2 * t_left) + ((2.0 / this.gamma) * Math.log(1.0 + (this.gamma / this.kappa)));
        *bid = reservation - (spread / 2.0);
        *ask = reservation + (spread / 2.0);
    }

    frame run(this: *MarketMaker, e: *Engine, sim: *FlowSimulator, symbol: int, account: int, steps: int, events_per_step: int) ret MakerReport {
        local r: MakerReport = MakerReport { steps: steps, quotes: 0, fills: 0, volume: 0, final_inventory: 0, max_inventory: 0, cash: 0.0, mark_to_market: 0.0, pnl: 0.0, average_spread_bps: 0.0 };
        local b: *OrderBook = e.book(symbol);
        sim.run(e, events_per_step);
        local inventory: long = 0;
        local bid_id: long = 0;
        local ask_id: long = 0;
        local spread_sum: float = 0.0;
        local last_trade: long = e.next_trade_id;
        loop (local step: int = 0; step < steps; step = step + 1) {
            if (bid_id > 0) {
                e.cancel(bid_id);
            }
            if (ask_id > 0) {
                e.cancel(ask_id);
            }
            bid_id = 0;
            ask_id = 0;
            local mid: float = b.mid() / 10000.0;
            local t_left: float = this.horizon * (1.0 - (cast<float>(step) / cast<float>(steps)));
            local bid: float = 0.0;
            local ask: float = 0.0;
            this.quotes(mid, inventory, t_left, &bid, &ask);
            spread_sum = spread_sum + (((ask - bid) / mid) * 10000.0);
            if (inventory < this.max_inventory) {
                local req: OrderRequest = OrderRequest.limit(symbol, account, Side.Buy, Ticks.fromFloat(bid), this.size);
                local rep: ExecReport = e.submit(&req);
                if (rep.resting) {
                    bid_id = rep.order_id;
                }
                r.quotes = r.quotes + 1;
            }
            if (inventory > -this.max_inventory) {
                local req: OrderRequest = OrderRequest.limit(symbol, account, Side.Sell, Ticks.fromFloat(ask), this.size);
                local rep: ExecReport = e.submit(&req);
                if (rep.resting) {
                    ask_id = rep.order_id;
                }
                r.quotes = r.quotes + 1;
            }
            sim.run(e, events_per_step);
            # Account for the maker's fills from the tape.
            loop (local i: int = 0; i < e.tape.count; i = i + 1) {
                local t: *Trade = e.tape.at(i);
                if (t.id < last_trade) {
                    continue;
                }
                local price: float = Ticks.toFloat(t.price);
                if (t.buy_account == account) {
                    inventory = inventory + t.quantity;
                    r.cash = r.cash - (price * cast<float>(t.quantity));
                    r.fills = r.fills + 1;
                    r.volume = r.volume + t.quantity;
                }
                if (t.sell_account == account) {
                    inventory = inventory - t.quantity;
                    r.cash = r.cash + (price * cast<float>(t.quantity));
                    r.fills = r.fills + 1;
                    r.volume = r.volume + t.quantity;
                }
            }
            last_trade = e.next_trade_id;
            local abs_inv: long = inventory < 0 ? -inventory : inventory;
            if (abs_inv > r.max_inventory) {
                r.max_inventory = abs_inv;
            }
        }
        if (bid_id > 0) {
            e.cancel(bid_id);
        }
        if (ask_id > 0) {
            e.cancel(ask_id);
        }
        r.final_inventory = inventory;
        local final_mid: float = b.mid() / 10000.0;
        r.mark_to_market = cast<float>(inventory) * final_mid;
        r.pnl = r.cash + r.mark_to_market;
        r.average_spread_bps = steps > 0 ? spread_sum / cast<float>(steps) : 0.0;
        return r;
    }
}
