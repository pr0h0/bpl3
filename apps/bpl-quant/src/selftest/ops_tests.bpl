# Self-tests for pre-trade risk limits and the event-sourced journal.

import [Check] from "./check.bpl";
import [Text] from "../core/text.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [LVec] from "../core/vec.bpl";
import [ByteBuf] from "../proto/wire.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [Ticks], [Side], [OrderType], [TimeInForce] from "../market/order.bpl";
import [RiskEngine], [RiskRule], [AccountLimits], [RiskDecision], [RiskBreach] from "../risk/limits.bpl";
import [JournaledEngine], [EngineSnapshot], [RecoveryReport] from "../journal/journal.bpl";

export runOpsTests;

frame px(v: float) ret long {
    return Ticks.fromFloat(v);
}

frame testRiskLimits(c: *Check) {
    c.begin("risk_limits");
    local e: Engine = Engine.new(1024);
    local acme: int = e.addSymbol("ACME", px(100.0));
    local glob: int = e.addSymbol("GLOBEX", px(40.0));
    local limits: AccountLimits = RiskEngine.standardLimits();
    limits.max_order_qty = 1000;
    limits.max_order_notional = 50000.0;
    limits.max_position = 1500;
    limits.max_gross_notional = 10000000.0;
    limits.max_open_orders = 5;
    limits.rate_per_sec = 10.0;
    limits.burst = 20.0;
    limits.collar_bps = 500;
    limits.max_loss = 2000.0;
    local risk: RiskEngine;
    risk.init(&e, limits);
    local trader: int = e.accountId("trader");
    local maker: int = e.accountId("maker");
    local loose: AccountLimits = RiskEngine.standardLimits();
    risk.setLimits(maker, loose);
    local d: RiskDecision;
    # Size, notional and collar.
    local big: OrderRequest = OrderRequest.limit(acme, trader, Side.Buy, px(100.0), 1001);
    risk.submit(&big, 0, &d);
    c.ok("order_quantity", d.rule == RiskRule.OrderQuantity);
    local rich: OrderRequest = OrderRequest.limit(acme, trader, Side.Buy, px(104.0), 600);
    risk.submit(&rich, 0, &d);
    c.ok("order_notional", d.rule == RiskRule.OrderNotional);
    c.near("notional_value", d.value, 62400.0, 0.0);
    local wide: OrderRequest = OrderRequest.limit(acme, trader, Side.Buy, px(94.0), 10);
    risk.submit(&wide, 0, &d);
    c.ok("price_collar", d.rule == RiskRule.PriceCollar);
    c.near("collar_bps", d.value, 600.0, 0.0);
    # Worst-case position counts open orders on the same side.
    local b1: OrderRequest = OrderRequest.limit(acme, trader, Side.Buy, px(99.0), 400);
    local r1: ExecReport = risk.submit(&b1, 0, &d);
    c.ok("accepted", (d.rule == RiskRule.Pass) && r1.resting);
    local b2: OrderRequest = OrderRequest.limit(acme, trader, Side.Buy, px(99.5), 400);
    risk.submit(&b2, 0, &d);
    local b3: OrderRequest = OrderRequest.limit(acme, trader, Side.Buy, px(98.5), 400);
    risk.submit(&b3, 0, &d);
    c.equalInt("open_buy_orders", cast<long>(risk.openOrders(trader)), 3);
    local b4: OrderRequest = OrderRequest.limit(acme, trader, Side.Buy, px(98.0), 400);
    risk.submit(&b4, 0, &d);
    c.ok("position_limit", d.rule == RiskRule.Position);
    c.near("worst_position", d.value, 1600.0, 0.0);
    # A sell on the other side is not limited by the open buys.
    local s1: OrderRequest = OrderRequest.limit(acme, trader, Side.Sell, px(101.0), 400);
    risk.submit(&s1, 0, &d);
    c.ok("opposite_side_ok", d.rule == RiskRule.Pass);
    c.near("open_notional", risk.openNotional(trader), 159200.0, 0.000001);
    # Fills move exposure into the position: the sell takes 400 @ 99.5, then 200 @ 99.
    local hit: OrderRequest = OrderRequest.limit(acme, maker, Side.Sell, px(99.0), 600);
    risk.submit(&hit, 0, &d);
    c.equalInt("position_after_fill", risk.position(trader, acme), 600);
    c.equalInt("maker_position", risk.position(maker, acme), -600);
    c.equalInt("open_after_fill", cast<long>(risk.openOrders(trader)), 3);
    c.near("open_notional_after", risk.openNotional(trader), 99600.0, 0.000001);
    local g1: OrderRequest = OrderRequest.limit(glob, trader, Side.Sell, px(40.0), 1000);
    risk.submit(&g1, 0, &d);
    c.ok("second_symbol_ok", d.rule == RiskRule.Pass);
    # Gross open notional on its own account.
    local gross_limits: AccountLimits = RiskEngine.standardLimits();
    gross_limits.max_gross_notional = 50000.0;
    gross_limits.max_open_orders = 2;
    local fund: int = e.accountId("fund");
    risk.setLimits(fund, gross_limits);
    local f1: OrderRequest = OrderRequest.limit(glob, fund, Side.Buy, px(39.0), 1000);
    risk.submit(&f1, 0, &d);
    c.ok("gross_ok", d.rule == RiskRule.Pass);
    local f2: OrderRequest = OrderRequest.limit(glob, fund, Side.Buy, px(39.5), 300);
    risk.submit(&f2, 0, &d);
    c.ok("gross_notional", d.rule == RiskRule.GrossNotional);
    c.near("gross_value", d.value, 50850.0, 0.000001);
    local f3: OrderRequest = OrderRequest.limit(glob, fund, Side.Buy, px(39.5), 10);
    risk.submit(&f3, 0, &d);
    local f4: OrderRequest = OrderRequest.limit(glob, fund, Side.Buy, px(39.5), 10);
    risk.submit(&f4, 0, &d);
    c.ok("open_order_count", d.rule == RiskRule.OpenOrders);
    # Cancels release exposure.
    risk.cancel(r1.order_id + 2);
    c.equalInt("open_after_cancel", cast<long>(risk.openOrders(trader)), 3);
    risk.cancel(r1.order_id);
    c.near("open_notional_cancelled", risk.openNotional(trader), 40400.0 + 40000.0, 0.000001);
    # Restricted list.
    risk.restrict(glob, true);
    local g5: OrderRequest = OrderRequest.limit(glob, maker, Side.Buy, px(39.0), 10);
    risk.submit(&g5, 0, &d);
    c.ok("restricted", d.rule == RiskRule.Restricted);
    risk.restrict(glob, false);
    # Rate limit: the burst runs out, then refills with time.
    local rate: AccountLimits = RiskEngine.standardLimits();
    rate.rate_per_sec = 10.0;
    rate.burst = 3.0;
    local fast: int = e.accountId("fast");
    risk.setLimits(fast, rate);
    local accepted: int = 0;
    loop (local i: int = 0; i < 5; i = i + 1) {
        local q: OrderRequest = OrderRequest.limit(glob, fast, Side.Buy, px(39.0), 1);
        d = risk.check(&q, 1000);
        if (d.rule == RiskRule.Pass) {
            accepted = accepted + 1;
        }
    }
    c.equalInt("burst_accepted", cast<long>(accepted), 3);
    c.ok("rate_limited", d.rule == RiskRule.OrderRate);
    local later: OrderRequest = OrderRequest.limit(glob, fast, Side.Buy, px(39.0), 1);
    c.ok("refilled", risk.check(&later, 1200).rule == RiskRule.Pass);
    # Loss limit from mark-to-market: the trader bought 600 at 99, the
    # market trades down to 95.
    local down1: OrderRequest = OrderRequest.limit(acme, maker, Side.Buy, px(95.0), 10);
    local down2: OrderRequest = OrderRequest.limit(acme, fast, Side.Sell, px(95.0), 10);
    e.submit(&down1);
    e.submit(&down2);
    c.near("trader_pnl", risk.pnl(trader), -2600.0, 0.000001);
    local more: OrderRequest = OrderRequest.limit(acme, trader, Side.Sell, px(95.0), 10);
    risk.submit(&more, 2000, &d);
    c.ok("loss_limit", d.rule == RiskRule.LossLimit);
    # Kill switch cancels open orders and blocks new ones.
    local killed: int = risk.kill(trader);
    c.equalInt("kill_cancelled", cast<long>(killed), 2);
    c.equalInt("kill_open_orders", cast<long>(risk.openOrders(trader)), 0);
    c.near("kill_open_notional", risk.openNotional(trader), 0.0, 0.000001);
    local after: OrderRequest = OrderRequest.limit(acme, trader, Side.Buy, px(95.0), 1);
    risk.submit(&after, 3000, &d);
    c.ok("kill_blocks", d.rule == RiskRule.KillSwitch);
    risk.revive(trader);
    c.ok("revived", !risk.isKilled(trader));
    c.integer("breaches", risk.breach_total);
    local last: *RiskBreach = risk.breachAt(risk.breach_count - 1);
    c.text("last_breach", RiskEngine.ruleName(last.rule));
    c.equalInt("rate_breaches", risk.ruleCount(RiskRule.OrderRate), 2);
    c.ok("engine_valid", e.validate() == nullptr);
    risk.destroy();
    e.destroy();
}

# Random order flow through a journaled engine.
frame drive(je: *JournaledEngine, rng: *Xoshiro, steps: int, live: *LVec) {
    local accounts: int[3] = [je.accountId("a"), je.accountId("b"), je.accountId("c")];
    loop (local i: int = 0; i < steps; i = i + 1) {
        local sym: int = rng.range(0, je.engine.book_count);
        local mid: long = je.engine.books[sym].reference_price;
        local tick: long = mid / 1000;
        local u: float = rng.nextFloat();
        local acct: int = accounts[rng.range(0, 3)];
        if ((u < 0.55) || (live.len == 0)) {
            local side: Side = rng.chance(0.5) ? Side.Buy : Side.Sell;
            local req: OrderRequest = OrderRequest.limit(sym, acct, side, mid + (cast<long>(rng.range(-15, 16)) * tick), cast<long>(rng.range(1, 40) * 5));
            if (rng.chance(0.1)) {
                req.tif = TimeInForce.Day;
            }
            if (rng.chance(0.05)) {
                req.kind = OrderType.Stop;
                req.stop_price = mid + (cast<long>(rng.range(-10, 11)) * tick);
                req.price = 0;
            }
            local r: ExecReport = je.submit(&req);
            if (r.order_id != 0) {
                live.push(r.order_id);
            }
        } else if (u < 0.8) {
            local k: int = rng.range(0, live.len);
            je.cancel(live.data[k]);
            live.data[k] = live.data[live.len - 1];
            live.len = live.len - 1;
        } else if (u < 0.95) {
            local k: int = rng.range(0, live.len);
            local r: ExecReport = je.replace(live.data[k], mid + (cast<long>(rng.range(-5, 6)) * tick), cast<long>(rng.range(5, 60) * 5));
            if (r.order_id != 0) {
                live.data[k] = r.order_id;
            }
        } else {
            local req: OrderRequest = OrderRequest.market(sym, acct, rng.chance(0.5) ? Side.Buy : Side.Sell, cast<long>(rng.range(1, 30) * 5));
            je.submit(&req);
        }
    }
}

frame testJournal(c: *Check) {
    c.begin("journal");
    local je: JournaledEngine;
    je.init(100000);
    je.addSymbol("ACME", px(100.0));
    je.addSymbol("GLOBEX", px(42.5));
    je.setBand(1, 2000);
    local rng: Xoshiro = Xoshiro.new(cast<u64>(404));
    local live: LVec = LVec.new(256);
    drive(&je, &rng, 3000, &live);
    local snap: EngineSnapshot = je.snapshot();
    c.integer("snapshot_seq", snap.seq);
    c.integer("snapshot_bytes", cast<long>(snap.data.len));
    drive(&je, &rng, 2000, &live);
    je.endOfDay();
    drive(&je, &rng, 500, &live);
    local live_hash: u64 = JournaledEngine.stateHash(&je.engine);
    c.integer("records", je.journal.records);
    c.integer("journal_bytes", cast<long>(je.journal.bytes()));
    c.integer("open_orders", cast<long>(je.engine.openOrders()));
    c.integer("trades", je.engine.stats.trades);
    # Full replay from an empty engine.
    local full: Engine = Engine.new(100000);
    local rf: RecoveryReport = JournaledEngine.recover(&full, nullptr, &je.journal.log);
    c.equalInt("full_replayed", rf.replayed, je.journal.records);
    c.ok("full_clean", (rf.error == nullptr) && (rf.torn_bytes == 0));
    c.ok("full_hash", JournaledEngine.stateHash(&full) == live_hash);
    full.destroy();
    # Snapshot plus tail.
    local fast: Engine = Engine.new(100000);
    local rs: RecoveryReport = JournaledEngine.recover(&fast, &snap, &je.journal.log);
    c.equalInt("tail_skipped", rs.skipped, snap.seq);
    c.equalInt("tail_replayed", rs.replayed, je.journal.records - snap.seq);
    c.ok("snapshot_hash", JournaledEngine.stateHash(&fast) == live_hash);
    c.ok("snapshot_valid", fast.validate() == nullptr);
    # The recovered engine keeps trading identically.
    local probe: OrderRequest = OrderRequest.limit(0, fast.accountId("a"), Side.Buy, px(101.0), 300);
    local probe_live: OrderRequest = OrderRequest.limit(0, je.engine.accountId("a"), Side.Buy, px(101.0), 300);
    local pr: ExecReport = fast.submit(&probe);
    local pl: ExecReport = je.engine.submit(&probe_live);
    c.ok("same_execution", (pr.order_id == pl.order_id) && (pr.filled == pl.filled) && (pr.notional == pl.notional));
    c.ok("same_after_probe", JournaledEngine.stateHash(&fast) == JournaledEngine.stateHash(&je.engine));
    fast.destroy();
    # A torn final record: recovery stops at the last complete record.
    local torn: ByteBuf = ByteBuf.new(je.journal.log.len);
    torn.bytes(je.journal.log.data, je.journal.log.len - 3);
    local tr: Engine = Engine.new(100000);
    local rt: RecoveryReport = JournaledEngine.recover(&tr, &snap, &torn);
    c.equalInt("torn_replayed", rt.replayed, je.journal.records - snap.seq - 1);
    c.text("torn_error", rt.error);
    c.ok("torn_bytes", rt.torn_bytes > 0);
    tr.destroy();
    # A flipped bit in the middle: CRC stops the replay there.
    local bad: ByteBuf = ByteBuf.new(je.journal.log.len);
    bad.bytes(je.journal.log.data, je.journal.log.len);
    bad.data[bad.len / 2] = cast<u8>(cast<int>(bad.data[bad.len / 2]) ^ 16);
    local br: Engine = Engine.new(100000);
    local rb: RecoveryReport = JournaledEngine.recover(&br, nullptr, &bad);
    c.ok("crc_detected", rb.corrupt && (rb.replayed < je.journal.records));
    c.text("crc_error", rb.error);
    br.destroy();
    # A corrupted snapshot is rejected outright.
    snap.data.data[20] = cast<u8>(cast<int>(snap.data.data[20]) ^ 1);
    local sr: Engine = Engine.new(1024);
    local rsn: RecoveryReport = JournaledEngine.recover(&sr, &snap, &je.journal.log);
    c.text("snapshot_corrupt", rsn.error);
    sr.destroy();
    snap.data.data[20] = cast<u8>(cast<int>(snap.data.data[20]) ^ 1);
    # Compaction drops covered records but keeps recovery exact.
    local dropped: int = je.compact(&snap);
    c.equalInt("compacted", cast<long>(dropped), snap.seq);
    local cr: Engine = Engine.new(100000);
    local rc: RecoveryReport = JournaledEngine.recover(&cr, &snap, &je.journal.log);
    c.equalInt("compact_skipped", rc.skipped, 0);
    c.ok("compact_hash", JournaledEngine.stateHash(&cr) == live_hash);
    cr.destroy();
    local rec_type: int = 0;
    local rec_seq: long = 0;
    local rec_size: int = 0;
    c.ok("record_info", je.recordInfo(0, &rec_type, &rec_seq, &rec_size) && (rec_seq == (snap.seq + 1)));
    torn.destroy();
    bad.destroy();
    snap.destroy();
    live.destroy();
    je.destroy();
}

frame runOpsTests(c: *Check) {
    testRiskLimits(c);
    testJournal(c);
}
