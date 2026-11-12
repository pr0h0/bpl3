# Strategy endpoints: QScript execution and built-in backtests.

import [Request], [Response] from "bpl-express";
import free from "std/c.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [Text] from "../core/text.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [SeriesEntry] from "../series/store.bpl";
import [BarSeries] from "../series/bars.bpl";
import [ScriptRun] from "../dsl/runner.bpl";
import [VmLimits] from "../dsl/vm.bpl";
import [Op] from "../dsl/compiler.bpl";
import [Builtins] from "../dsl/builtins_table.bpl";
import [Backtest], [BacktestConfig], [BacktestReport], [Strategies] from "../backtest/backtester.bpl";

export runScriptHandler;
export checkScriptHandler;
export backtestHandler;
export optimizeStrategyHandler;
export builtinsHandler;

frame readConfig(p: *Params) ret BacktestConfig {
    local cfg: BacktestConfig = Backtest.defaults();
    cfg.initial_cash = p.num("initial_cash", cfg.initial_cash, 1.0, 1000000000000.0);
    cfg.commission_bps = p.num("commission_bps", cfg.commission_bps, 0.0, 1000.0);
    cfg.spread_bps = p.num("spread_bps", cfg.spread_bps, 0.0, 1000.0);
    cfg.max_leverage = p.num("max_leverage", cfg.max_leverage, 0.0, 100.0);
    cfg.periods_per_year = p.num("periods_per_year", cfg.periods_per_year, 1.0, 1000000.0);
    cfg.rebalance_band = p.num("rebalance_band", cfg.rebalance_band, 0.0, 1.0);
    return cfg;
}

frame limitsFrom(p: *Params) ret VmLimits {
    local limits: VmLimits = ScriptRun.defaultLimits();
    limits.max_instructions = p.longInt("max_instructions", limits.max_instructions, 1000, 200000000);
    return limits;
}

frame runScriptHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(262144)) {
        p.reject(res);
        return;
    }
    local source: string = p.requiredStr("source", 200000);
    local symbol: string = p.str("symbol", nullptr);
    local cfg: BacktestConfig = readConfig(&p);
    local limits: VmLimits = limitsFrom(&p);
    local curve: int = p.integer("curve_points", 50, 0, 1000);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local bars: *BarSeries = nullptr;
    if (symbol != nullptr) {
        local e: *SeriesEntry = s.series.find(symbol);
        if (e == nullptr) {
            Reply.notFound(res, "no series for symbol");
            return;
        }
        bars = &e.bars;
    }
    local run: ScriptRun;
    ScriptRun.execute(&run, source, bars, limits);
    local w: JsonWriter = JsonWriter.new(4096);
    w.precision = 10;
    w.beginObject();
    run.writeJson(&w);
    if (run.ok && (bars != nullptr) && (run.positionsSet() > 0)) {
        local report: BacktestReport = Backtest.run(bars, run.vm.positions, &cfg);
        w.key("backtest").beginObject();
        report.writeJson(&w, curve);
        w.endObject();
        report.destroy();
    }
    w.endObject();
    local status: int = run.ok ? 200 : (Text.equals(run.stage, "run") ? 422 : 400);
    run.destroy();
    Reply.json(res, status, &w);
    w.destroy();
}

frame checkScriptHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(262144)) {
        p.reject(res);
        return;
    }
    local source: string = p.requiredStr("source", 200000);
    if (p.reject(res)) {
        return;
    }
    # Run with a zero budget beyond compilation: execute() stops at the first instruction.
    local limits: VmLimits = ScriptRun.defaultLimits();
    limits.max_instructions = 0;
    local run: ScriptRun;
    ScriptRun.execute(&run, source, nullptr, limits);
    local compiled: bool = Text.equals(run.stage, "run") || Text.equals(run.stage, "done");
    local w: JsonWriter = JsonWriter.new(2048);
    w.beginObject();
    w.fieldBool("ok", compiled);
    if (!compiled) {
        w.key("error").beginObject();
        w.fieldStr("stage", run.stage);
        w.fieldStr("message", run.error);
        w.fieldInt("line", cast<long>(run.line));
        w.fieldInt("column", cast<long>(run.col));
        w.endObject();
    } else {
        w.fieldInt("functions", cast<long>(run.functions));
        w.fieldInt("bytecode_words", cast<long>(run.code_words));
        w.fieldInt("globals", cast<long>(run.compiler.global_count));
        w.fieldInt("constants", cast<long>(run.compiler.const_count));
        w.key("functions_detail").beginArray();
        loop (local i: int = 0; i < run.compiler.proto_count; i = i + 1) {
            w.beginObject();
            w.fieldStr("name", run.compiler.protos[i].name);
            w.fieldInt("arity", cast<long>(run.compiler.protos[i].arity));
            w.fieldInt("locals", cast<long>(run.compiler.protos[i].locals));
            w.fieldInt("words", cast<long>(run.compiler.protos[i].len));
            w.endObject();
        }
        w.endArray();
        local listing: string[200];
        local n: int = run.compiler.disassemble(0, &listing[0], 200);
        w.key("script_ops").beginArray();
        loop (local i: int = 0; i < n; i = i + 1) {
            w.str(listing[i]);
        }
        w.endArray();
    }
    w.endObject();
    run.destroy();
    Reply.json(res, compiled ? 200 : 400, &w);
    w.destroy();
}

global strategy_names: string[6] = ["sma_cross", "rsi_reversion", "bollinger_breakout", "macd_trend", "momentum", "buy_and_hold"];

frame backtestHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local name: string = p.oneOf("strategy", "sma_cross", &strategy_names[0], 6);
    local fast: int = p.integer("fast", 20, 1, 1000);
    local slow: int = p.integer("slow", 50, 2, 2000);
    local period: int = p.integer("period", 14, 2, 1000);
    local lower: float = p.num("lower", 30.0, 0.0, 100.0);
    local upper: float = p.num("upper", 70.0, 0.0, 100.0);
    local k: float = p.num("k", 2.0, 0.1, 10.0);
    local lookback: int = p.integer("lookback", 60, 1, 2000);
    local target_vol: float = p.num("target_vol", 0.15, 0.01, 5.0);
    local allow_short: bool = p.flag("short", true);
    local curve: int = p.integer("curve_points", 50, 0, 1000);
    local cfg: BacktestConfig = readConfig(&p);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local e: *SeriesEntry = s.series.find(symbol);
    if (e == nullptr) {
        Reply.notFound(res, "no series for symbol");
        return;
    }
    local bars: *BarSeries = &e.bars;
    local targets: *float = nullptr;
    if (Text.equals(name, "sma_cross")) {
        if (fast >= slow) {
            Reply.error(res, 422, "fast must be shorter than slow");
            return;
        }
        targets = Strategies.smaCross(bars, fast, slow, allow_short);
    } else if (Text.equals(name, "rsi_reversion")) {
        targets = Strategies.rsiReversion(bars, period, lower, upper);
    } else if (Text.equals(name, "bollinger_breakout")) {
        targets = Strategies.bollingerBreakout(bars, period, k);
    } else if (Text.equals(name, "macd_trend")) {
        targets = Strategies.macdTrend(bars, target_vol);
    } else if (Text.equals(name, "momentum")) {
        targets = Strategies.momentum(bars, lookback);
    } else {
        targets = Strategies.buyAndHold(bars);
    }
    local report: BacktestReport = Backtest.run(bars, targets, &cfg);
    local hold_targets: *float = Strategies.buyAndHold(bars);
    local hold: BacktestReport = Backtest.run(bars, hold_targets, &cfg);
    local w: JsonWriter = JsonWriter.new(4096);
    w.precision = 10;
    w.beginObject();
    w.fieldStr("symbol", symbol);
    w.fieldStr("strategy", name);
    report.writeJson(&w, curve);
    w.key("benchmark").beginObject();
    w.fieldNum("total_return", hold.total_return);
    w.fieldNum("sharpe", hold.sharpe);
    w.fieldNum("max_drawdown", hold.max_drawdown);
    w.endObject();
    w.endObject();
    report.destroy();
    hold.destroy();
    free(cast<*void>(targets));
    free(cast<*void>(hold_targets));
    Reply.ok(res, &w);
    w.destroy();
}

frame optimizeStrategyHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local cfg: BacktestConfig = readConfig(&p);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local e: *SeriesEntry = s.series.find(symbol);
    if (e == nullptr) {
        Reply.notFound(res, "no series for symbol");
        return;
    }
    local fast: int = 0;
    local slow: int = 0;
    local sharpe: float = Strategies.optimizeSma(&e.bars, &cfg, &fast, &slow);
    local w: JsonWriter = JsonWriter.new(256);
    w.beginObject();
    w.fieldStr("symbol", symbol);
    w.fieldStr("strategy", "sma_cross");
    w.fieldInt("best_fast", cast<long>(fast));
    w.fieldInt("best_slow", cast<long>(slow));
    w.fieldNum("best_sharpe", sharpe);
    w.fieldStr("warning", "in-sample grid search; expect lower out-of-sample performance");
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame builtinsHandler(_req: *Request, res: *Response) {
    local w: JsonWriter = JsonWriter.new(1024);
    w.beginObject();
    w.key("builtins").beginArray();
    loop (local i: int = 0; i < Builtins.count(); i = i + 1) {
        w.str(Builtins.name(i));
    }
    w.endArray();
    w.key("host_globals").beginArray();
    w.str("open").str("high").str("low").str("close").str("volume").str("time").str("bars");
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
