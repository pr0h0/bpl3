# Event-sourced order journal with snapshots and crash recovery.
#
# The matching engine is deterministic, so its state is a function of the
# commands applied to it. JournaledEngine applies each command (add symbol,
# submit, cancel, replace, end of day) and appends it to a binary log:
#
#   u32 length | u8 type | u64 sequence | payload | u32 CRC-32(type..payload)
#
# A snapshot serializes the engine (symbols, accounts, book statistics,
# resting orders in price-time priority, pending stops and counters) with
# the journal sequence it covers. Recovery restores the latest snapshot and
# replays the records after it; a torn or corrupt tail record ends the
# replay and is reported. stateHash() is a canonical FNV-1a digest of the
# engine, used to prove that the recovered engine equals the live one.

import [Text] from "../core/text.bpl";
import [IVec] from "../core/vec.bpl";
import [ByteBuf], [ByteReader], [Crc32] from "../proto/wire.bpl";
import [Engine], [OrderRequest], [ExecReport], [EngineStats] from "../market/engine.bpl";
import [Order], [Side], [OrderType], [TimeInForce], [OrderStatus] from "../market/order.bpl";
import [OrderBook], [BookSide], [PriceLevel] from "../market/book.bpl";
import [FS] from "std/fs.bpl";
import [Array] from "std/array.bpl";

export [Journal];
export [JournaledEngine];
export [EngineSnapshot];
export [RecoveryReport];
export [JournalCodes];
export [JournalEvent];

global const REC_ADD_SYMBOL: int = 1;
global const REC_SUBMIT: int = 2;
global const REC_CANCEL: int = 3;
global const REC_REPLACE: int = 4;
global const REC_END_OF_DAY: int = 5;
global const REC_BAND: int = 6;
global const REC_ACCOUNT: int = 7;
global const SNAPSHOT_MAGIC: long = 0x51534E50;
global const SNAPSHOT_VERSION: int = 1;

struct JournalCodes {
    frame recSubmit() ret int {
        return REC_SUBMIT;
    }

    frame recCancel() ret int {
        return REC_CANCEL;
    }

    frame recReplace() ret int {
        return REC_REPLACE;
    }

    frame side(s: Side) ret int {
        return s == Side.Buy ? 0 : 1;
    }

    frame toSide(v: int) ret Side {
        return v == 0 ? Side.Buy : Side.Sell;
    }

    frame kind(k: OrderType) ret int {
        if (k == OrderType.Limit) {
            return 0;
        }
        if (k == OrderType.Market) {
            return 1;
        }
        if (k == OrderType.Stop) {
            return 2;
        }
        return 3;
    }

    frame toKind(v: int) ret OrderType {
        if (v == 1) {
            return OrderType.Market;
        }
        if (v == 2) {
            return OrderType.Stop;
        }
        if (v == 3) {
            return OrderType.StopLimit;
        }
        return OrderType.Limit;
    }

    frame tif(t: TimeInForce) ret int {
        if (t == TimeInForce.GoodTillCancel) {
            return 0;
        }
        if (t == TimeInForce.ImmediateOrCancel) {
            return 1;
        }
        if (t == TimeInForce.FillOrKill) {
            return 2;
        }
        return 3;
    }

    frame toTif(v: int) ret TimeInForce {
        if (v == 1) {
            return TimeInForce.ImmediateOrCancel;
        }
        if (v == 2) {
            return TimeInForce.FillOrKill;
        }
        if (v == 3) {
            return TimeInForce.Day;
        }
        return TimeInForce.GoodTillCancel;
    }

    frame status(s: OrderStatus) ret int {
        if (s == OrderStatus.New) {
            return 0;
        }
        if (s == OrderStatus.PartiallyFilled) {
            return 1;
        }
        if (s == OrderStatus.Filled) {
            return 2;
        }
        if (s == OrderStatus.Cancelled) {
            return 3;
        }
        if (s == OrderStatus.Rejected) {
            return 4;
        }
        return 5;
    }

    frame toStatus(v: int) ret OrderStatus {
        if (v == 1) {
            return OrderStatus.PartiallyFilled;
        }
        if (v == 2) {
            return OrderStatus.Filled;
        }
        if (v == 3) {
            return OrderStatus.Cancelled;
        }
        if (v == 4) {
            return OrderStatus.Rejected;
        }
        if (v == 5) {
            return OrderStatus.Pending;
        }
        return OrderStatus.New;
    }

    frame recordName(t: int) ret string {
        if (t == REC_ADD_SYMBOL) {
            return "add_symbol";
        }
        if (t == REC_SUBMIT) {
            return "submit";
        }
        if (t == REC_CANCEL) {
            return "cancel";
        }
        if (t == REC_REPLACE) {
            return "replace";
        }
        if (t == REC_END_OF_DAY) {
            return "end_of_day";
        }
        if (t == REC_BAND) {
            return "price_band";
        }
        if (t == REC_ACCOUNT) {
            return "account";
        }
        return "unknown";
    }
}

# The append-only log. Records are kept in memory and can be saved to or
# loaded from a file.
struct Journal {
    log: ByteBuf,
    next_seq: long,
    records: long,
    payload: ByteBuf,
    # Offset of every record, for paging through the log.
    offsets: IVec,

    frame init(this: *Journal) {
        this.log = ByteBuf.new(4096);
        this.payload = ByteBuf.new(128);
        this.offsets = IVec.new(256);
        this.next_seq = 1;
        this.records = 0;
    }

    frame destroy(this: *Journal) {
        this.log.destroy();
        this.payload.destroy();
        this.offsets.destroy();
    }

    frame reset(this: *Journal) {
        this.log.clear();
        this.offsets.clear();
        this.next_seq = 1;
        this.records = 0;
    }

    # Starts a record; the caller writes the payload into `payload`.
    frame begin(this: *Journal) ret *ByteBuf {
        this.payload.clear();
        return &this.payload;
    }

    frame commit(this: *Journal, record_type: int) ret long {
        local start: int = this.log.len;
        local body_len: int = 1 + 8 + this.payload.len;
        this.log.u32le(cast<long>(body_len + 4));
        local body_at: int = this.log.len;
        this.log.u8(record_type);
        this.log.u64le(this.next_seq);
        this.log.bytes(this.payload.data, this.payload.len);
        local crc: long = Crc32.of(this.log.data + body_at, body_len);
        this.log.u32le(crc);
        this.offsets.push(start);
        local seq: long = this.next_seq;
        this.next_seq = this.next_seq + 1;
        this.records = this.records + 1;
        return seq;
    }

    frame bytes(this: *Journal) ret int {
        return this.log.len;
    }

    frame saveTo(this: *Journal, path: string) ret bool {
        return FS.writeBytes(path, this.log.data, this.log.len);
    }

    # Replaces the in-memory log with the file contents (validated on replay).
    frame loadFrom(this: *Journal, path: string) ret bool {
        if (!FS.exists(path)) {
            return false;
        }
        local ok: bool = true;
        try {
            local data: Array<u8> = FS.readBytes(path);
            this.reset();
            this.log.bytes(data.data, data.length);
            data.destroy();
        } catch {
            ok = false;
        }
        if (ok) {
            this.reindex();
        }
        return ok;
    }

    # Rebuilds record offsets and counters from the raw log, stopping at the
    # first incomplete record.
    frame reindex(this: *Journal) {
        this.offsets.clear();
        this.records = 0;
        this.next_seq = 1;
        local pos: int = 0;
        loop ((this.log.len - pos) >= 17) {
            local r: ByteReader = ByteReader.over(this.log.data + pos, 13);
            local total: int = cast<int>(r.u32le());
            r.u8();
            local seq: long = r.u64le();
            if ((total < 13) || ((this.log.len - pos - 4) < total)) {
                break;
            }
            this.offsets.push(pos);
            this.records = this.records + 1;
            this.next_seq = seq + 1;
            pos = pos + 4 + total;
        }
    }
}

struct JournalEvent {
    record_type: int,
    request: OrderRequest,
    order_id: long,
    price: long,
    quantity: long,
    report: ExecReport,
    ok: bool,
}

struct RecoveryReport {
    snapshot_seq: long,
    replayed: long,
    skipped: long,
    last_seq: long,
    valid_bytes: int,
    torn_bytes: int,
    corrupt: bool,
    error: string,
}

struct EngineSnapshot {
    data: ByteBuf,
    seq: long,

    frame destroy(this: *EngineSnapshot) {
        this.data.destroy();
    }
}

struct JournaledEngine {
    engine: Engine,
    journal: Journal,
    replaying: bool,

    frame init(this: *JournaledEngine, tape_capacity: int) {
        this.engine = Engine.new(tape_capacity);
        this.journal.init();
        this.replaying = false;
    }

    frame destroy(this: *JournaledEngine) {
        this.engine.destroy();
        this.journal.destroy();
    }

    frame addSymbol(this: *JournaledEngine, name: string, reference_price: long) ret int {
        local id: int = this.engine.addSymbol(name, reference_price);
        local p: *ByteBuf = this.journal.begin();
        p.lstr(name);
        p.u64le(reference_price);
        this.journal.commit(REC_ADD_SYMBOL);
        return id;
    }

    # Account ids are assigned in creation order, so creation is journaled.
    frame accountId(this: *JournaledEngine, name: string) ret int {
        local existing: int = this.engine.accounts.find(name);
        if (existing >= 0) {
            return existing;
        }
        local id: int = this.engine.accountId(name);
        local p: *ByteBuf = this.journal.begin();
        p.lstr(name);
        this.journal.commit(REC_ACCOUNT);
        return id;
    }

    frame setBand(this: *JournaledEngine, symbol: int, band_bps: long) {
        local b: *OrderBook = this.engine.book(symbol);
        if (b == nullptr) {
            return;
        }
        b.band_bps = band_bps;
        local p: *ByteBuf = this.journal.begin();
        p.varint(cast<long>(symbol));
        p.varint(band_bps);
        this.journal.commit(REC_BAND);
    }

    frame submit(this: *JournaledEngine, req: *OrderRequest) ret ExecReport {
        # Timestamps are assigned by the engine clock unless given, so the
        # record stores exactly what the engine saw.
        local r: ExecReport = this.engine.submit(req);
        local p: *ByteBuf = this.journal.begin();
        p.varint(cast<long>(req.symbol));
        p.lstr(this.engine.accounts.name(req.account));
        p.u8(JournalCodes.side(req.side));
        p.u8(JournalCodes.kind(req.kind));
        p.u8(JournalCodes.tif(req.tif));
        p.svarint(req.price);
        p.svarint(req.stop_price);
        p.svarint(req.quantity);
        p.svarint(req.timestamp);
        this.journal.commit(REC_SUBMIT);
        return r;
    }

    frame cancel(this: *JournaledEngine, order_id: long) ret bool {
        local ok: bool = this.engine.cancel(order_id);
        local p: *ByteBuf = this.journal.begin();
        p.varint(order_id);
        this.journal.commit(REC_CANCEL);
        return ok;
    }

    frame replace(this: *JournaledEngine, order_id: long, price: long, quantity: long) ret ExecReport {
        local r: ExecReport = this.engine.replace(order_id, price, quantity);
        local p: *ByteBuf = this.journal.begin();
        p.varint(order_id);
        p.svarint(price);
        p.svarint(quantity);
        this.journal.commit(REC_REPLACE);
        return r;
    }

    frame endOfDay(this: *JournaledEngine) ret int {
        local n: int = this.engine.endOfDay();
        this.journal.begin();
        this.journal.commit(REC_END_OF_DAY);
        return n;
    }

    # Applies one decoded record to `e` without journaling it.
    frame apply(e: *Engine, record_type: int, r: *ByteReader) ret bool {
        local ev: JournalEvent;
        return JournaledEngine.applyEvent(e, record_type, r, &ev);
    }

    # Applies one record and describes it in `ev` (request, target order and
    # the engine's report), for observers such as trade surveillance.
    frame applyEvent(e: *Engine, record_type: int, r: *ByteReader, ev: *JournalEvent) ret bool {
        ev.record_type = record_type;
        ev.order_id = 0;
        ev.price = 0;
        ev.quantity = 0;
        ev.report = Engine.emptyReport();
        ev.ok = false;
        if (record_type == REC_ADD_SYMBOL) {
            local name: string = r.lstr(64);
            local ref: long = r.u64le();
            if (!r.ok()) {
                return false;
            }
            e.addSymbol(name, ref);
            Text.release(name);
            return true;
        }
        if (record_type == REC_ACCOUNT) {
            local name: string = r.lstr(256);
            if (!r.ok()) {
                return false;
            }
            e.accountId(name);
            Text.release(name);
            return true;
        }
        if (record_type == REC_BAND) {
            local sym: int = cast<int>(r.varint());
            local band: long = r.varint();
            local b: *OrderBook = e.book(sym);
            if (!r.ok() || (b == nullptr)) {
                return false;
            }
            b.band_bps = band;
            return true;
        }
        if (record_type == REC_SUBMIT) {
            local req: OrderRequest;
            req.symbol = cast<int>(r.varint());
            local account: string = r.lstr(256);
            req.side = JournalCodes.toSide(r.u8());
            req.kind = JournalCodes.toKind(r.u8());
            req.tif = JournalCodes.toTif(r.u8());
            req.price = r.svarint();
            req.stop_price = r.svarint();
            req.quantity = r.svarint();
            req.timestamp = r.svarint();
            if (!r.ok()) {
                return false;
            }
            req.account = e.accountId(account);
            Text.release(account);
            ev.request = req;
            ev.report = e.submit(&req);
            ev.order_id = ev.report.order_id;
            ev.ok = true;
            return true;
        }
        if (record_type == REC_CANCEL) {
            local id: long = r.varint();
            if (!r.ok()) {
                return false;
            }
            ev.order_id = id;
            local o: *Order = e.findOrder(id);
            ev.quantity = o == nullptr ? 0 : o.remaining;
            ev.ok = e.cancel(id);
            return true;
        }
        if (record_type == REC_REPLACE) {
            local id: long = r.varint();
            local price: long = r.svarint();
            local qty: long = r.svarint();
            if (!r.ok()) {
                return false;
            }
            ev.order_id = id;
            ev.price = price;
            ev.quantity = qty;
            ev.report = e.replace(id, price, qty);
            ev.ok = ev.report.status != OrderStatus.Rejected;
            return true;
        }
        if (record_type == REC_END_OF_DAY) {
            e.endOfDay();
            return true;
        }
        return false;
    }

    # Replays records with sequence > `after_seq` from `log` into `e`.
    # Replays the whole log into `e`, calling `visit(seq, event)` after each
    # record. Stops at the first invalid record; returns records applied.
    frame walk(e: *Engine, log: *ByteBuf, visit: Lambda<void>(long, *JournalEvent)) ret long {
        local pos: int = 0;
        local applied: long = 0;
        loop ((log.len - pos) >= 17) {
            local lr: ByteReader = ByteReader.over(log.data + pos, 4);
            local total: int = cast<int>(lr.u32le());
            if ((total < 13) || ((log.len - pos - 4) < total)) {
                break;
            }
            local body: *u8 = log.data + pos + 4;
            local cr: ByteReader = ByteReader.over(body + (total - 4), 4);
            if (Crc32.of(body, total - 4) != cr.u32le()) {
                break;
            }
            local r: ByteReader = ByteReader.over(body, total - 4);
            local record_type: int = r.u8();
            local seq: long = r.u64le();
            local ev: JournalEvent;
            if (!JournaledEngine.applyEvent(e, record_type, &r, &ev)) {
                break;
            }
            visit(seq, &ev);
            applied = applied + 1;
            pos = pos + 4 + total;
        }
        return applied;
    }

    frame replay(e: *Engine, log: *ByteBuf, after_seq: long, report: *RecoveryReport) {
        local pos: int = 0;
        report.replayed = 0;
        report.skipped = 0;
        report.corrupt = false;
        report.torn_bytes = 0;
        report.error = nullptr;
        report.last_seq = after_seq;
        loop (pos < log.len) {
            if ((log.len - pos) < 4) {
                report.torn_bytes = log.len - pos;
                report.error = "torn length prefix";
                break;
            }
            local lr: ByteReader = ByteReader.over(log.data + pos, 4);
            local total: int = cast<int>(lr.u32le());
            if ((total < 13) || (total > 1048576)) {
                report.corrupt = true;
                report.torn_bytes = log.len - pos;
                report.error = "invalid record length";
                break;
            }
            if ((log.len - pos - 4) < total) {
                report.torn_bytes = log.len - pos;
                report.error = "torn record";
                break;
            }
            local body: *u8 = log.data + pos + 4;
            local body_len: int = total - 4;
            local cr: ByteReader = ByteReader.over(body + body_len, 4);
            if (Crc32.of(body, body_len) != cr.u32le()) {
                report.corrupt = true;
                report.torn_bytes = log.len - pos;
                report.error = "CRC mismatch";
                break;
            }
            local r: ByteReader = ByteReader.over(body, body_len);
            local record_type: int = r.u8();
            local seq: long = r.u64le();
            if (seq <= after_seq) {
                report.skipped = report.skipped + 1;
            } else {
                if (seq != (report.last_seq + 1)) {
                    report.corrupt = true;
                    report.torn_bytes = log.len - pos;
                    report.error = "sequence gap";
                    break;
                }
                if (!JournaledEngine.apply(e, record_type, &r)) {
                    report.corrupt = true;
                    report.torn_bytes = log.len - pos;
                    report.error = "undecodable record";
                    break;
                }
                report.replayed = report.replayed + 1;
                report.last_seq = seq;
            }
            pos = pos + 4 + total;
        }
        report.valid_bytes = pos;
    }

    # Serializes the engine state covered by the journal so far.
    frame snapshot(this: *JournaledEngine) ret EngineSnapshot {
        local s: EngineSnapshot;
        s.data = ByteBuf.new(4096);
        s.seq = this.journal.next_seq - 1;
        JournaledEngine.writeState(&this.engine, &s.data, s.seq);
        return s;
    }

    frame writeOrder(o: *Order, out: *ByteBuf) {
        out.varint(o.id);
        out.varint(cast<long>(o.account));
        out.u8(JournalCodes.side(o.side));
        out.u8(JournalCodes.kind(o.kind));
        out.u8(JournalCodes.tif(o.tif));
        out.u8(JournalCodes.status(o.status));
        out.svarint(o.price);
        out.svarint(o.stop_price);
        out.svarint(o.quantity);
        out.svarint(o.remaining);
        out.svarint(o.filled_notional);
        out.svarint(o.sequence);
        out.svarint(o.timestamp);
    }

    frame writeState(e: *Engine, out: *ByteBuf, seq: long) {
        out.u32le(SNAPSHOT_MAGIC);
        out.u8(SNAPSHOT_VERSION);
        out.u64le(seq);
        out.varint(e.next_order_id);
        out.varint(e.next_trade_id);
        out.varint(e.sequence);
        out.varint(e.clock);
        out.u8(e.prevent_self_trade ? 1 : 0);
        local st: *EngineStats = &e.stats;
        out.varint(st.submitted);
        out.varint(st.rejected);
        out.varint(st.cancelled);
        out.varint(st.replaced);
        out.varint(st.trades);
        out.varint(st.volume);
        out.varint(st.stops_triggered);
        out.varint(st.self_trades_prevented);
        out.varint(cast<long>(e.accounts.count));
        loop (local i: int = 0; i < e.accounts.count; i = i + 1) {
            out.lstr(e.accounts.name(i));
        }
        out.varint(cast<long>(e.book_count));
        loop (local s: int = 0; s < e.book_count; s = s + 1) {
            local b: *OrderBook = e.books + s;
            out.lstr(e.symbolName(s));
            out.svarint(b.reference_price);
            out.svarint(b.band_bps);
            out.svarint(b.last_price);
            out.svarint(b.last_quantity);
            out.svarint(b.volume);
            out.svarint(b.notional);
            out.svarint(b.trade_count);
            out.svarint(b.open_price);
            out.svarint(b.high_price);
            out.svarint(b.low_price);
            out.svarint(b.stop_scan_price);
            loop (local side: int = 0; side < 2; side = side + 1) {
                local bs: *BookSide = side == 0 ? &b.bids : &b.asks;
                local n: long = 0;
                loop (local l: int = 0; l < bs.count; l = l + 1) {
                    n = n + cast<long>(bs.levels[l].count);
                }
                out.varint(n);
                loop (local l: int = 0; l < bs.count; l = l + 1) {
                    local cur: int = bs.levels[l].head;
                    loop (cur >= 0) {
                        local o: *Order = e.pool.at(cur);
                        JournaledEngine.writeOrder(o, out);
                        cur = o.next;
                    }
                }
            }
        }
        out.varint(cast<long>(e.stops.len));
        loop (local i: int = 0; i < e.stops.len; i = i + 1) {
            local o: *Order = e.pool.at(e.stops.data[i]);
            out.varint(cast<long>(o.symbol));
            JournaledEngine.writeOrder(o, out);
        }
        out.u32le(Crc32.of(out.data, out.len));
    }

    frame readOrder(r: *ByteReader, o: *Order, symbol: int) {
        o.id = r.varint();
        o.symbol = symbol;
        o.account = cast<int>(r.varint());
        o.side = JournalCodes.toSide(r.u8());
        o.kind = JournalCodes.toKind(r.u8());
        o.tif = JournalCodes.toTif(r.u8());
        o.status = JournalCodes.toStatus(r.u8());
        o.price = r.svarint();
        o.stop_price = r.svarint();
        o.quantity = r.svarint();
        o.remaining = r.svarint();
        o.filled_notional = r.svarint();
        o.sequence = r.svarint();
        o.timestamp = r.svarint();
    }

    # Builds `e` (a fresh engine) from snapshot bytes. Returns nullptr or an
    # error message.
    frame restore(e: *Engine, data: *ByteBuf, seq_out: *long) ret string {
        if (data.len < 8) {
            return "snapshot too short";
        }
        local tail: ByteReader = ByteReader.over(data.data + (data.len - 4), 4);
        if (Crc32.of(data.data, data.len - 4) != tail.u32le()) {
            return "snapshot CRC mismatch";
        }
        local r: ByteReader = ByteReader.over(data.data, data.len - 4);
        if (r.u32le() != SNAPSHOT_MAGIC) {
            return "not a snapshot";
        }
        if (r.u8() != SNAPSHOT_VERSION) {
            return "unsupported snapshot version";
        }
        *seq_out = r.u64le();
        local next_order: long = r.varint();
        local next_trade: long = r.varint();
        local sequence: long = r.varint();
        local clock: long = r.varint();
        e.prevent_self_trade = r.u8() == 1;
        e.stats.submitted = r.varint();
        e.stats.rejected = r.varint();
        e.stats.cancelled = r.varint();
        e.stats.replaced = r.varint();
        e.stats.trades = r.varint();
        e.stats.volume = r.varint();
        e.stats.stops_triggered = r.varint();
        e.stats.self_trades_prevented = r.varint();
        local accounts: long = r.varint();
        loop (local i: long = 0; (i < accounts) && r.ok(); i = i + 1) {
            local name: string = r.lstr(256);
            if (name != nullptr) {
                e.accountId(name);
                Text.release(name);
            }
        }
        local books: long = r.varint();
        loop (local s: long = 0; (s < books) && r.ok(); s = s + 1) {
            local name: string = r.lstr(64);
            local ref: long = r.svarint();
            if (name == nullptr) {
                break;
            }
            local id: int = e.addSymbol(name, ref);
            Text.release(name);
            local b: *OrderBook = e.books + id;
            b.band_bps = r.svarint();
            b.last_price = r.svarint();
            b.last_quantity = r.svarint();
            b.volume = r.svarint();
            b.notional = r.svarint();
            b.trade_count = r.svarint();
            b.open_price = r.svarint();
            b.high_price = r.svarint();
            b.low_price = r.svarint();
            b.stop_scan_price = r.svarint();
            loop (local side: int = 0; side < 2; side = side + 1) {
                local n: long = r.varint();
                loop (local k: long = 0; (k < n) && r.ok(); k = k + 1) {
                    local idx: int = e.pool.alloc();
                    local o: *Order = e.pool.at(idx);
                    JournaledEngine.readOrder(&r, o, id);
                    e.ids.put(o.id, cast<long>(idx));
                    # Re-resting in snapshot order rebuilds FIFO priority.
                    e.books[id].rest(&e.pool, idx);
                }
            }
        }
        local stops: long = r.varint();
        loop (local i: long = 0; (i < stops) && r.ok(); i = i + 1) {
            local sym: int = cast<int>(r.varint());
            local idx: int = e.pool.alloc();
            local o: *Order = e.pool.at(idx);
            JournaledEngine.readOrder(&r, o, sym);
            e.ids.put(o.id, cast<long>(idx));
            e.stops.push(idx);
        }
        if (!r.ok()) {
            return "snapshot truncated";
        }
        if (r.remaining() != 0) {
            return "trailing snapshot data";
        }
        e.next_order_id = next_order;
        e.next_trade_id = next_trade;
        e.sequence = sequence;
        e.clock = clock;
        return nullptr;
    }

    # Canonical digest of everything recovery must reproduce.
    frame stateHash(e: *Engine) ret u64 {
        local buf: ByteBuf = ByteBuf.new(4096);
        JournaledEngine.writeState(e, &buf, 0);
        local h: u64 = Text.fnv1aBytes(cast<*char>(buf.data), cast<long>(buf.len - 4));
        buf.destroy();
        return h;
    }

    # Recovers into `e` (fresh) from an optional snapshot plus the journal.
    frame recover(e: *Engine, snapshot: *EngineSnapshot, log: *ByteBuf) ret RecoveryReport {
        local report: RecoveryReport;
        report.snapshot_seq = 0;
        report.error = nullptr;
        if (snapshot != nullptr) {
            local seq: long = 0;
            local err: string = JournaledEngine.restore(e, &snapshot.data, &seq);
            if (err != nullptr) {
                report.error = err;
                report.corrupt = true;
                report.replayed = 0;
                report.skipped = 0;
                report.last_seq = 0;
                report.valid_bytes = 0;
                report.torn_bytes = 0;
                return report;
            }
            report.snapshot_seq = seq;
        }
        JournaledEngine.replay(e, log, report.snapshot_seq, &report);
        return report;
    }

    # Drops records covered by `snapshot` from the head of the journal.
    frame compact(this: *JournaledEngine, snapshot: *EngineSnapshot) ret int {
        local keep: ByteBuf = ByteBuf.new(this.journal.log.len + 16);
        local kept_offsets: IVec = IVec.new(64);
        local dropped: int = 0;
        loop (local i: int = 0; i < this.journal.offsets.len; i = i + 1) {
            local start: int = this.journal.offsets.data[i];
            local hr: ByteReader = ByteReader.over(this.journal.log.data + start, 13);
            local total: int = cast<int>(hr.u32le());
            hr.u8();
            local seq: long = hr.u64le();
            if (seq <= snapshot.seq) {
                dropped = dropped + 1;
            } else {
                kept_offsets.push(keep.len);
                keep.bytes(this.journal.log.data + start, total + 4);
            }
        }
        this.journal.log.destroy();
        this.journal.log = keep;
        this.journal.offsets.destroy();
        this.journal.offsets = kept_offsets;
        return dropped;
    }

    # Decodes record `i` (0 = oldest kept) for listings.
    frame recordInfo(this: *JournaledEngine, i: int, record_type: *int, seq: *long, size: *int) ret bool {
        if ((i < 0) || (i >= this.journal.offsets.len)) {
            return false;
        }
        local start: int = this.journal.offsets.data[i];
        local hr: ByteReader = ByteReader.over(this.journal.log.data + start, 13);
        *size = cast<int>(hr.u32le()) + 4;
        *record_type = hr.u8();
        *seq = hr.u64le();
        return hr.ok();
    }
}
