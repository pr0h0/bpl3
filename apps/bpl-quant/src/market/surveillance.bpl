# Trade surveillance over a command journal.
#
# The journal is replayed into a scratch engine; every submit, cancel and
# replace is recorded with its account, side, size and journal sequence
# (the clock), and trades are read from the tape. Detectors:
#
#   spoofing        a large order (>= `spoof_ratio` x the account's median
#                   order size) cancelled within `spoof_window` records,
#                   while the same account traded on the opposite side
#   wash_trade      both sides of a trade belong to the same beneficial
#                   owner (account names "owner:desk" share the owner)
#   order_to_trade  orders + cancels per trade above `max_otr` for an
#                   account with at least `min_orders` orders
#   quote_stuffing  more than `stuff_count` submits and cancels by one
#                   account inside any `stuff_window` records
#   marking_close   an account doing at least `close_share` of the volume
#                   in the last `close_fraction` of the session while
#                   moving the last price by `close_bps` or more

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Text] from "../core/text.bpl";
import [LongMap] from "../core/hashmap.bpl";
import [Sort] from "../math/sort.bpl";
import [ByteBuf] from "../proto/wire.bpl";
import [Engine], [OrderRequest] from "./engine.bpl";
import [Trade], [Side] from "./order.bpl";
import [JournaledEngine], [JournalEvent], [JournalCodes] from "../journal/journal.bpl";

export [Surveillance];
export [SurvConfig];
export [Alert];
export [AlertKind];

enum AlertKind {
    Spoofing,
    WashTrade,
    OrderToTrade,
    QuoteStuffing,
    MarkingClose,
}

struct Alert {
    kind: AlertKind,
    account: int,
    other: int,
    symbol: int,
    seq: long,
    order_id: long,
    score: float,
}

struct SurvConfig {
    spoof_ratio: float,
    spoof_window: long,
    max_otr: float,
    min_orders: int,
    stuff_count: int,
    stuff_window: long,
    close_fraction: float,
    close_share: float,
    close_bps: float,
}

# One order the replay saw.
struct SeenOrder {
    order_id: long,
    account: int,
    symbol: int,
    buy: bool,
    quantity: long,
    seq: long,
}

struct SeenTrade {
    seq: long,
    symbol: int,
    price: long,
    quantity: long,
    buyer: int,
    seller: int,
    aggressor_buy: bool,
}

struct ActivityMark {
    seq: long,
    account: int,
    cancel: bool,
}

struct Surveillance {
    engine: Engine,
    config: SurvConfig,
    orders: *SeenOrder,
    order_count: int,
    order_cap: int,
    by_id: LongMap,
    trades: *SeenTrade,
    trade_count: int,
    trade_cap: int,
    activity: *ActivityMark,
    activity_count: int,
    activity_cap: int,
    alerts: *Alert,
    alert_count: int,
    alert_cap: int,
    last_trade_id: long,
    last_seq: long,
    records: long,
    cancels: long,

    frame defaults() ret SurvConfig {
        return SurvConfig { spoof_ratio: 5.0, spoof_window: 20, max_otr: 20.0, min_orders: 20, stuff_count: 40, stuff_window: 50, close_fraction: 0.05, close_share: 0.5, close_bps: 20.0 };
    }

    frame init(this: *Surveillance, config: SurvConfig) {
        this.engine = Engine.new(65536);
        this.config = config;
        this.order_cap = 256;
        this.orders = cast<*SeenOrder>(malloc(cast<long>(this.order_cap) * sizeof(SeenOrder)));
        this.order_count = 0;
        this.by_id = LongMap.new(256);
        this.trade_cap = 256;
        this.trades = cast<*SeenTrade>(malloc(cast<long>(this.trade_cap) * sizeof(SeenTrade)));
        this.trade_count = 0;
        this.activity_cap = 256;
        this.activity = cast<*ActivityMark>(malloc(cast<long>(this.activity_cap) * sizeof(ActivityMark)));
        this.activity_count = 0;
        this.alert_cap = 64;
        this.alerts = cast<*Alert>(malloc(cast<long>(this.alert_cap) * sizeof(Alert)));
        this.alert_count = 0;
        this.last_trade_id = 0;
        this.last_seq = 0;
        this.records = 0;
        this.cancels = 0;
    }

    frame destroy(this: *Surveillance) {
        this.engine.destroy();
        free(cast<*void>(this.orders));
        free(cast<*void>(this.trades));
        free(cast<*void>(this.activity));
        free(cast<*void>(this.alerts));
        this.by_id.destroy();
    }

    frame grow(p: *void, used: int, width: long, cap: *int) ret *void {
        local next: int = *cap * 2;
        local q: *void = malloc(cast<long>(next) * width);
        local src: *u8 = cast<*u8>(p);
        local dst: *u8 = cast<*u8>(q);
        loop (local i: long = 0; i < (cast<long>(used) * width); i = i + 1) {
            dst[i] = src[i];
        }
        free(p);
        *cap = next;
        return q;
    }

    frame mark(this: *Surveillance, seq: long, account: int, cancel: bool) {
        if (this.activity_count == this.activity_cap) {
            this.activity = cast<*ActivityMark>(Surveillance.grow(cast<*void>(this.activity), this.activity_count, sizeof(ActivityMark), &this.activity_cap));
        }
        this.activity[this.activity_count] = ActivityMark { seq: seq, account: account, cancel: cancel };
        this.activity_count = this.activity_count + 1;
    }

    frame alert(this: *Surveillance, a: Alert) {
        if (this.alert_count == this.alert_cap) {
            this.alerts = cast<*Alert>(Surveillance.grow(cast<*void>(this.alerts), this.alert_count, sizeof(Alert), &this.alert_cap));
        }
        this.alerts[this.alert_count] = a;
        this.alert_count = this.alert_count + 1;
    }

    frame onEvent(this: *Surveillance, seq: long, ev: *JournalEvent) {
        this.records = this.records + 1;
        this.last_seq = seq;
        if (ev.record_type == JournalCodes.recSubmit()) {
            if (ev.order_id != 0) {
                if (this.order_count == this.order_cap) {
                    this.orders = cast<*SeenOrder>(Surveillance.grow(cast<*void>(this.orders), this.order_count, sizeof(SeenOrder), &this.order_cap));
                }
                this.orders[this.order_count] = SeenOrder { order_id: ev.order_id, account: ev.request.account, symbol: ev.request.symbol, buy: ev.request.side == Side.Buy, quantity: ev.request.quantity, seq: seq };
                this.by_id.put(ev.order_id, cast<long>(this.order_count));
                this.order_count = this.order_count + 1;
            }
            this.mark(seq, ev.request.account, false);
        } else if ((ev.record_type == JournalCodes.recCancel()) && ev.ok) {
            this.cancels = this.cancels + 1;
            local found: long = this.by_id.getOr(ev.order_id, -1);
            if (found >= 0) {
                local o: *SeenOrder = this.orders + cast<int>(found);
                this.mark(seq, o.account, true);
                this.checkSpoof(o, seq);
            }
        } else if (ev.record_type == JournalCodes.recReplace()) {
            local found: long = this.by_id.getOr(ev.order_id, -1);
            if (found >= 0) {
                this.mark(seq, this.orders[cast<int>(found)].account, true);
            }
        }
        this.collectTrades(seq);
    }

    frame collectTrades(this: *Surveillance, seq: long) {
        local n: int = this.engine.tape.count;
        local first: int = n;
        loop ((first > 0) && (this.engine.tape.at(first - 1).id > this.last_trade_id)) {
            first = first - 1;
        }
        loop (local i: int = first; i < n; i = i + 1) {
            local t: *Trade = this.engine.tape.at(i);
            if (this.trade_count == this.trade_cap) {
                this.trades = cast<*SeenTrade>(Surveillance.grow(cast<*void>(this.trades), this.trade_count, sizeof(SeenTrade), &this.trade_cap));
            }
            this.trades[this.trade_count] = SeenTrade { seq: seq, symbol: t.symbol, price: t.price, quantity: t.quantity, buyer: t.buy_account, seller: t.sell_account, aggressor_buy: t.aggressor == Side.Buy };
            this.trade_count = this.trade_count + 1;
            this.last_trade_id = t.id;
        }
    }

    # Median order quantity of an account (over orders seen so far).
    frame medianSize(this: *Surveillance, account: int) ret float {
        local sizes: *float = cast<*float>(malloc(cast<long>(this.order_count + 1) * sizeof(float)));
        local k: int = 0;
        loop (local i: int = 0; i < this.order_count; i = i + 1) {
            if (this.orders[i].account == account) {
                sizes[k] = cast<float>(this.orders[i].quantity);
                k = k + 1;
            }
        }
        local m: float = 0.0;
        if (k > 0) {
            Sort.floats(sizes, k);
            m = (k % 2) == 1 ? sizes[k / 2] : 0.5 * (sizes[(k / 2) - 1] + sizes[k / 2]);
        }
        free(cast<*void>(sizes));
        return m;
    }

    frame checkSpoof(this: *Surveillance, o: *SeenOrder, cancel_seq: long) {
        if ((cancel_seq - o.seq) > this.config.spoof_window) {
            return;
        }
        local median: float = this.medianSize(o.account);
        if ((median <= 0.0) || (cast<float>(o.quantity) < (this.config.spoof_ratio * median))) {
            return;
        }
        # Did the account trade on the other side while the order rested?
        local opposite: long = 0;
        loop (local i: int = this.trade_count - 1; i >= 0; i = i - 1) {
            local t: *SeenTrade = this.trades + i;
            if (t.seq < o.seq) {
                break;
            }
            if (t.symbol != o.symbol) {
                continue;
            }
            local sold: bool = t.seller == o.account;
            local bought: bool = t.buyer == o.account;
            if ((o.buy && sold) || (!o.buy && bought)) {
                opposite = opposite + t.quantity;
            }
        }
        if (opposite > 0) {
            this.alert(Alert { kind: AlertKind.Spoofing, account: o.account, other: -1, symbol: o.symbol, seq: cancel_seq, order_id: o.order_id, score: cast<float>(o.quantity) / median });
        }
    }

    # "owner:desk" -> length of "owner" (0 when there is no owner prefix).
    frame ownerLength(name: string) ret int {
        local i: int = 0;
        loop (name[i] != cast<char>(0)) {
            if (name[i] == ':') {
                return i;
            }
            i = i + 1;
        }
        return 0;
    }

    frame sameOwner(this: *Surveillance, a: int, b: int) ret bool {
        if (a == b) {
            return true;
        }
        local na: string = this.engine.accounts.name(a);
        local nb: string = this.engine.accounts.name(b);
        local la: int = Surveillance.ownerLength(na);
        if ((la == 0) || (la != Surveillance.ownerLength(nb))) {
            return false;
        }
        loop (local i: int = 0; i < la; i = i + 1) {
            if (na[i] != nb[i]) {
                return false;
            }
        }
        return true;
    }

    frame detectWash(this: *Surveillance) {
        loop (local i: int = 0; i < this.trade_count; i = i + 1) {
            local t: *SeenTrade = this.trades + i;
            if (this.sameOwner(t.buyer, t.seller)) {
                this.alert(Alert { kind: AlertKind.WashTrade, account: t.buyer, other: t.seller, symbol: t.symbol, seq: t.seq, order_id: 0, score: cast<float>(t.quantity) });
            }
        }
    }

    frame detectRatios(this: *Surveillance) {
        local accounts: int = this.engine.accounts.count;
        loop (local a: int = 0; a < accounts; a = a + 1) {
            local actions: int = 0;
            loop (local i: int = 0; i < this.activity_count; i = i + 1) {
                if (this.activity[i].account == a) {
                    actions = actions + 1;
                }
            }
            local trades: int = 0;
            loop (local i: int = 0; i < this.trade_count; i = i + 1) {
                if ((this.trades[i].buyer == a) || (this.trades[i].seller == a)) {
                    trades = trades + 1;
                }
            }
            if (actions >= this.config.min_orders) {
                local otr: float = cast<float>(actions) / cast<float>(trades > 0 ? trades : 1);
                if (otr > this.config.max_otr) {
                    this.alert(Alert { kind: AlertKind.OrderToTrade, account: a, other: -1, symbol: -1, seq: this.last_seq, order_id: 0, score: otr });
                }
            }
            # Sliding window over this account's activity marks; stuffing
            # needs both volume and churn (at least a third cancels).
            local lo: int = 0;
            local in_window: int = 0;
            local cancels: int = 0;
            local flagged: bool = false;
            local marks: *long = cast<*long>(malloc(cast<long>(actions + 1) * sizeof(long)));
            local is_cancel: *bool = cast<*bool>(malloc(cast<long>(actions + 1)));
            local k: int = 0;
            loop (local i: int = 0; i < this.activity_count; i = i + 1) {
                if (this.activity[i].account == a) {
                    marks[k] = this.activity[i].seq;
                    is_cancel[k] = this.activity[i].cancel;
                    k = k + 1;
                }
            }
            loop (local hi: int = 0; (hi < k) && !flagged; hi = hi + 1) {
                in_window = in_window + 1;
                if (is_cancel[hi]) {
                    cancels = cancels + 1;
                }
                loop ((marks[hi] - marks[lo]) > this.config.stuff_window) {
                    if (is_cancel[lo]) {
                        cancels = cancels - 1;
                    }
                    lo = lo + 1;
                    in_window = in_window - 1;
                }
                if ((in_window > this.config.stuff_count) && ((cancels * 3) >= in_window)) {
                    this.alert(Alert { kind: AlertKind.QuoteStuffing, account: a, other: -1, symbol: -1, seq: marks[hi], order_id: 0, score: cast<float>(in_window) });
                    flagged = true;
                }
            }
            free(cast<*void>(marks));
            free(cast<*void>(is_cancel));
        }
    }

    frame detectClose(this: *Surveillance) {
        if (this.trade_count == 0) {
            return;
        }
        local start_seq: long = this.last_seq - cast<long>(Math.ceil(cast<float>(this.last_seq) * this.config.close_fraction));
        loop (local s: int = 0; s < this.engine.book_count; s = s + 1) {
            local before: long = 0;
            local last: long = 0;
            local volume: long = 0;
            local accounts: int = this.engine.accounts.count;
            local by_account: *long = cast<*long>(malloc(cast<long>(accounts + 1) * sizeof(long)));
            loop (local a: int = 0; a < accounts; a = a + 1) {
                by_account[a] = 0;
            }
            loop (local i: int = 0; i < this.trade_count; i = i + 1) {
                local t: *SeenTrade = this.trades + i;
                if (t.symbol != s) {
                    continue;
                }
                if (t.seq <= start_seq) {
                    before = t.price;
                    continue;
                }
                last = t.price;
                volume = volume + t.quantity;
                # Aggressor volume only: who pushed the price.
                local who: int = t.aggressor_buy ? t.buyer : t.seller;
                by_account[who] = by_account[who] + t.quantity;
            }
            if ((volume > 0) && (before > 0) && (last > 0)) {
                local move_bps: float = (cast<float>(last - before) / cast<float>(before)) * 10000.0;
                loop (local a: int = 0; a < accounts; a = a + 1) {
                    local share: float = cast<float>(by_account[a]) / cast<float>(volume);
                    if ((share >= this.config.close_share) && (Math.abs(move_bps) >= this.config.close_bps)) {
                        this.alert(Alert { kind: AlertKind.MarkingClose, account: a, other: -1, symbol: s, seq: this.last_seq, order_id: 0, score: move_bps });
                    }
                }
            }
            free(cast<*void>(by_account));
        }
    }

    # Replays the journal and runs every detector; returns records replayed.
    frame run(this: *Surveillance, log: *ByteBuf) ret long {
        local self: *Surveillance = this;
        local visit: Lambda<void>(long, *JournalEvent) = |seq: long, ev: *JournalEvent| {
            self.onEvent(seq, ev);
        };
        local n: long = JournaledEngine.walk(&this.engine, log, visit);
        this.detectWash();
        this.detectRatios();
        this.detectClose();
        return n;
    }

    frame count(this: *Surveillance, kind: AlertKind) ret int {
        local n: int = 0;
        loop (local i: int = 0; i < this.alert_count; i = i + 1) {
            if (this.alerts[i].kind == kind) {
                n = n + 1;
            }
        }
        return n;
    }

    frame kindName(kind: AlertKind) ret string {
        if (kind == AlertKind.Spoofing) {
            return "spoofing";
        }
        if (kind == AlertKind.WashTrade) {
            return "wash_trade";
        }
        if (kind == AlertKind.OrderToTrade) {
            return "order_to_trade";
        }
        if (kind == AlertKind.QuoteStuffing) {
            return "quote_stuffing";
        }
        return "marking_close";
    }

    frame accountName(this: *Surveillance, id: int) ret string {
        if (id < 0) {
            return nullptr;
        }
        return this.engine.accounts.name(id);
    }

    frame symbolName(this: *Surveillance, id: int) ret string {
        if (id < 0) {
            return nullptr;
        }
        return this.engine.symbolName(id);
    }
}
