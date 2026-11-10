# SQLite persistence for trades and bar series.
#
# Each worker opens its own connection after fork (bpl-sqlite connections
# must not cross fork). WAL mode lets workers read while one writes.
# Migrations are versioned through bpl-sqlite's Migrations table.

import [SQLite], [Statement], [Migrations] from "bpl-sqlite";
import malloc, free from "std/c.bpl";
import [Text] from "../core/text.bpl";
import [Engine] from "../market/engine.bpl";
import [Trade], [Ticks] from "../market/order.bpl";
import [BarSeries], [Bar] from "../series/bars.bpl";

export [Store];
export [StoreStats];

struct StoreStats {
    trades: long,
    bars: long,
    symbols: long,
    max_trade_id: long,
}

frame migrateV1(db: *SQLite) {
    db.exec("CREATE TABLE trades(id INTEGER NOT NULL, worker INTEGER NOT NULL, symbol TEXT NOT NULL, price REAL NOT NULL, qty INTEGER NOT NULL, side TEXT NOT NULL, buyer TEXT, seller TEXT, ts INTEGER NOT NULL, PRIMARY KEY(worker, id))");
    db.exec("CREATE INDEX trades_symbol ON trades(symbol, id)");
    db.exec("CREATE TABLE bars(symbol TEXT NOT NULL, time INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL, trades INTEGER NOT NULL, vwap REAL NOT NULL, PRIMARY KEY(symbol, time))");
}

frame migrateV2(db: *SQLite) {
    db.exec("CREATE TABLE snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT, created INTEGER NOT NULL, label TEXT NOT NULL, payload TEXT NOT NULL)");
}

struct Store {
    db: SQLite,
    open: bool,
    worker: int,
    last_trade_id: long,
    path: string,

    frame init(this: *Store) {
        this.open = false;
        this.worker = 0;
        this.last_trade_id = 0;
        this.path = nullptr;
    }

    frame connect(this: *Store, path: string, worker: int) ret bool {
        this.init();
        this.db = SQLite.open(path);
        this.db.setBusyTimeout(5000);
        # In-memory databases have no WAL mode.
        if (!Text.equals(path, ":memory:")) {
            this.db.setWAL(true);
        }
        Migrations.apply(&this.db, 1, "trades and bars", "bpl-quant-v1", migrateV1);
        Migrations.apply(&this.db, 2, "snapshots", "bpl-quant-v2", migrateV2);
        this.open = true;
        this.worker = worker;
        this.path = Text.copy(path);
        # Resume after the newest trade this worker already stored.
        local q: Statement = this.db.prepare("SELECT COALESCE(MAX(id), 0) FROM trades WHERE worker=?");
        q.bindInt(1, cast<long>(worker));
        if (q.step()) {
            this.last_trade_id = q.integer(0);
        }
        q.close();
        return true;
    }

    frame close(this: *Store) {
        if (this.open) {
            this.db.close();
            Text.release(this.path);
            this.open = false;
        }
    }

    # Writes tape trades newer than the last persisted id in one transaction.
    frame persistTrades(this: *Store, engine: *Engine) ret int {
        if (!this.open) {
            return 0;
        }
        local written: int = 0;
        this.db.begin();
        local q: Statement = this.db.prepare("INSERT OR IGNORE INTO trades(id, worker, symbol, price, qty, side, buyer, seller, ts) VALUES (?,?,?,?,?,?,?,?,?)");
        loop (local i: int = 0; i < engine.tape.count; i = i + 1) {
            local t: *Trade = engine.tape.at(i);
            if (t.id <= this.last_trade_id) {
                continue;
            }
            q.bindInt(1, t.id).bindInt(2, cast<long>(this.worker)).bindText(3, engine.symbolName(t.symbol)).bindReal(4, Ticks.toFloat(t.price)).bindInt(5, t.quantity).bindText(6, Ticks.sideName(t.aggressor)).bindText(7, engine.accounts.name(t.buy_account)).bindText(8, engine.accounts.name(t.sell_account)).bindInt(9, t.timestamp);
            q.step();
            q.reset();
            this.last_trade_id = t.id;
            written = written + 1;
        }
        q.close();
        this.db.commit();
        return written;
    }

    frame saveBars(this: *Store, symbol: string, bars: *BarSeries) ret int {
        if (!this.open) {
            return 0;
        }
        this.db.begin();
        local del: Statement = this.db.prepare("DELETE FROM bars WHERE symbol=?");
        del.bindText(1, symbol);
        del.step();
        del.close();
        local q: Statement = this.db.prepare("INSERT INTO bars(symbol, time, open, high, low, close, volume, trades, vwap) VALUES (?,?,?,?,?,?,?,?,?)");
        loop (local i: int = 0; i < bars.len; i = i + 1) {
            q.bindText(1, symbol).bindInt(2, bars.time[i]).bindReal(3, bars.open[i]).bindReal(4, bars.high[i]).bindReal(5, bars.low[i]).bindReal(6, bars.close[i]).bindReal(7, bars.volume[i]).bindInt(8, bars.trades[i]).bindReal(9, bars.vwap[i]);
            q.step();
            q.reset();
        }
        q.close();
        this.db.commit();
        return bars.len;
    }

    # Loads a symbol's bars; returns false when none are stored.
    frame loadBars(this: *Store, symbol: string, interval: long, out: *BarSeries) ret bool {
        if (!this.open) {
            return false;
        }
        *out = BarSeries.new(256, interval);
        local q: Statement = this.db.prepare("SELECT time, open, high, low, close, volume, trades, vwap FROM bars WHERE symbol=? ORDER BY time");
        q.bindText(1, symbol);
        loop (q.step()) {
            out.push(Bar { time: q.integer(0), open: q.real(1), high: q.real(2), low: q.real(3), close: q.real(4), volume: q.real(5), trades: q.integer(6), vwap: q.real(7) });
        }
        q.close();
        return out.len > 0;
    }

    frame stats(this: *Store) ret StoreStats {
        local s: StoreStats = StoreStats { trades: 0, bars: 0, symbols: 0, max_trade_id: 0 };
        if (!this.open) {
            return s;
        }
        local q: Statement = this.db.prepare("SELECT (SELECT COUNT(*) FROM trades), (SELECT COUNT(*) FROM bars), (SELECT COUNT(DISTINCT symbol) FROM bars), (SELECT COALESCE(MAX(id), 0) FROM trades)");
        if (q.step()) {
            s.trades = q.integer(0);
            s.bars = q.integer(1);
            s.symbols = q.integer(2);
            s.max_trade_id = q.integer(3);
        }
        q.close();
        return s;
    }

    frame snapshot(this: *Store, label: string, payload: string, now: long) ret long {
        local q: Statement = this.db.prepare("INSERT INTO snapshots(created, label, payload) VALUES (?,?,?)");
        q.bindInt(1, now).bindText(2, label).bindText(3, payload);
        q.step();
        q.close();
        return this.db.lastInsertId();
    }

    frame integrity(this: *Store) ret bool {
        return this.open && this.db.integrityCheck();
    }
}
