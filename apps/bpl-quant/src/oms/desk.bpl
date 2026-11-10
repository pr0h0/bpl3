# Order-management desk: a risk-checked, journaled venue.
#
# Unlike the simulator-driven engine in AppState, every state change of the
# desk goes through the journal, so the desk can be snapshotted and
# recovered exactly. Orders arrive as JSON (the API) or FIX (an in-process
# client session talking to the FIX gateway); both pass the same pre-trade
# risk checks. Risk exposure follows fills and cancels on every action.

import malloc from "std/c.bpl";
import [Text] from "../core/text.bpl";
import [StrList] from "../core/strlist.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [Ticks], [OrderStatus], [Order] from "../market/order.bpl";
import [RiskEngine], [RiskRule], [AccountLimits], [RiskDecision] from "../risk/limits.bpl";
import [JournaledEngine], [EngineSnapshot], [RecoveryReport] from "../journal/journal.bpl";
import [FixMessage], [FixBuilder] from "../proto/fix.bpl";
import [FixSession] from "../proto/fix_session.bpl";
import [FixGateway], [GwOrder] from "../proto/fix_gateway.bpl";

export [Desk];
export [DeskResult];
export [RecoveryCheck];

struct DeskResult {
    decision: RiskDecision,
    report: ExecReport,
    accepted: bool,
}

struct RecoveryCheck {
    report: RecoveryReport,
    live_hash: u64,
    recovered_hash: u64,
    matches: bool,
    open_orders: int,
    used_snapshot: bool,
}

struct Desk {
    venue: JournaledEngine,
    risk: RiskEngine,
    gateway: FixGateway,
    client: FixSession,
    server: FixSession,
    snapshot: EngineSnapshot,
    has_snapshot: bool,
    now_ms: long,
    fix_log: StrList,

    # Heap allocation; init() stores the vtable word (BUG-800).
    frame create() ret *Desk {
        local d: *Desk = cast<*Desk>(malloc(sizeof(Desk)));
        d.init();
        return d;
    }

    frame init(this: *Desk) {
        this.venue.init(65536);
        local names: string[6] = ["ACME", "GLOBEX", "INITECH", "UMBRELLA", "HOOLI", "STARK"];
        local prices: float[6] = [100.0, 42.5, 15.25, 230.0, 75.0, 310.0];
        loop (local i: int = 0; i < 6; i = i + 1) {
            this.venue.addSymbol(names[i], Ticks.fromFloat(prices[i]));
        }
        this.risk.init(&this.venue.engine, RiskEngine.standardLimits());
        # The gateway account is created through the journal first.
        this.venue.accountId("fix");
        this.gateway.init(&this.venue.engine, "fix");
        this.gateway.useJournal(&this.venue);
        this.client.init("CLIENT", "DESK", 30, '|');
        this.server.init("DESK", "CLIENT", 30, '|');
        this.has_snapshot = false;
        this.now_ms = 0;
        this.fix_log = StrList.new(16);
        this.client.logon(0, true);
        this.pump();
    }

    frame advance(this: *Desk, now_ms: long) {
        if (now_ms > this.now_ms) {
            this.now_ms = now_ms;
        }
    }

    # Risk check, then journaled submit; exposure is updated from the result.
    frame submit(this: *Desk, req: *OrderRequest) ret DeskResult {
        local out: DeskResult;
        out.decision = this.risk.check(req, this.now_ms);
        out.report = Engine.emptyReport();
        out.accepted = out.decision.rule == RiskRule.Pass;
        if (!out.accepted) {
            return out;
        }
        out.report = this.venue.submit(req);
        if (out.report.order_id != 0) {
            this.risk.track(out.report.order_id, req, req.quantity);
        }
        this.settle();
        return out;
    }

    frame cancel(this: *Desk, order_id: long) ret bool {
        local ok: bool = this.venue.cancel(order_id);
        this.settle();
        return ok;
    }

    # Replacement orders are risk-checked like new ones.
    frame replace(this: *Desk, order_id: long, price: long, quantity: long, decision: *RiskDecision) ret ExecReport {
        local o: *Order = this.venue.engine.findOrder(order_id);
        if (o == nullptr) {
            *decision = RiskEngine.decision(RiskRule.Pass, nullptr, 0.0, 0.0);
            return this.venue.replace(order_id, price, quantity);
        }
        local req: OrderRequest = OrderRequest.limit(o.symbol, o.account, o.side, price, quantity - o.filled());
        # The order being replaced no longer counts against the new one.
        this.risk.release(order_id, o.remaining);
        *decision = this.risk.check(&req, this.now_ms);
        if (decision.rule != RiskRule.Pass) {
            this.risk.reconcile();
            this.rebook(order_id);
            return Engine.emptyReport();
        }
        local r: ExecReport = this.venue.replace(order_id, price, quantity);
        if ((r.order_id != 0) && (r.status != OrderStatus.Rejected)) {
            this.risk.track(r.order_id, &req, r.order_id == order_id ? r.remaining : req.quantity);
        } else {
            this.rebook(order_id);
        }
        this.settle();
        return r;
    }

    # Re-tracks an order whose exposure was released for a failed replace.
    frame rebook(this: *Desk, order_id: long) {
        local o: *Order = this.venue.engine.findOrder(order_id);
        if ((o == nullptr) || !o.isOpen()) {
            return;
        }
        local req: OrderRequest = OrderRequest.limit(o.symbol, o.account, o.side, o.price, o.remaining);
        this.risk.track(order_id, &req, o.remaining);
    }

    frame settle(this: *Desk) {
        this.risk.syncTrades();
        this.risk.reconcile();
    }

    # Gateway orders: fills first (positions), then open exposure for any
    # open order not yet tracked (new or re-entered by a replace).
    frame settleGateway(this: *Desk) {
        this.risk.syncTrades();
        loop (local i: int = 0; i < this.gateway.count; i = i + 1) {
            local g: *GwOrder = this.gateway.orders + i;
            if (g.open && !this.risk.tracked_index.has(g.order_id)) {
                local req: OrderRequest = OrderRequest.limit(g.symbol, this.gateway.account, g.side, g.price, g.quantity - g.cum);
                this.risk.track(g.order_id, &req, g.quantity - g.cum);
            }
        }
        this.risk.reconcile();
    }

    frame kill(this: *Desk, account: int) ret int {
        # Cancels go through the journal so recovery sees them.
        local cancelled: int = 0;
        this.risk.account(account).killed = true;
        loop (local i: int = 0; i < this.risk.tracked_count; i = i + 1) {
            local id: long = this.risk.tracked[i].order_id;
            if ((this.risk.tracked[i].account == account) && (this.risk.tracked[i].remaining > 0)) {
                if (this.venue.cancel(id)) {
                    cancelled = cancelled + 1;
                }
            }
        }
        this.settle();
        return cancelled;
    }

    frame takeSnapshot(this: *Desk) ret long {
        if (this.has_snapshot) {
            this.snapshot.destroy();
        }
        this.snapshot = this.venue.snapshot();
        this.has_snapshot = true;
        return this.snapshot.seq;
    }

    # Rebuilds the venue in a scratch engine and compares state digests.
    frame verifyRecovery(this: *Desk, use_snapshot: bool) ret RecoveryCheck {
        local check: RecoveryCheck;
        local scratch: Engine = Engine.new(65536);
        local snap: *EngineSnapshot = (use_snapshot && this.has_snapshot) ? &this.snapshot : nullptr;
        check.used_snapshot = snap != nullptr;
        check.report = JournaledEngine.recover(&scratch, snap, &this.venue.journal.log);
        check.live_hash = JournaledEngine.stateHash(&this.venue.engine);
        check.recovered_hash = JournaledEngine.stateHash(&scratch);
        check.matches = check.live_hash == check.recovered_hash;
        check.open_orders = scratch.openOrders();
        scratch.destroy();
        return check;
    }

    frame compact(this: *Desk) ret int {
        if (!this.has_snapshot) {
            return 0;
        }
        return this.venue.compact(&this.snapshot);
    }

    # Moves messages between the in-process FIX client and the desk's
    # session until both are quiet, recording everything sent.
    frame pump(this: *Desk) {
        local desk: *Desk = this;
        local check: Lambda<string>(*OrderRequest) = |r: *OrderRequest| ret string {
            local d: RiskDecision = desk.risk.check(r, desk.now_ms);
            if (d.rule != RiskRule.Pass) {
                return d.message;
            }
            return nullptr;
        };
        local on_server: Lambda<void>(*FixMessage) = |m: *FixMessage| {
            desk.gateway.handle(&desk.server, m, check);
            desk.settleGateway();
        };
        local on_client: Lambda<void>(*FixMessage) = |_m: *FixMessage| {
            return;
        };
        local rounds: int = 0;
        loop (((this.client.outbox.count > 0) || (this.server.outbox.count > 0)) && (rounds < 16)) {
            local batch: StrList = StrList.new(8);
            this.client.drain(&batch);
            loop (local i: int = 0; i < batch.count; i = i + 1) {
                this.fix_log.push(batch.get(i));
                this.server.receive(batch.get(i), this.now_ms, on_server);
            }
            batch.clear();
            this.server.drain(&batch);
            loop (local i: int = 0; i < batch.count; i = i + 1) {
                this.fix_log.push(batch.get(i));
                this.client.receive(batch.get(i), this.now_ms, on_client);
            }
            batch.destroy();
            rounds = rounds + 1;
        }
    }

    # Sends one application message from the in-process client and returns
    # the index in fix_log of the first message it produced.
    frame sendFix(this: *Desk) ret int {
        local first: int = this.fix_log.count;
        this.client.send(false);
        this.pump();
        return first;
    }

    frame clearFixLog(this: *Desk) {
        this.fix_log.clear();
    }

    frame accountId(this: *Desk, name: string) ret int {
        return this.venue.accountId(name);
    }

    frame setLimits(this: *Desk, account: int, limits: AccountLimits) {
        this.risk.setLimits(account, limits);
    }

    frame accountName(this: *Desk, id: int) ret string {
        local n: string = this.venue.engine.accounts.name(id);
        return n == nullptr ? "?" : n;
    }

    frame symbolOf(this: *Desk, name: string) ret int {
        if (Text.isEmpty(name)) {
            return -1;
        }
        return this.venue.engine.symbolId(name);
    }
}
