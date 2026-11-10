# HTTP server assembly: routes, middleware, metrics and worker startup.

import [App], [Router], [Request], [Response], [HttpMethod] from "bpl-express";
import securityHeaders from "bpl-web-middleware";
import printf from "std/c.bpl";
import [Env] from "std/env.bpl";
import [Clock] from "../core/clock.bpl";
import [Text] from "../core/text.bpl";
import [AppState], [AppConfig], appState, setAppState from "./state.bpl";
import [Reply] from "./respond.bpl";
import healthHandler, infoHandler, metricsHandler, metricsJsonHandler, routesHandler, registerRoute, routeCount from "./handlers_system.bpl";
import barsHandler, barsCsvHandler, syntheticBarsHandler, appendBarHandler, indicatorHandler, indicatorSummaryHandler, volatilityHandler, returnsHandler, seriesListHandler from "./handlers_series.bpl";
import priceHandler, greeksHandler, impliedVolHandler, treeHandler, monteCarloHandler, asianHandler, barrierHandler, americanHandler, chainHandler, hestonHandler, jumpHandler, exoticHandler from "./handlers_pricing.bpl";
import varHandler, optimizeHandler, covarianceHandler, frontierHandler, backtestVarHandler, describeHandler, regressionHandler, matrixHandler, correlationHandler from "./handlers_risk.bpl";
import runScriptHandler, checkScriptHandler, backtestHandler, optimizeStrategyHandler, builtinsHandler from "./handlers_strategy.bpl";
import curveHandler, bondHandler, swapHandler, capHandler, swaptionHandler, shortRateHandler from "./handlers_rates.bpl";
import fourierHandler, carrMadanHandler, sabrHandler, sviHandler, surfaceHandler from "./handlers_vol.bpl";
import symbolsHandler, createSymbolHandler, submitOrderHandler, getOrderHandler, cancelOrderHandler, replaceOrderHandler, bookHandler, quoteHandler, tradesHandler, tradesCsvHandler, simulateHandler, engineStatsHandler, endOfDayHandler, validateBookHandler from "./handlers_market.bpl";

export runServer;
export defaultConfig;

global server_config: AppConfig;
global api_router: Router;
global worker_counter: int;

frame defaultConfig() ret AppConfig {
    return AppConfig { port: 8080, workers: 1, rate_limit: 0, rate_window: 60, db_path: "", persist: false, seed_symbols: true, max_body: 65536, access_log: false };
}

frame route(method: HttpMethod, path: string, handler: Func<void>(*Request, *Response), doc: string) {
    local full: string = path;
    if (method == HttpMethod.GET) {
        api_router.get(path, handler);
        registerRoute("GET", full, doc);
    } else if (method == HttpMethod.POST) {
        api_router.post(path, handler);
        registerRoute("POST", full, doc);
    } else if (method == HttpMethod.DELETE) {
        api_router.delete(path, handler);
        registerRoute("DELETE", full, doc);
    } else if (method == HttpMethod.PATCH) {
        api_router.patch(path, handler);
        registerRoute("PATCH", full, doc);
    } else if (method == HttpMethod.PUT) {
        api_router.put(path, handler);
        registerRoute("PUT", full, doc);
    }
}

frame notFound(_req: *Request, res: *Response) {
    Reply.error(res, 404, "no such route");
}

frame startTimer(_req: *Request, _res: *Response) {
    appState().request_start_ns = Clock.nowNs();
}

# Collapses ids and symbols in a path so metrics group by route shape.
frame routeKey(path: string, out: *char, cap: int) {
    local n: int = Text.length(path);
    local o: int = 0;
    local i: int = 0;
    loop ((i < n) && (o < (cap - 8))) {
        if (path[i] == '/') {
            out[o] = '/';
            o = o + 1;
            i = i + 1;
            local start: int = i;
            local digits: bool = true;
            local upper: bool = true;
            loop ((i < n) && (path[i] != '/') && (path[i] != '?')) {
                local c: char = path[i];
                if (!Text.isDigit(c)) {
                    digits = false;
                }
                if (!(((c >= 'A') && (c <= 'Z')) || Text.isDigit(c) || (c == '.') || (c == '-'))) {
                    upper = false;
                }
                i = i + 1;
            }
            local len: int = i - start;
            if ((len > 0) && (digits || upper)) {
                local tag: string = digits ? ":id" : ":symbol";
                local k: int = 0;
                loop ((tag[k] != cast<char>(0)) && (o < (cap - 1))) {
                    out[o] = tag[k];
                    o = o + 1;
                    k = k + 1;
                }
            } else {
                loop (local k: int = start; (k < i) && (o < (cap - 1)); k = k + 1) {
                    out[o] = path[k];
                    o = o + 1;
                }
            }
            continue;
        }
        i = i + 1;
    }
    out[o] = cast<char>(0);
}

frame methodName(m: HttpMethod) ret string {
    if (m == HttpMethod.GET) {
        return "GET";
    }
    if (m == HttpMethod.POST) {
        return "POST";
    }
    if (m == HttpMethod.DELETE) {
        return "DELETE";
    }
    if (m == HttpMethod.PATCH) {
        return "PATCH";
    }
    if (m == HttpMethod.PUT) {
        return "PUT";
    }
    return "OTHER";
}

frame observe(req: *Request, res: *Response) {
    local s: *AppState = appState();
    local micros: long = (Clock.nowNs() - s.request_start_ns) / 1000;
    local key: char[160];
    local method: string = methodName(req.method);
    local m: int = 0;
    loop (method[m] != cast<char>(0)) {
        key[m] = method[m];
        m = m + 1;
    }
    key[m] = ' ';
    routeKey(req.path, &key[m + 1], 160 - m - 1);
    s.metrics.observe(cast<string>(&key[0]), res.status_code, micros, 0);
    if (s.config.access_log) {
        printf("{\"method\":\"%s\",\"path\":\"%s\",\"status\":%d,\"us\":%lld}\n", method, req.path, res.status_code, micros);
    }
}

frame registerRoutes() {
    api_router = Router.new();
    route(HttpMethod.GET, "/health", healthHandler, "liveness probe");
    route(HttpMethod.GET, "/info", infoHandler, "service summary");
    route(HttpMethod.GET, "/metrics", metricsJsonHandler, "per-route latency and status counters (JSON)");
    route(HttpMethod.GET, "/routes", routesHandler, "this catalogue");
    route(HttpMethod.GET, "/symbols", symbolsHandler, "listed symbols with last/bid/ask");
    route(HttpMethod.POST, "/symbols", createSymbolHandler, "list a new symbol {symbol, reference, band_bps}");
    route(HttpMethod.POST, "/orders", submitOrderHandler, "submit an order {symbol, account, side, type, tif, price, stop_price, qty}");
    route(HttpMethod.GET, "/orders/:id", getOrderHandler, "open order state");
    route(HttpMethod.DELETE, "/orders/:id", cancelOrderHandler, "cancel an open order");
    route(HttpMethod.PATCH, "/orders/:id", replaceOrderHandler, "cancel/replace {price, qty}");
    route(HttpMethod.GET, "/book/:symbol", bookHandler, "order book depth (?depth=)");
    route(HttpMethod.GET, "/quote/:symbol", quoteHandler, "top of book, session stats, impact prices");
    route(HttpMethod.GET, "/trades", tradesHandler, "trade tape (?symbol=&filter=&sort=&offset=&limit=)");
    route(HttpMethod.GET, "/trades.csv", tradesCsvHandler, "trade tape as CSV (same query)");
    route(HttpMethod.POST, "/sim/:symbol", simulateHandler, "run synthetic order flow (?events=&seed=)");
    route(HttpMethod.GET, "/engine/stats", engineStatsHandler, "matching engine counters");
    route(HttpMethod.POST, "/engine/eod", endOfDayHandler, "expire Day orders");
    route(HttpMethod.GET, "/engine/validate", validateBookHandler, "book invariant check");
    route(HttpMethod.GET, "/series", seriesListHandler, "bar series per symbol");
    route(HttpMethod.GET, "/bars/:symbol", barsHandler, "OHLCV bars (?from=&to=&interval=&filter=&offset=&limit=)");
    route(HttpMethod.GET, "/bars/:symbol/csv", barsCsvHandler, "bars as CSV (same query)");
    route(HttpMethod.POST, "/bars/:symbol/synthetic", syntheticBarsHandler, "generate GBM bars (?count=&start=&drift=&vol=&seed=)");
    route(HttpMethod.POST, "/bars/:symbol", appendBarHandler, "append one bar {time, open, high, low, close, volume}");
    route(HttpMethod.GET, "/indicators/:symbol", indicatorHandler, "one indicator (?name=&period=&tail=&k=)");
    route(HttpMethod.GET, "/indicators/:symbol/summary", indicatorSummaryHandler, "latest value of the common indicators");
    route(HttpMethod.GET, "/volatility/:symbol", volatilityHandler, "realized volatility estimators (?window=)");
    route(HttpMethod.GET, "/returns/:symbol", returnsHandler, "return statistics, Sharpe, drawdown, Hurst");
    route(HttpMethod.GET, "/price/bs", priceHandler, "Black-Scholes price (?type=&spot=&strike=&rate=&dividend=&vol=&expiry=)");
    route(HttpMethod.POST, "/price/bs", priceHandler, "Black-Scholes price (JSON body)");
    route(HttpMethod.GET, "/price/greeks", greeksHandler, "analytic Greeks up to third order");
    route(HttpMethod.POST, "/price/greeks", greeksHandler, "analytic Greeks (JSON body)");
    route(HttpMethod.GET, "/price/iv", impliedVolHandler, "implied volatility from a price (?price=)");
    route(HttpMethod.POST, "/price/iv", impliedVolHandler, "same as GET with a JSON body");
    route(HttpMethod.GET, "/price/tree", treeHandler, "lattice pricing (?model=crr|leisen_reimer|trinomial|crank_nicolson&steps=&american=)");
    route(HttpMethod.POST, "/price/tree", treeHandler, "same as GET with a JSON body");
    route(HttpMethod.GET, "/price/mc", monteCarloHandler, "Monte Carlo European (?paths=&seed=&control_variate=)");
    route(HttpMethod.POST, "/price/mc", monteCarloHandler, "same as GET with a JSON body");
    route(HttpMethod.GET, "/price/asian", asianHandler, "arithmetic Asian with geometric control (?fixings=&paths=)");
    route(HttpMethod.POST, "/price/asian", asianHandler, "same as GET with a JSON body");
    route(HttpMethod.GET, "/price/barrier", barrierHandler, "barrier option (?barrier_type=&barrier=&rebate=&steps=&paths=)");
    route(HttpMethod.POST, "/price/barrier", barrierHandler, "same as GET with a JSON body");
    route(HttpMethod.GET, "/price/american", americanHandler, "American option: CRR, BAW, Crank-Nicolson, Longstaff-Schwartz");
    route(HttpMethod.POST, "/price/american", americanHandler, "same as GET with a JSON body");
    route(HttpMethod.GET, "/price/chain", chainHandler, "option chain with a parametric smile (?spot=&expiry=&strikes=&skew=&smile=)");
    route(HttpMethod.POST, "/price/chain", chainHandler, "same as GET with a JSON body");
    route(HttpMethod.GET, "/price/heston", hestonHandler, "Heston Monte Carlo (?v0=&kappa=&theta=&xi=&rho=)");
    route(HttpMethod.POST, "/price/heston", hestonHandler, "same as GET with a JSON body");
    route(HttpMethod.GET, "/price/jump", jumpHandler, "Merton jump diffusion, Monte Carlo and series");
    route(HttpMethod.POST, "/price/jump", jumpHandler, "same as GET with a JSON body");
    route(HttpMethod.GET, "/price/exotic", exoticHandler, "lookback, Margrabe, Kirk spread, digitals (?kind=)");
    route(HttpMethod.POST, "/price/exotic", exoticHandler, "exotics (JSON body)");
    route(HttpMethod.GET, "/risk/var", varHandler, "portfolio VaR/ES by five methods (?symbols=A,B&confidence=&value=)");
    route(HttpMethod.POST, "/risk/var", varHandler, "portfolio VaR with weights {symbols, weights}");
    route(HttpMethod.GET, "/risk/optimize", optimizeHandler, "portfolio construction (?symbols=&method=&shrink=)");
    route(HttpMethod.POST, "/risk/optimize", optimizeHandler, "portfolio construction (JSON body)");
    route(HttpMethod.GET, "/risk/covariance", covarianceHandler, "covariance/correlation/eigenvalues (?method=sample|ewma|ledoit_wolf)");
    route(HttpMethod.GET, "/risk/frontier", frontierHandler, "efficient frontier (?symbols=&points=)");
    route(HttpMethod.GET, "/risk/backtest", backtestVarHandler, "rolling VaR backtest with Kupiec/Christoffersen tests");
    route(HttpMethod.GET, "/risk/correlation", correlationHandler, "pairwise Pearson/Spearman/beta");
    route(HttpMethod.POST, "/stats/describe", describeHandler, "descriptive statistics of {values}");
    route(HttpMethod.POST, "/stats/regression", regressionHandler, "OLS of {x, y}");
    route(HttpMethod.POST, "/math/matrix", matrixHandler, "matrix ops {op, a, b}");
    route(HttpMethod.POST, "/strategy/run", runScriptHandler, "run a QScript program {source, symbol, commission_bps, ...}; backtests position() calls");
    route(HttpMethod.POST, "/strategy/check", checkScriptHandler, "compile a QScript program and list its bytecode");
    route(HttpMethod.GET, "/strategy/builtins", builtinsHandler, "QScript builtin functions and host globals");
    route(HttpMethod.GET, "/backtest/:symbol", backtestHandler, "built-in strategy backtest (?strategy=&fast=&slow=&period=&...)");
    route(HttpMethod.GET, "/backtest/:symbol/optimize", optimizeStrategyHandler, "SMA window grid search");
    route(HttpMethod.GET, "/rates/curve", curveHandler, "bootstrapped default curve, grid, par swaps, NSS fit (?interp=&points=)");
    route(HttpMethod.POST, "/rates/curve", curveHandler, "bootstrap {instruments:[{type, maturity, rate}]}");
    route(HttpMethod.GET, "/rates/bond", bondHandler, "bond price/yield, duration, convexity, DV01 (?coupon=&maturity=&yield=|price=)");
    route(HttpMethod.GET, "/rates/swap", swapHandler, "swap NPV, par rate, PV01, key-rate deltas (?maturity=&fixed_rate=)");
    route(HttpMethod.POST, "/rates/swap", swapHandler, "swap on a custom curve");
    route(HttpMethod.GET, "/rates/cap", capHandler, "cap/floor under Black-76 (?maturity=&strike=&vol=)");
    route(HttpMethod.GET, "/rates/swaption", swaptionHandler, "payer/receiver swaption (?expiry=&tenor=&vol=&strike=)");
    route(HttpMethod.GET, "/rates/short", shortRateHandler, "Vasicek/CIR curves, Hull-White tree vs Jamshidian (?model=)");
    route(HttpMethod.GET, "/vol/fourier", fourierHandler, "characteristic-function price (?model=heston|variance_gamma|black_scholes)");
    route(HttpMethod.GET, "/vol/carr_madan", carrMadanHandler, "Carr-Madan FFT call grid (?model=&log2n=&eta=)");
    route(HttpMethod.POST, "/vol/sabr", sabrHandler, "calibrate SABR {forward, expiry, beta, strikes, vols}");
    route(HttpMethod.POST, "/vol/svi", sviHandler, "calibrate raw SVI {forward, expiry, strikes, vols}");
    route(HttpMethod.GET, "/vol/surface", surfaceHandler, "SVI surface: implied/local vol and prices (?strike=&expiry=)");
    api_router.useNotFound(notFound);
}

frame initializeWorker() {
    worker_counter = worker_counter + 1;
    local s: *AppState = AppState.create(server_config);
    s.worker_id = worker_counter;
    setAppState(s);
}

frame runServer(config: AppConfig) ret int {
    server_config = config;
    registerRoutes();
    local app: App = App.new();
    app.beforeRequest(startTimer);
    app.beforeRequest(securityHeaders);
    app.afterRequest(observe);
    app.useRouter("/api", &api_router);
    app.router.get("/metrics", metricsHandler);
    app.router.get("/health", healthHandler);
    app.router.useNotFound(notFound);
    printf("bpl-quant listening on 127.0.0.1:%d with %d worker(s), %d routes\n", config.port, config.workers, routeCount());
    if (config.workers > 1) {
        app.listenWorkers(config.port, "127.0.0.1", config.workers, initializeWorker);
    } else {
        initializeWorker();
        app.listenOn(config.port, "127.0.0.1");
    }
    return 0;
}
