# Self-tests for the wire codec, FIX codec/session/gateway and the binary
# market-data feed.

import [Check] from "./check.bpl";
import [Text] from "../core/text.bpl";
import [StrList], [CharBuf] from "../core/strlist.bpl";
import [ByteBuf], [ByteReader], [Crc32], [Hex] from "../proto/wire.bpl";
import [FixMessage], [FixBuilder], [FixTime], [FixDecimal] from "../proto/fix.bpl";
import [FixSession], [SessionState] from "../proto/fix_session.bpl";
import [FixGateway] from "../proto/fix_gateway.bpl";
import [ItchMsg], [ItchCodec] from "../proto/itch.bpl";
import [FeedSim], [FeedReplayResult] from "../proto/feed_sim.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [Ticks], [Side] from "../market/order.bpl";

export runProtoTests;

frame testWire(c: *Check) {
    c.begin("wire");
    local b: ByteBuf = ByteBuf.new(4);
    b.u32le(305419896);
    b.u16be(513);
    b.varint(300);
    b.svarint(-3);
    b.svarint(1000000);
    b.u48be(123456789012);
    b.u64le(-2);
    b.f64le(3.25);
    b.lstr("hello");
    b.alpha("AB", 4);
    c.equalInt("encoded_len", cast<long>(b.len), 44);
    local r: ByteReader = ByteReader.over(b.data, b.len);
    c.equalInt("u32le", r.u32le(), 305419896);
    c.equalInt("u16be", cast<long>(r.u16be()), 513);
    c.equalInt("varint", r.varint(), 300);
    c.equalInt("svarint_neg", r.svarint(), -3);
    c.equalInt("svarint_big", r.svarint(), 1000000);
    c.equalInt("u48be", r.u48be(), 123456789012);
    c.equalInt("u64le_neg", r.u64le(), -2);
    c.near("f64le", r.f64le(), 3.25, 0.0);
    local s: string = r.lstr(16);
    c.ok("lstr", Text.equals(s, "hello"));
    Text.release(s);
    local field: char[8];
    r.alpha(4, &field[0], 8);
    c.ok("alpha_trimmed", Text.equals(cast<string>(&field[0]), "AB"));
    c.ok("reader_ok", r.ok() && (r.remaining() == 0));
    r.u8();
    c.ok("overrun_detected", !r.ok() && Text.equals(r.error, "truncated"));
    c.integer("crc32_123456789", Crc32.ofText("123456789"));
    c.equalInt("crc32_known", Crc32.ofText("123456789"), 0xCBF43926);
    local part: long = Crc32.update(0, cast<*u8>("1234"), 4);
    c.equalInt("crc32_incremental", Crc32.update(part, cast<*u8>("56789"), 5), 0xCBF43926);
    c.equalInt("adler32_wikipedia", Crc32.adler32(cast<*u8>("Wikipedia"), 9), 0x11E60398);
    local hex: string = Hex.encode(b.data, 4);
    c.text("hex", hex);
    local back: ByteBuf = ByteBuf.new(4);
    c.equalInt("hex_decode", cast<long>(Hex.decode(hex, &back)), 4);
    c.equalInt("hex_roundtrip", cast<long>(back.at(3)), 18);
    c.equalInt("hex_bad", cast<long>(Hex.decode("zz", &back)), -1);
    Text.release(hex);
    back.destroy();
    local long_varint: ByteBuf = ByteBuf.new(16);
    loop (local i: int = 0; i < 11; i = i + 1) {
        long_varint.u8(255);
    }
    local lr: ByteReader = ByteReader.over(long_varint.data, long_varint.len);
    lr.varint();
    c.ok("varint_overlong", !lr.ok());
    long_varint.destroy();
    b.destroy();
}

frame testFixCodec(c: *Check) {
    c.begin("fix_codec");
    local t: CharBuf = CharBuf.new(32);
    FixTime.format(1762790400123, &t);
    c.text("time", t.text());
    c.equalInt("time_roundtrip", FixTime.parse(t.text()), 1762790400123);
    c.equalInt("time_leap_day", FixTime.parse("20240229-12:00:00"), 1709208000000);
    c.equalInt("time_invalid", FixTime.parse("20241301-00:00:00"), -1);
    t.destroy();
    local ok: bool = true;
    c.equalInt("decimal", FixDecimal.parseTicks("101.25", 4, &ok), 1012500);
    c.equalInt("decimal_int", FixDecimal.parseTicks("7", 4, &ok), 70000);
    c.equalInt("decimal_neg", FixDecimal.parseTicks("-0.5", 4, &ok), -5000);
    c.equalInt("decimal_trailing_zero", FixDecimal.parseTicks("1.230000", 4, &ok), 12300);
    c.ok("decimal_ok", ok);
    FixDecimal.parseTicks("1.23456", 4, &ok);
    c.ok("decimal_too_precise", !ok);
    ok = true;
    FixDecimal.parseTicks("1.2x", 4, &ok);
    c.ok("decimal_garbage", !ok);
    local b: FixBuilder = FixBuilder.create('|');
    b.begin("D", "CLIENT", "EXCH", 7, 1762790400000);
    b.field(11, "ord-1");
    b.field(55, "ACME");
    b.field(54, "1");
    b.fieldLong(38, 100);
    b.field(40, "2");
    b.fieldTicks(44, 1012500, 4);
    local text: string = b.finish();
    c.text("new_order", text);
    local m: FixMessage;
    c.ok("parse", m.parse(cast<*char>(text), Text.length(text), '|'));
    c.ok("type", m.isType("D"));
    c.equalInt("fields", cast<long>(m.count), 14);
    c.equalInt("seq", m.seqNum(), 7);
    c.equalInt("price_ticks", m.getTicks(44, 4, &ok), 1012500);
    c.ok("missing_tag", m.get(99) == nullptr);
    local rendered: CharBuf = CharBuf.new(64);
    m.render(&rendered);
    c.ok("render_roundtrip", Text.equals(rendered.text(), text));
    rendered.destroy();
    m.destroy();
    # Corrupt one body byte: the checksum no longer matches.
    local bad: *char = cast<*char>(Text.copy(text));
    bad[60] = 'X';
    local m2: FixMessage;
    c.ok("bad_checksum", !m2.parse(bad, Text.length(text), '|'));
    c.text("bad_checksum_error", m2.error);
    m2.destroy();
    Text.release(cast<string>(bad));
    local m3: FixMessage;
    c.ok("bad_length", !m3.parse(cast<*char>("8=FIX.4.4|9=6|35=0|10=000|"), 26, '|'));
    c.text("bad_length_error", m3.error);
    m3.destroy();
    local m4: FixMessage;
    c.ok("bad_header", !m4.parse(cast<*char>("35=0|8=FIX.4.4|10=000|"), 22, '|'));
    m4.destroy();
    local m5: FixMessage;
    c.ok("unterminated", !m5.parse(cast<*char>("8=FIX.4.4|9=5"), 13, '|'));
    c.text("unterminated_error", m5.error);
    m5.destroy();
    # SOH framing gives the same checksum as the pipe rendering.
    local soh: FixBuilder = FixBuilder.create(cast<char>(1));
    soh.begin("0", "A", "B", 1, 0);
    local soh_text: string = soh.finish();
    local m6: FixMessage;
    c.ok("soh_parse", m6.parse(cast<*char>(soh_text), Text.length(soh_text), cast<char>(1)));
    m6.destroy();
    soh.destroy();
    b.destroy();
}

# Delivers everything queued on `src` to `dst`, optionally dropping the
# message at index `drop`. Returns the number of messages moved.
frame pump(src: *FixSession, dst: *FixSession, now: long, gw: *FixGateway, drop: int, log: *StrList) ret int {
    local l: StrList = StrList.new(8);
    src.drain(&l);
    local check: Lambda<string>(*OrderRequest) = |r: *OrderRequest| ret string {
        if (r.quantity > 5000) {
            return "max order quantity 5000";
        }
        return nullptr;
    };
    local handler: Lambda<void>(*FixMessage) = |m: *FixMessage| {
        if (gw != nullptr) {
            gw.handle(dst, m, check);
        }
    };
    loop (local i: int = 0; i < l.count; i = i + 1) {
        if (log != nullptr) {
            log.push(l.get(i));
        }
        if (i != drop) {
            dst.receive(l.get(i), now, handler);
        }
    }
    local n: int = l.count;
    l.destroy();
    return n;
}

frame countType(log: *StrList, needle: string) ret int {
    local n: int = 0;
    loop (local i: int = 0; i < log.count; i = i + 1) {
        if (Text.contains(log.get(i), needle)) {
            n = n + 1;
        }
    }
    return n;
}

frame newOrder(s: *FixSession, clid: string, side: string, qty: long, ord_type: string, price: string, tif: string) {
    local b: *FixBuilder = s.start("D");
    b.field(11, clid);
    b.field(55, "ACME");
    b.field(54, side);
    b.fieldLong(38, qty);
    b.field(40, ord_type);
    if (price != nullptr) {
        b.field(44, price);
    }
    if (tif != nullptr) {
        b.field(59, tif);
    }
    s.send(false);
}

frame testFixSession(c: *Check) {
    c.begin("fix_session");
    local cli: FixSession;
    cli.init("CLIENT", "EXCH", 30, '|');
    local srv: FixSession;
    srv.init("EXCH", "CLIENT", 30, '|');
    local log: StrList = StrList.new(32);
    cli.logon(1000, false);
    pump(&cli, &srv, 1000, nullptr, -1, &log);
    pump(&srv, &cli, 1000, nullptr, -1, &log);
    c.ok("both_active", cli.isActive() && srv.isActive());
    c.text("logon", log.get(0));
    # Three test requests sent by the client; the second is lost in transit.
    loop (local i: int = 0; i < 3; i = i + 1) {
        local b: *FixBuilder = cli.start("1");
        local id: CharBuf = CharBuf.new(8);
        id.str("T");
        id.integer(cast<long>(i));
        b.field(112, id.text());
        id.destroy();
        cli.send(true);
    }
    pump(&cli, &srv, 2000, nullptr, 1, &log);
    c.equalInt("server_queued", srv.stats.queued, 1);
    c.equalInt("resend_requested", srv.stats.resend_requests, 1);
    pump(&srv, &cli, 2000, nullptr, -1, &log);
    # The client answers with a gap fill (admin messages are not replayed).
    c.equalInt("gap_fills", cli.stats.gap_fills, 1);
    pump(&cli, &srv, 2100, nullptr, -1, &log);
    c.equalInt("server_in_seq", srv.in_seq, 5);
    # The gap fill also covered T2 (admin), so only T0 was answered.
    c.equalInt("server_heartbeats_out", cast<long>(countType(&log, "|35=0|49=EXCH|")), 1);
    pump(&srv, &cli, 2100, nullptr, -1, &log);
    # Application messages are replayed with PossDupFlag; the copy of the
    # message that was queued ahead of the gap is then a duplicate.
    loop (local i: int = 0; i < 3; i = i + 1) {
        local b: *FixBuilder = cli.start("B");
        b.field(148, "news");
        cli.send(false);
    }
    pump(&cli, &srv, 2150, nullptr, 1, &log);
    pump(&srv, &cli, 2150, nullptr, -1, &log);
    c.equalInt("app_replayed", cli.stats.replayed, 2);
    pump(&cli, &srv, 2160, nullptr, -1, &log);
    c.equalInt("app_delivered", srv.stats.app_received, 3);
    c.equalInt("app_duplicate", srv.stats.duplicates, 1);
    c.equalInt("in_seq_after_replay", srv.in_seq, 8);
    # A stale duplicate is ignored; a stale non-duplicate forces logout.
    c.equalInt("client_dups_before", cli.stats.duplicates, 0);
    local dup: string = srv.sent.get(1);
    local handler: Lambda<void>(*FixMessage) = |_m: *FixMessage| {
        return;
    };
    cli.receive(dup, 2200, handler);
    c.equalInt("stale_logged_out", cast<long>(cli.state == SessionState.LogoutSent ? 1 : 0), 1);
    cli.destroy();
    srv.destroy();
    # Timers: heartbeat after an idle interval, test request after 1.2x
    # silence, disconnect after 2x.
    local a: FixSession;
    a.init("A", "B", 10, '|');
    local z: FixSession;
    z.init("B", "A", 10, '|');
    a.logon(0, true);
    pump(&a, &z, 0, nullptr, -1, &log);
    pump(&z, &a, 0, nullptr, -1, &log);
    a.tick(10000);
    c.equalInt("idle_heartbeat", cast<long>(a.outbox.count), 1);
    pump(&a, &z, 10000, nullptr, -1, &log);
    z.tick(22100);
    c.equalInt("test_request", z.stats.test_requests, 1);
    a.tick(20001);
    c.ok("heartbeat_timeout", a.state == SessionState.Closed);
    c.text("timeout_reason", a.logout_reason);
    a.destroy();
    z.destroy();
    log.destroy();
}

frame testFixGateway(c: *Check) {
    c.begin("fix_gateway");
    local e: Engine = Engine.new(1024);
    local sym: int = e.addSymbol("ACME", Ticks.fromFloat(100.0));
    local gw: FixGateway;
    gw.init(&e, "fix-client");
    local cli: FixSession;
    cli.init("CLIENT", "EXCH", 30, '|');
    local srv: FixSession;
    srv.init("EXCH", "CLIENT", 30, '|');
    local log: StrList = StrList.new(32);
    cli.logon(1000, false);
    pump(&cli, &srv, 1000, &gw, -1, nullptr);
    pump(&srv, &cli, 1000, nullptr, -1, nullptr);
    # Liquidity from another participant.
    local other: int = e.accountId("maker");
    local ask1: OrderRequest = OrderRequest.limit(sym, other, Side.Sell, Ticks.fromFloat(100.5), 300);
    local ask2: OrderRequest = OrderRequest.limit(sym, other, Side.Sell, Ticks.fromFloat(101.0), 300);
    e.submit(&ask1);
    e.submit(&ask2);
    newOrder(&cli, "c1", "1", 400, "2", "101", nullptr);
    newOrder(&cli, "c2", "1", 100, "2", "99.5", nullptr);
    newOrder(&cli, "c3", "1", 9000, "1", nullptr, nullptr);
    newOrder(&cli, "c4", "1", 10, "2", nullptr, nullptr);
    newOrder(&cli, "c1", "1", 10, "2", "99", nullptr);
    newOrder(&cli, "c5", "2", 50, "2", "100.25", "4");
    pump(&cli, &srv, 2000, &gw, -1, nullptr);
    pump(&srv, &cli, 2000, nullptr, -1, &log);
    c.equalInt("orders", gw.stats.orders, 3);
    c.equalInt("fills", gw.stats.fills, 2);
    c.equalInt("risk_rejects", gw.stats.risk_rejects, 1);
    c.equalInt("rejects", gw.stats.rejects, 4);
    c.text("first_fill", log.get(1));
    c.equalInt("filled_reports", cast<long>(countType(&log, "|150=F|39=2|")), 1);
    c.equalInt("partial_reports", cast<long>(countType(&log, "|150=F|39=1|")), 1);
    c.equalInt("dup_clordid", cast<long>(countType(&log, "|103=6|")), 1);
    c.equalInt("fok_killed", cast<long>(countType(&log, "|11=c5|17=E")), 1);
    # A passive fill on the resting bid comes from another participant.
    local hit: OrderRequest = OrderRequest.limit(sym, other, Side.Sell, Ticks.fromFloat(99.5), 60);
    e.submit(&hit);
    gw.sync(&srv);
    log.clear();
    pump(&srv, &cli, 2500, nullptr, -1, &log);
    c.equalInt("passive_fill", cast<long>(countType(&log, "|11=c2|")), 1);
    c.ok("passive_fill_qty", Text.contains(log.get(0), "|151=40|14=60|"));
    # Replace the rest of c2 (price change re-enters under a new engine id), then cancel it.
    local g: *FixBuilder = cli.start("G");
    g.field(11, "c2b");
    g.field(41, "c2");
    g.field(55, "ACME");
    g.field(54, "1");
    g.fieldLong(38, 150);
    g.field(40, "2");
    g.field(44, "99.75");
    cli.send(false);
    local f: *FixBuilder = cli.start("F");
    f.field(11, "c2c");
    f.field(41, "c2b");
    f.field(55, "ACME");
    f.field(54, "1");
    cli.send(false);
    local f2: *FixBuilder = cli.start("F");
    f2.field(11, "c2d");
    f2.field(41, "c2b");
    cli.send(false);
    log.clear();
    pump(&cli, &srv, 3000, &gw, -1, nullptr);
    pump(&srv, &cli, 3000, nullptr, -1, &log);
    c.equalInt("replaced", gw.stats.replaces, 1);
    c.ok("replace_report", Text.contains(log.get(0), "|150=5|39=1|"));
    c.ok("replace_leaves", Text.contains(log.get(0), "|38=150|44=99.75|151=90|14=60|"));
    c.equalInt("cancelled", gw.stats.cancels, 1);
    c.equalInt("cancel_rejected", gw.stats.cancel_rejects, 1);
    c.equalInt("open_orders", cast<long>(gw.openCount()), 0);
    c.ok("engine_valid", e.validate() == nullptr);
    log.destroy();
    cli.destroy();
    srv.destroy();
    gw.destroy();
    e.destroy();
}

frame testItch(c: *Check) {
    c.begin("itch");
    local m: ItchMsg = ItchCodec.blank('U', 3, 34200000001234);
    m.ref = 77;
    m.new_ref = 78;
    m.shares = 500;
    m.price = 1012500;
    local b: ByteBuf = ByteBuf.new(8);
    ItchCodec.encode(&m, &b);
    c.equalInt("replace_size", cast<long>(b.len), cast<long>(ItchCodec.bodySize('U')));
    local r: ByteReader = ByteReader.over(b.data, b.len);
    local d: ItchMsg;
    c.ok("decode", ItchCodec.decode(&r, b.len, &d));
    c.ok("fields", (d.kind == 'U') && (d.locate == 3) && (d.timestamp == 34200000001234) && (d.ref == 77) && (d.new_ref == 78) && (d.shares == 500) && (d.price == 1012500));
    local r2: ByteReader = ByteReader.over(b.data, b.len - 1);
    c.ok("short_rejected", !ItchCodec.decode(&r2, b.len - 1, &d));
    b.destroy();
    local clean: FeedReplayResult = FeedSim.run(cast<u64>(11), 20000, 3, 512, 0);
    c.equalInt("messages", clean.messages, clean.applied);
    c.integer("packets", cast<long>(clean.packets));
    c.integer("messages_total", clean.messages);
    c.integer("bytes", clean.bytes);
    c.integer("adds", clean.adds);
    c.integer("executions", clean.executions);
    c.integer("deletes", clean.deletes);
    c.equalInt("clean_mismatch", cast<long>(clean.mismatched_levels), 0);
    c.equalInt("clean_live_orders", cast<long>(clean.live_orders), cast<long>(clean.engine_orders));
    local lossy: FeedReplayResult = FeedSim.run(cast<u64>(11), 20000, 3, 512, 7);
    c.integer("dropped", cast<long>(lossy.dropped));
    c.equalInt("gaps_recovered", cast<long>(lossy.recovered), lossy.gaps);
    c.equalInt("lossy_applied", lossy.applied, clean.messages);
    c.equalInt("lossy_mismatch", cast<long>(lossy.mismatched_levels), 0);
    c.equalInt("lossy_volume", lossy.volume, clean.volume);
    c.ok("spread_positive", (lossy.best_bid > 0) && (lossy.best_ask > lossy.best_bid));
    # Choose a drop rate that loses the final packet: only the tail check recovers it.
    local tail_drop: int = clean.packets;
    local tail: FeedReplayResult = FeedSim.run(cast<u64>(11), 20000, 3, 512, tail_drop);
    c.equalInt("tail_recovered", cast<long>(tail.tail_recovered), 1);
    c.equalInt("tail_mismatch", cast<long>(tail.mismatched_levels), 0);
}

frame runProtoTests(c: *Check) {
    testWire(c);
    testFixCodec(c);
    testFixSession(c);
    testFixGateway(c);
    testItch(c);
}
