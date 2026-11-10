# bpl-quant entry point.
#
#   bpl-quant selftest            deterministic kernel checks (exit 1 on failure)
#   bpl-quant bench [scale]       timed compute kernels
#   bpl-quant serve [port] [workers]
#   bpl-quant loadgen [port] [requests] [concurrency]

import printf, strcmp from "std/c.bpl";
import [Check] from "./selftest/check.bpl";
import runMathTests from "./selftest/math_tests.bpl";
import runPricingTests from "./selftest/pricing_tests.bpl";
import runMarketTests from "./selftest/market_tests.bpl";
import runSeriesTests from "./selftest/series_tests.bpl";
import runRiskTests from "./selftest/risk_tests.bpl";
import runDslTests from "./selftest/dsl_tests.bpl";
import runRatesTests from "./selftest/rates_tests.bpl";
import runSurfaceTests from "./selftest/surface_tests.bpl";
import runTsaTests from "./selftest/tsa_tests.bpl";
import runOptimTests from "./selftest/optim_tests.bpl";
import runSqlTests from "./selftest/sql_tests.bpl";
import runStoreTests from "./selftest/store_tests.bpl";
import runMicroTests from "./selftest/micro_tests.bpl";
import runMlTests from "./selftest/ml_tests.bpl";
import [Text] from "./core/text.bpl";
import [Env] from "std/env.bpl";
import runServer, defaultConfig from "./api/server.bpl";
import runBench from "./bench/kernels.bpl";
import runLoadgen from "./bench/loadgen.bpl";
import [AppConfig] from "./api/state.bpl";

frame usage() {
    printf("usage: bpl-quant <command> [options]\n");
    printf("  selftest                   run deterministic kernel checks\n");
    printf("  bench [scale]              time the compute kernels (scale 1-100)\n");
    printf("  serve [port] [workers]     start the HTTP API (default 8080, 1 worker)\n");
    printf("  loadgen [port] [n] [c]     fire n requests with c concurrent clients\n");
}

frame runSelftest() ret int {
    local c: Check = Check.new();
    runMathTests(&c);
    runPricingTests(&c);
    runMarketTests(&c);
    runSeriesTests(&c);
    runRiskTests(&c);
    runDslTests(&c);
    runRatesTests(&c);
    runSurfaceTests(&c);
    runTsaTests(&c);
    runOptimTests(&c);
    runSqlTests(&c);
    runStoreTests(&c);
    runMicroTests(&c);
    runMlTests(&c);
    return c.summary() == 0 ? 0 : 1;
}

frame main(argc: int, argv: *string) ret int {
    if (argc < 2) {
        usage();
        return 2;
    }
    local cmd: string = argv[1];
    if (Text.equals(cmd, "selftest")) {
        return runSelftest();
    }
    if (Text.equals(cmd, "serve")) {
        local config: AppConfig = defaultConfig();
        if (argc > 2) {
            config.port = Text.parseIntOr(argv[2], -1);
        }
        if (argc > 3) {
            config.workers = Text.parseIntOr(argv[3], -1);
        }
        local db: string = Env.getOr("BPLQUANT_DB", "");
        if (!Text.isEmpty(db)) {
            config.db_path = db;
            config.persist = true;
        }
        config.rate_limit = Env.getInt("BPLQUANT_RATE_LIMIT", 0);
        config.rate_window = Env.getInt("BPLQUANT_RATE_WINDOW", 60);
        config.access_log = Env.getBool("BPLQUANT_ACCESS_LOG", false);
        if ((config.rate_limit > 0) && !config.persist) {
            printf("serve: BPLQUANT_RATE_LIMIT needs BPLQUANT_DB (counters are shared through SQLite)\n");
            return 2;
        }
        if ((config.port < 1) || (config.port > 65535) || (config.workers < 1) || (config.workers > 8)) {
            printf("serve: port must be 1-65535 and workers 1-8\n");
            return 2;
        }
        return runServer(config);
    }
    if (Text.equals(cmd, "bench")) {
        local scale: int = argc > 2 ? Text.parseIntOr(argv[2], -1) : 1;
        if ((scale < 1) || (scale > 100)) {
            printf("bench: scale must be 1-100\n");
            return 2;
        }
        return runBench(scale);
    }
    if (Text.equals(cmd, "loadgen")) {
        if (argc < 3) {
            printf("loadgen: port required\n");
            return 2;
        }
        local port: int = Text.parseIntOr(argv[2], -1);
        local total: int = argc > 3 ? Text.parseIntOr(argv[3], -1) : 2000;
        local conc: int = argc > 4 ? Text.parseIntOr(argv[4], -1) : 4;
        local mix: string = argc > 5 ? argv[5] : "mixed";
        if ((port < 1) || (port > 65535) || (total < 1) || (conc < 1) || (conc > 256) || (conc > total)) {
            printf("loadgen: invalid port, request count or concurrency\n");
            return 2;
        }
        return runLoadgen(port, total, conc, mix);
    }
    if (Text.equals(cmd, "help") || Text.equals(cmd, "--help")) {
        usage();
        return 0;
    }
    printf("unknown command: %s\n", cmd);
    usage();
    return 2;
}
