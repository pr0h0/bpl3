# Deterministic feed generation and lossy replay.
#
# FeedSim drives a FeedPublisher with seeded random order flow (limit
# orders around a moving mid, cancels, replaces and market orders), then
# replays the recorded packets into a fresh FeedBook while dropping every
# `drop_every`-th packet. Gaps are recovered from the publisher's packet
# store, and a tail check catches a lost final packet. The result records
# feed statistics and whether every rebuilt book equals the engine's.

import [Xoshiro] from "../core/prng.bpl";
import [LVec] from "../core/vec.bpl";
import [Clock] from "../core/clock.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [Ticks], [Side] from "../market/order.bpl";
import [ItchMsg], [MoldReader], [MoldPacket] from "./itch.bpl";
import [FeedPublisher], [FeedBook] from "./feed.bpl";

export [FeedSim];
export [FeedReplayResult];

struct FeedReplayResult {
    events: int,
    packets: int,
    messages: long,
    bytes: long,
    adds: long,
    executions: long,
    deletes: long,
    partial_cancels: long,
    dropped: int,
    gaps: long,
    recovered: int,
    tail_recovered: int,
    applied: long,
    live_orders: int,
    engine_orders: int,
    mismatched_levels: int,
    best_bid: long,
    best_ask: long,
    volume: long,
    generate_ms: float,
    replay_ms: float,
}

struct FeedSim {
    frame generate(pub: *FeedPublisher, e: *Engine, seed: u64, events: int) {
        local rng: Xoshiro = Xoshiro.new(seed);
        local live: LVec = LVec.new(256);
        local mids: long[8];
        loop (local s: int = 0; s < e.book_count; s = s + 1) {
            if (s < 8) {
                mids[s] = e.books[s].reference_price;
            }
        }
        local symbols: int = e.book_count < 8 ? e.book_count : 8;
        local a: int = e.accountId("feed-a");
        local b: int = e.accountId("feed-b");
        loop (local i: int = 0; i < events; i = i + 1) {
            local sym: int = rng.range(0, symbols);
            local tick: long = mids[sym] / 1000;
            if (rng.chance(0.02)) {
                mids[sym] = mids[sym] + (rng.chance(0.5) ? tick : -tick);
            }
            local u: float = rng.nextFloat();
            local acct: int = rng.chance(0.5) ? a : b;
            if ((u < 0.6) || (live.len == 0)) {
                local side: Side = rng.chance(0.5) ? Side.Buy : Side.Sell;
                local px: long = mids[sym] + (cast<long>(rng.range(-20, 21)) * tick);
                local req: OrderRequest = OrderRequest.limit(sym, acct, side, px, cast<long>(rng.range(1, 50) * 10));
                local r: ExecReport = pub.submit(&req);
                if (r.resting) {
                    live.push(r.order_id);
                }
            } else if (u < 0.85) {
                local k: int = rng.range(0, live.len);
                pub.cancel(live.data[k]);
                live.data[k] = live.data[live.len - 1];
                live.len = live.len - 1;
            } else if (u < 0.95) {
                local k: int = rng.range(0, live.len);
                local r: ExecReport = pub.replace(live.data[k], mids[sym] + (cast<long>(rng.range(-5, 6)) * tick), cast<long>(rng.range(1, 30) * 10));
                if (r.order_id != 0) {
                    live.data[k] = r.order_id;
                }
            } else {
                local side: Side = rng.chance(0.5) ? Side.Buy : Side.Sell;
                local req: OrderRequest = OrderRequest.market(sym, acct, side, cast<long>(rng.range(1, 20) * 10));
                pub.submit(&req);
            }
        }
        live.destroy();
    }

    # Full run on a fresh engine with `symbols` listings.
    frame run(seed: u64, events: int, symbols: int, packet_bytes: int, drop_every: int) ret FeedReplayResult {
        local names: string[6] = ["ACME", "GLOBEX", "INITECH", "UMBRELLA", "HOOLI", "STARK"];
        local prices: float[6] = [100.0, 42.5, 15.25, 230.0, 75.0, 310.0];
        local e: Engine = Engine.new(events + 16);
        local n: int = symbols < 1 ? 1 : (symbols > 6 ? 6 : symbols);
        loop (local i: int = 0; i < n; i = i + 1) {
            e.addSymbol(names[i], Ticks.fromFloat(prices[i]));
        }
        local pub: FeedPublisher;
        pub.init(&e, "BPLQ000001", packet_bytes);
        local started: long = Clock.nowNs();
        pub.open();
        FeedSim.generate(&pub, &e, seed, events);
        pub.close();
        local r: FeedReplayResult;
        r.generate_ms = Clock.elapsedMs(started);
        r.events = events;
        r.packets = pub.writer.packet_count;
        r.messages = pub.writer.total_messages;
        r.bytes = pub.writer.total_bytes;
        r.adds = pub.stats.adds;
        r.executions = pub.stats.executions;
        r.deletes = pub.stats.deletes + pub.stats.replaces;
        r.partial_cancels = pub.stats.cancels;
        started = Clock.nowNs();
        local fb: FeedBook;
        fb.init(n);
        local fbp: *FeedBook = &fb;
        local rd: MoldReader;
        rd.init();
        local handler: Lambda<void>(*ItchMsg) = |m: *ItchMsg| {
            fbp.apply(m);
        };
        r.dropped = 0;
        r.recovered = 0;
        r.tail_recovered = 0;
        loop (local p: int = 0; p < pub.writer.packet_count; p = p + 1) {
            if ((drop_every > 0) && ((p % drop_every) == (drop_every - 1))) {
                r.dropped = r.dropped + 1;
                continue;
            }
            local pk: *MoldPacket = pub.writer.packets + p;
            local missing: long = rd.accept(pk.data.data, pk.data.len, handler);
            loop (missing > 0) {
                local gi: int = pub.writer.packetFor(missing);
                if (gi < 0) {
                    break;
                }
                local g: *MoldPacket = pub.writer.packets + gi;
                rd.accept(g.data.data, g.data.len, handler);
                r.recovered = r.recovered + 1;
                missing = rd.accept(pk.data.data, pk.data.len, handler);
            }
        }
        # End-of-session check: request anything after the last packet seen.
        loop (rd.expected < pub.writer.next_seq) {
            local gi: int = pub.writer.packetFor(rd.expected);
            if (gi < 0) {
                break;
            }
            local g: *MoldPacket = pub.writer.packets + gi;
            rd.accept(g.data.data, g.data.len, handler);
            r.tail_recovered = r.tail_recovered + 1;
        }
        r.replay_ms = Clock.elapsedMs(started);
        r.gaps = rd.gaps;
        r.applied = rd.messages;
        r.live_orders = fb.liveOrders();
        r.engine_orders = e.openOrders();
        r.mismatched_levels = 0;
        loop (local s: int = 0; s < n; s = s + 1) {
            r.mismatched_levels = r.mismatched_levels + fb.compare(&e, s);
        }
        r.best_bid = fb.bestBid(1);
        r.best_ask = fb.bestAsk(1);
        r.volume = fb.volume;
        fb.destroy();
        pub.destroy();
        e.destroy();
        return r;
    }
}
