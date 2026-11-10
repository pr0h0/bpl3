# Call auction (opening/closing cross).
#
# Orders collected during the call phase are uncrossed at the single price
# that (1) maximizes executable volume, then (2) minimizes the absolute
# order imbalance, then (3) is closest to the reference price. Executions
# are allocated in price-time priority on both sides; unexecuted limit
# orders can then be handed to the continuous book.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Side], [Ticks] from "./order.bpl";
import [Sort] from "../math/sort.bpl";

export [Auction];
export [AuctionOrder];
export [AuctionResult];

struct AuctionOrder {
    id: long,
    account: int,
    side: Side,
    # 0 means a market order (any price).
    price: long,
    quantity: long,
    filled: long,
    sequence: long,
}

struct AuctionResult {
    price: long,
    volume: long,
    imbalance: long,
    buy_interest: long,
    sell_interest: long,
    candidates: int,
    crossed: bool,
}

struct Auction {
    orders: *AuctionOrder,
    count: int,
    cap: int,
    reference: long,
    next_id: long,

    frame new(reference: long) ret Auction {
        local a: Auction;
        a.cap = 64;
        a.count = 0;
        a.orders = cast<*AuctionOrder>(malloc(cast<long>(a.cap) * sizeof(AuctionOrder)));
        a.reference = reference;
        a.next_id = 1;
        return a;
    }

    frame destroy(this: *Auction) {
        free(cast<*void>(this.orders));
        this.orders = nullptr;
    }

    frame add(this: *Auction, account: int, side: Side, price: long, quantity: long) ret long {
        if ((quantity <= 0) || (price < 0)) {
            return -1;
        }
        if (this.count == this.cap) {
            local next_cap: int = this.cap * 2;
            local next: *AuctionOrder = cast<*AuctionOrder>(malloc(cast<long>(next_cap) * sizeof(AuctionOrder)));
            loop (local i: int = 0; i < this.count; i = i + 1) {
                next[i] = this.orders[i];
            }
            free(cast<*void>(this.orders));
            this.orders = next;
            this.cap = next_cap;
        }
        local id: long = this.next_id;
        this.next_id = this.next_id + 1;
        this.orders[this.count] = AuctionOrder { id: id, account: account, side: side, price: price, quantity: quantity, filled: 0, sequence: id };
        this.count = this.count + 1;
        return id;
    }

    # Cumulative buy demand at price p: buys with limit >= p (or market).
    frame demand(this: *Auction, p: long) ret long {
        local q: long = 0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local o: *AuctionOrder = this.orders + i;
            if ((o.side == Side.Buy) && ((o.price == 0) || (o.price >= p))) {
                q = q + o.quantity;
            }
        }
        return q;
    }

    frame supply(this: *Auction, p: long) ret long {
        local q: long = 0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local o: *AuctionOrder = this.orders + i;
            if ((o.side == Side.Sell) && ((o.price == 0) || (o.price <= p))) {
                q = q + o.quantity;
            }
        }
        return q;
    }

    # Finds the clearing price without executing.
    frame indicative(this: *Auction) ret AuctionResult {
        local r: AuctionResult = AuctionResult { price: 0, volume: 0, imbalance: 0, buy_interest: 0, sell_interest: 0, candidates: 0, crossed: false };
        # Candidate prices: every distinct limit price.
        local prices: *float = cast<*float>(malloc(cast<long>(this.count + 1) * sizeof(float)));
        local n: int = 0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            if (this.orders[i].price > 0) {
                prices[n] = cast<float>(this.orders[i].price);
                n = n + 1;
            }
            if (this.orders[i].side == Side.Buy) {
                r.buy_interest = r.buy_interest + this.orders[i].quantity;
            } else {
                r.sell_interest = r.sell_interest + this.orders[i].quantity;
            }
        }
        if (n == 0) {
            # Only market orders: cross at the reference price.
            prices[0] = cast<float>(this.reference);
            n = 1;
        }
        Sort.floats(prices, n);
        local best_volume: long = -1;
        local best_imbalance: long = 0;
        local best_distance: long = 0;
        local last: long = -1;
        loop (local i: int = 0; i < n; i = i + 1) {
            local p: long = cast<long>(prices[i]);
            if (p == last) {
                continue;
            }
            last = p;
            r.candidates = r.candidates + 1;
            local d: long = this.demand(p);
            local s: long = this.supply(p);
            local v: long = d < s ? d : s;
            local imb: long = d - s;
            local abs_imb: long = imb < 0 ? -imb : imb;
            local dist: long = p - this.reference;
            if (dist < 0) {
                dist = -dist;
            }
            local better: bool = (v > best_volume) || ((v == best_volume) && (abs_imb < best_imbalance)) || ((v == best_volume) && (abs_imb == best_imbalance) && (dist < best_distance));
            if (better) {
                best_volume = v;
                best_imbalance = abs_imb;
                best_distance = dist;
                r.price = p;
                r.imbalance = imb;
            }
        }
        r.volume = best_volume < 0 ? 0 : best_volume;
        r.crossed = r.volume > 0;
        free(cast<*void>(prices));
        return r;
    }

    # Priority: market orders first, then better limit price, then time.
    frame before(this: *Auction, a: int, b: int) ret bool {
        local x: *AuctionOrder = this.orders + a;
        local y: *AuctionOrder = this.orders + b;
        if ((x.price == 0) != (y.price == 0)) {
            return x.price == 0;
        }
        if (x.price != y.price) {
            return x.side == Side.Buy ? x.price > y.price : x.price < y.price;
        }
        return x.sequence < y.sequence;
    }

    frame allocate(this: *Auction, side: Side, price: long, volume: long) {
        local idx: *int = cast<*int>(malloc(cast<long>(this.count + 1) * sizeof(int)));
        local n: int = 0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local o: *AuctionOrder = this.orders + i;
            local eligible: bool = side == Side.Buy ? ((o.price == 0) || (o.price >= price)) : ((o.price == 0) || (o.price <= price));
            if ((o.side == side) && eligible) {
                idx[n] = i;
                n = n + 1;
            }
        }
        # Insertion sort by priority (auction books are small).
        loop (local i: int = 1; i < n; i = i + 1) {
            local v: int = idx[i];
            local j: int = i - 1;
            loop ((j >= 0) && this.before(v, idx[j])) {
                idx[j + 1] = idx[j];
                j = j - 1;
            }
            idx[j + 1] = v;
        }
        local left: long = volume;
        loop (local k: int = 0; (k < n) && (left > 0); k = k + 1) {
            local o: *AuctionOrder = this.orders + idx[k];
            local take: long = o.quantity < left ? o.quantity : left;
            o.filled = take;
            left = left - take;
        }
        free(cast<*void>(idx));
    }

    frame uncross(this: *Auction) ret AuctionResult {
        local r: AuctionResult = this.indicative();
        if (r.crossed) {
            this.allocate(Side.Buy, r.price, r.volume);
            this.allocate(Side.Sell, r.price, r.volume);
        }
        return r;
    }

    frame filledVolume(this: *Auction, side: Side) ret long {
        local q: long = 0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            if (this.orders[i].side == side) {
                q = q + this.orders[i].filled;
            }
        }
        return q;
    }
}
