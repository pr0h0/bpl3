# Order, trade and execution report types shared by the matching engine.
#
# Prices are integer ticks (1 tick = 1/10000 of a currency unit) so matching
# never compares floating-point values. Quantities are whole units.

import [Text] from "../core/text.bpl";

export [Side];
export [OrderType];
export [TimeInForce];
export [OrderStatus];
export [Order];
export [Trade];
export [RejectReason];
export [Ticks];

global const TICKS_PER_UNIT: long = 10000;

enum Side {
    Buy,
    Sell,
}

enum OrderType {
    Limit,
    Market,
    Stop,
    StopLimit,
}

enum TimeInForce {
    GoodTillCancel,
    ImmediateOrCancel,
    FillOrKill,
    Day,
}

enum OrderStatus {
    New,
    PartiallyFilled,
    Filled,
    Cancelled,
    Rejected,
    Pending,
}

enum RejectReason {
    None,
    InvalidQuantity,
    InvalidPrice,
    UnknownSymbol,
    NoLiquidity,
    FillOrKillUnfilled,
    SelfTrade,
    BookFull,
    UnknownOrder,
    PriceBand,
}

struct Order {
    id: long,
    symbol: int,
    account: int,
    side: Side,
    kind: OrderType,
    tif: TimeInForce,
    status: OrderStatus,
    price: long,
    stop_price: long,
    quantity: long,
    remaining: long,
    filled_notional: long,
    sequence: long,
    timestamp: long,
    # Intrusive FIFO links inside a price level (pool indices, -1 = none).
    prev: int,
    next: int,
    level: int,

    # Pool slots come from malloc; init() also sets the hidden vtable word
    # (BUG-800), so call it before any method on a fresh slot.
    frame init(this: *Order) {
        this.prev = -1;
        this.next = -1;
        this.level = -1;
        this.remaining = 0;
        this.quantity = 0;
    }

    frame filled(this: *Order) ret long {
        return this.quantity - this.remaining;
    }

    frame isBuy(this: *Order) ret bool {
        return this.side == Side.Buy;
    }

    frame isOpen(this: *Order) ret bool {
        return (this.status == OrderStatus.New) || (this.status == OrderStatus.PartiallyFilled);
    }

    frame averagePrice(this: *Order) ret float {
        local f: long = this.filled();
        if (f == 0) {
            return 0.0;
        }
        return cast<float>(this.filled_notional) / cast<float>(f) / cast<float>(TICKS_PER_UNIT);
    }
}

struct Trade {
    id: long,
    symbol: int,
    price: long,
    quantity: long,
    buy_order: long,
    sell_order: long,
    buy_account: int,
    sell_account: int,
    aggressor: Side,
    sequence: long,
    timestamp: long,
}

struct Ticks {
    frame fromFloat(price: float) ret long {
        local scaled: float = price * cast<float>(TICKS_PER_UNIT);
        if (scaled >= 0.0) {
            return cast<long>(scaled + 0.5);
        }
        return cast<long>(scaled - 0.5);
    }

    frame toFloat(ticks: long) ret float {
        return cast<float>(ticks) / cast<float>(TICKS_PER_UNIT);
    }

    frame perUnit() ret long {
        return TICKS_PER_UNIT;
    }

    frame sideName(side: Side) ret string {
        return match (side) {
            Side.Buy => "buy",
            Side.Sell => "sell",
        };
    }

    frame parseSide(text: string, out: *Side) ret bool {
        if (Text.equalsIgnoreCase(text, "buy") || Text.equalsIgnoreCase(text, "b")) {
            *out = Side.Buy;
            return true;
        }
        if (Text.equalsIgnoreCase(text, "sell") || Text.equalsIgnoreCase(text, "s")) {
            *out = Side.Sell;
            return true;
        }
        return false;
    }

    frame typeName(kind: OrderType) ret string {
        return match (kind) {
            OrderType.Limit => "limit",
            OrderType.Market => "market",
            OrderType.Stop => "stop",
            OrderType.StopLimit => "stop_limit",
        };
    }

    frame parseType(text: string, out: *OrderType) ret bool {
        if (Text.equalsIgnoreCase(text, "limit")) {
            *out = OrderType.Limit;
            return true;
        }
        if (Text.equalsIgnoreCase(text, "market")) {
            *out = OrderType.Market;
            return true;
        }
        if (Text.equalsIgnoreCase(text, "stop")) {
            *out = OrderType.Stop;
            return true;
        }
        if (Text.equalsIgnoreCase(text, "stop_limit")) {
            *out = OrderType.StopLimit;
            return true;
        }
        return false;
    }

    frame tifName(tif: TimeInForce) ret string {
        return match (tif) {
            TimeInForce.GoodTillCancel => "gtc",
            TimeInForce.ImmediateOrCancel => "ioc",
            TimeInForce.FillOrKill => "fok",
            TimeInForce.Day => "day",
        };
    }

    frame parseTif(text: string, out: *TimeInForce) ret bool {
        if (Text.equalsIgnoreCase(text, "gtc")) {
            *out = TimeInForce.GoodTillCancel;
            return true;
        }
        if (Text.equalsIgnoreCase(text, "ioc")) {
            *out = TimeInForce.ImmediateOrCancel;
            return true;
        }
        if (Text.equalsIgnoreCase(text, "fok")) {
            *out = TimeInForce.FillOrKill;
            return true;
        }
        if (Text.equalsIgnoreCase(text, "day")) {
            *out = TimeInForce.Day;
            return true;
        }
        return false;
    }

    frame statusName(status: OrderStatus) ret string {
        return match (status) {
            OrderStatus.New => "new",
            OrderStatus.PartiallyFilled => "partially_filled",
            OrderStatus.Filled => "filled",
            OrderStatus.Cancelled => "cancelled",
            OrderStatus.Rejected => "rejected",
            OrderStatus.Pending => "pending",
        };
    }

    frame rejectName(reason: RejectReason) ret string {
        return match (reason) {
            RejectReason.None => "none",
            RejectReason.InvalidQuantity => "invalid_quantity",
            RejectReason.InvalidPrice => "invalid_price",
            RejectReason.UnknownSymbol => "unknown_symbol",
            RejectReason.NoLiquidity => "no_liquidity",
            RejectReason.FillOrKillUnfilled => "fill_or_kill_unfilled",
            RejectReason.SelfTrade => "self_trade",
            RejectReason.BookFull => "book_full",
            RejectReason.UnknownOrder => "unknown_order",
            RejectReason.PriceBand => "price_band",
        };
    }

    frame opposite(side: Side) ret Side {
        if (side == Side.Buy) {
            return Side.Sell;
        }
        return Side.Buy;
    }
}
