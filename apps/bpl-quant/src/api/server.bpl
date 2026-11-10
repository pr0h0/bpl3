# HTTP server assembly: routes, middleware, metrics and worker startup.

import [App], [Router], [Request], [Response], [HttpMethod] from "bpl-express";
import securityHeaders from "bpl-web-middleware";
import printf from "std/c.bpl";
import getpid from "bpl-express/src/libc.bpl";
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
import garchHandler, arimaHandler, stationarityHandler, kalmanHandler, pairHandler from "./handlers_tsa.bpl";
import lpHandler, constrainedPortfolioHandler from "./handlers_optim.bpl";
import queryHandler, queryCsvHandler from "./handlers_query.bpl";
import storeStatsHandler, storeFlushHandler, storeSaveBarsHandler, storeLoadBarsHandler, storeTradesHandler from "./handlers_store.bpl";
import accountsHandler, accountHandler, auctionHandler, algoHandler, makerHandler from "./handlers_micro.bpl";
import pcaHandler, factorHandler, clusterHandler, directionHandler, bootstrapHandler, cdsHandler, mertonHandler, portfolioLossHandler, fxHandler from "./handlers_ml.bpl";
import importBarsHandler, bookScenarioHandler, qmcHandler from "./handlers_scenario.bpl";
import omsSubmitHandler, omsCancelHandler, omsReplaceHandler, omsOrdersHandler, omsPositionsHandler, omsBreachesHandler, omsGetLimitsHandler, omsSetLimitsHandler, omsKillHandler, omsReviveHandler, omsRestrictHandler, omsJournalHandler, omsSnapshotHandler, omsRecoverHandler, omsCompactHandler, omsStatsHandler from "./handlers_oms.bpl";
import stressScenariosHandler, stressRunHandler, stressDemoHandler, brinsonHandler, linkHandler, rebalanceHandler, rebalanceSimulateHandler from "./handlers_portfolio.bpl";
import columnarQueryHandler, columnarStatsHandler from "./handlers_columnar.bpl";
import fixParseHandler, fixOrderHandler, fixCancelHandler, fixLogHandler, feedReplayHandler, feedSampleHandler from "./handlers_proto.bpl";
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

# Rate limit API requests per socket peer (health and metrics are exempt).
frame throttle(req: *Request, res: *Response) {
    local s: *AppState = appState();
    if (!s.rate_limited || Text.equals(req.path, "/api/health") || Text.equals(req.path, "/health") || Text.equals(req.path, "/metrics")) {
        return;
    }
    s.limiter.apply(req, res, "api", s.config.rate_limit, s.config.rate_window);
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
    route(HttpMethod.GET, "/tsa/:symbol/garch", garchHandler, "GARCH/GJR/EGARCH fit and volatility forecast (?model=&horizon=)");
    route(HttpMethod.GET, "/tsa/:symbol/arima", arimaHandler, "ARIMA(p,d,q) fit and forecast (?p=&d=&q=&auto=)");
    route(HttpMethod.GET, "/tsa/:symbol/stationarity", stationarityHandler, "ADF/KPSS tests, ACF/PACF of returns");
    route(HttpMethod.GET, "/tsa/:symbol/kalman", kalmanHandler, "local-level Kalman filter and smoother (?q=&auto=)");
    route(HttpMethod.GET, "/tsa/pair", pairHandler, "cointegration and Kalman hedge ratio (?a=&b=)");
    route(HttpMethod.POST, "/math/lp", lpHandler, "linear program {objective, constraints:[{a, op, b}], sense}");
    route(HttpMethod.GET, "/risk/constrained", constrainedPortfolioHandler, "mean-variance with weight bounds (?symbols=&max_weight=&min_weight=&risk_aversion=)");
    route(HttpMethod.GET, "/query", queryHandler, "QQL query over trades, bars('SYM'), orders, symbols (?q=SELECT ...)");
    route(HttpMethod.POST, "/query", queryHandler, "QQL query {q}");
    route(HttpMethod.GET, "/query.csv", queryCsvHandler, "QQL query as CSV");
    route(HttpMethod.GET, "/store/stats", storeStatsHandler, "SQLite row counts and integrity (needs BPLQUANT_DB)");
    route(HttpMethod.POST, "/store/flush", storeFlushHandler, "persist new trades from the tape");
    route(HttpMethod.GET, "/store/trades", storeTradesHandler, "persisted trades from every worker (?symbol=&limit=)");
    route(HttpMethod.POST, "/store/bars/:symbol/save", storeSaveBarsHandler, "persist a symbol's bars");
    route(HttpMethod.POST, "/store/bars/:symbol/load", storeLoadBarsHandler, "replace a symbol's bars from the database");
    route(HttpMethod.GET, "/accounts", accountsHandler, "per-account exposure and P&L from the trade tape (FIFO lots)");
    route(HttpMethod.GET, "/accounts/:name", accountHandler, "positions of one account");
    route(HttpMethod.POST, "/auction", auctionHandler, "uncross a call auction {reference, orders:[{side, price, qty}]}");
    route(HttpMethod.GET, "/algo/:symbol", algoHandler, "TWAP/VWAP/POV execution on a scratch book (?kind=&qty=&slices=)");
    route(HttpMethod.GET, "/maker/:symbol", makerHandler, "Avellaneda-Stoikov market maker simulation (?gamma=&sigma=&kappa=)");
    route(HttpMethod.GET, "/ml/pca", pcaHandler, "principal components of returns (?symbols=)");
    route(HttpMethod.GET, "/ml/factors", factorHandler, "time-series factor regression (?target=&factors=A,B)");
    route(HttpMethod.GET, "/ml/clusters", clusterHandler, "k-means on return/volatility (?symbols=&k=)");
    route(HttpMethod.GET, "/ml/:symbol/direction", directionHandler, "logistic model of next-bar direction (?lags=)");
    route(HttpMethod.GET, "/ml/:symbol/bootstrap", bootstrapHandler, "bootstrap CI and KDE of returns (?statistic=&resamples=)");
    route(HttpMethod.POST, "/credit/cds", cdsHandler, "bootstrap hazards from CDS spreads and value a contract");
    route(HttpMethod.GET, "/credit/merton", mertonHandler, "Merton structural model (?equity=&equity_vol=&debt=)");
    route(HttpMethod.GET, "/credit/portfolio", portfolioLossHandler, "Vasicek one-factor portfolio loss quantiles (?pd=&rho=&lgd=)");
    route(HttpMethod.GET, "/fx", fxHandler, "FX forward and Garman-Kohlhagen options (?spot=&rd=&rf=&vol=)");
    route(HttpMethod.POST, "/bars/:symbol/import", importBarsHandler, "replace bars from a CSV body (time, open, high, low, close[, volume])");
    route(HttpMethod.POST, "/risk/book", bookScenarioHandler, "option book Greeks and spot/vol scenario grid {underlyings, positions}");
    route(HttpMethod.GET, "/price/qmc", qmcHandler, "Sobol quasi-Monte Carlo European price (?points=)");
    registerOpsRoutes();
    api_router.useNotFound(notFound);
}

# Order desk, protocol and feed routes.
frame registerOpsRoutes() {
    route(HttpMethod.POST, "/oms/orders", omsSubmitHandler, "risk-checked journaled order {symbol, account, side, type, tif, price, stop_price, qty}; 403 with the breached rule");
    route(HttpMethod.GET, "/oms/orders", omsOrdersHandler, "open desk orders in book priority (?filter=&sort=&order=&offset=&limit=)");
    route(HttpMethod.DELETE, "/oms/orders/:id", omsCancelHandler, "cancel a desk order");
    route(HttpMethod.PATCH, "/oms/orders/:id", omsReplaceHandler, "risk-checked cancel/replace {price, qty}");
    route(HttpMethod.GET, "/oms/positions", omsPositionsHandler, "positions, open exposure, cash and P&L per account and symbol (?filter=&sort=&offset=&limit=)");
    route(HttpMethod.GET, "/oms/breaches", omsBreachesHandler, "recent pre-trade rejections and counts by rule (?filter=&sort=&order=&limit=)");
    route(HttpMethod.GET, "/oms/limits/:account", omsGetLimitsHandler, "limits and live risk usage of an account");
    route(HttpMethod.PUT, "/oms/limits/:account", omsSetLimitsHandler, "update limits {max_order_qty, max_order_notional, max_position, max_gross_notional, max_open_orders, rate_per_sec, burst, collar_bps, max_loss}");
    route(HttpMethod.POST, "/oms/kill/:account", omsKillHandler, "kill switch: disable the account and cancel its open orders");
    route(HttpMethod.POST, "/oms/revive/:account", omsReviveHandler, "re-enable an account after a kill");
    route(HttpMethod.POST, "/oms/restrict/:symbol", omsRestrictHandler, "add or remove a symbol from the restricted list (?restricted=true|false)");
    route(HttpMethod.GET, "/oms/journal", omsJournalHandler, "journal records (?filter=&order=desc&offset=&limit=)");
    route(HttpMethod.POST, "/oms/snapshot", omsSnapshotHandler, "snapshot the desk engine at the current journal sequence");
    route(HttpMethod.POST, "/oms/recover", omsRecoverHandler, "rebuild the desk from snapshot + journal in a scratch engine and compare state hashes (?snapshot=)");
    route(HttpMethod.POST, "/oms/compact", omsCompactHandler, "drop journal records covered by the snapshot");
    route(HttpMethod.GET, "/oms/stats", omsStatsHandler, "desk, journal, risk and FIX gateway counters");
    route(HttpMethod.POST, "/fix/parse", fixParseHandler, "validate and decode a FIX message ('|' or SOH delimited)");
    route(HttpMethod.POST, "/fix/order", fixOrderHandler, "send a NewOrderSingle through the desk's FIX session {clordid, symbol, side, qty, type, price, tif}");
    route(HttpMethod.POST, "/fix/cancel", fixCancelHandler, "send an OrderCancelRequest {orig_clordid, clordid}");
    route(HttpMethod.GET, "/fix/log", fixLogHandler, "FIX traffic of the desk session (?filter=&order=&offset=&limit=)");
    route(HttpMethod.GET, "/feed/replay", feedReplayHandler, "ITCH-style feed: publish, replay with packet loss, compare books (?events=&symbols=&drop_every=&packet_bytes=&seed=)");
    route(HttpMethod.GET, "/stress/scenarios", stressScenariosHandler, "built-in historical stress scenarios");
    route(HttpMethod.POST, "/stress/run", stressRunHandler, "stress a multi-asset book {underlyings, currencies, positions, scenario?, reverse_loss?} (?mc_paths=)");
    route(HttpMethod.GET, "/stress/demo", stressDemoHandler, "stress a book of live symbols with a put and a bond ladder (?symbols=&mc_paths=)");
    route(HttpMethod.POST, "/attribution/brinson", brinsonHandler, "Brinson-Fachler or BHB sector attribution {method, sectors:[{name, wp, wb, rp, rb}]}");
    route(HttpMethod.POST, "/attribution/link", linkHandler, "Carino/Menchero multi-period linking {portfolio, benchmark, effects?, method}");
    route(HttpMethod.POST, "/rebalance", rebalanceHandler, "whole-lot rebalance to targets with bands, min trade, turnover cap and costs");
    route(HttpMethod.GET, "/rebalance/simulate", rebalanceSimulateHandler, "buy-and-hold vs calendar vs threshold rebalancing (?symbols=&weights=&period=&band=)");
    route(HttpMethod.GET, "/columnar/stats", columnarStatsHandler, "columnar tables (rows, blocks, encoded size) and result-cache counters");
    route(HttpMethod.GET, "/columnar/:table", columnarQueryHandler, "zone-mapped columnar aggregate over trades or bars (?where=&group=&aggs=sum(qty),vwap(price,qty)&limit=&cache=)");
    route(HttpMethod.GET, "/feed/sample", feedSampleHandler, "first packets of a generated feed, hex and decoded (?events=&packets=&seed=)");
}

frame initializeWorker() {
    # Each forked worker gets a distinct id (its pid) for persisted trade keys.
    worker_counter = getpid();
    local s: *AppState = AppState.create(server_config);
    s.worker_id = worker_counter;
    setAppState(s);
    s.openStorage();
}

frame runServer(config: AppConfig) ret int {
    server_config = config;
    registerRoutes();
    local app: App = App.new();
    app.beforeRequest(startTimer);
    app.beforeRequest(securityHeaders);
    app.beforeRequest(throttle);
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
