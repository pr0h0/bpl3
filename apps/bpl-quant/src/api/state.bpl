# Process-wide application state.
#
# Each worker process owns one AppState created after fork. With several
# workers the in-memory books are per worker; persisted data (trades, bars,
# rate-limit counters) lives in SQLite so every worker sees it.

import malloc from "std/c.bpl";
import [Engine] from "../market/engine.bpl";
import [SeriesStore] from "../series/store.bpl";
import [BarSeries] from "../series/bars.bpl";
import [Metrics] from "./metrics.bpl";
import [Clock] from "../core/clock.bpl";
import [Ticks] from "../market/order.bpl";
import [Store] from "../store/db.bpl";
import [SQLite] from "bpl-sqlite";
import [RateLimiter] from "bpl-rate-limit";
import [Text] from "../core/text.bpl";

export [AppState];
export [AppConfig];
export appState;
export setAppState;

struct AppConfig {
    port: int,
    workers: int,
    rate_limit: int,
    rate_window: int,
    db_path: string,
    persist: bool,
    seed_symbols: bool,
    max_body: long,
    access_log: bool,
}

struct AppState {
    engine: Engine,
    series: SeriesStore,
    metrics: Metrics,
    config: AppConfig,
    started_ms: long,
    request_start_ns: long,
    worker_id: int,
    persisted_trades: long,
    store: Store,
    rate_db: SQLite,
    limiter: RateLimiter,
    rate_limited: bool,

    frame create(config: AppConfig) ret *AppState {
        local s: *AppState = cast<*AppState>(malloc(sizeof(AppState)));
        # init() stores the vtable word that malloc leaves unset (BUG-800).
        s.init();
        s.engine = Engine.new(65536);
        s.series = SeriesStore.new(60);
        s.started_ms = Clock.wallMs();
        s.metrics = Metrics.new(s.started_ms);
        s.config = config;
        s.request_start_ns = 0;
        s.worker_id = 0;
        s.persisted_trades = 0;
        s.rate_limited = false;
        if (config.seed_symbols) {
            s.seed();
        }
        return s;
    }

    frame init(this: *AppState) {
        this.worker_id = 0;
        this.rate_limited = false;
        this.store.init();
    }

    # Opens worker-local SQLite connections (call after fork).
    frame openStorage(this: *AppState) {
        if (!this.config.persist) {
            return;
        }
        this.store.connect(this.config.db_path, this.worker_id);
        if (this.config.rate_limit > 0) {
            this.rate_db = SQLite.open(this.config.db_path);
            this.rate_db.setBusyTimeout(5000);
            this.limiter = RateLimiter.new(&this.rate_db);
            this.rate_limited = true;
        }
    }

    # Default listing: a few symbols with a year of synthetic daily bars.
    frame seed(this: *AppState) {
        local names: string[6] = ["ACME", "GLOBEX", "INITECH", "UMBRELLA", "HOOLI", "STARK"];
        local prices: float[6] = [100.0, 42.5, 15.25, 230.0, 75.0, 310.0];
        local vols: float[6] = [0.25, 0.35, 0.45, 0.2, 0.3, 0.22];
        loop (local i: int = 0; i < 6; i = i + 1) {
            this.engine.addSymbol(names[i], Ticks.fromFloat(prices[i]));
            local bars: BarSeries = BarSeries.synthetic(cast<u64>(1000 + i), 260, prices[i], 0.06, vols[i], 86400);
            this.series.load(names[i], bars);
        }
    }

    frame uptimeMs(this: *AppState) ret long {
        return Clock.wallMs() - this.started_ms;
    }
}

global current_state: *AppState;

frame appState() ret *AppState {
    if (current_state == nullptr) {
        throw "application state is not initialized";
    }
    return current_state;
}

frame setAppState(s: *AppState) {
    current_state = s;
}
