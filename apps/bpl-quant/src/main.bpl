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
import [Text] from "./core/text.bpl";
import runServer, defaultConfig from "./api/server.bpl";
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
        if ((config.port < 1) || (config.port > 65535) || (config.workers < 1) || (config.workers > 8)) {
            printf("serve: port must be 1-65535 and workers 1-8\n");
            return 2;
        }
        return runServer(config);
    }
    if (Text.equals(cmd, "help") || Text.equals(cmd, "--help")) {
        usage();
        return 0;
    }
    printf("unknown command: %s\n", cmd);
    usage();
    return 2;
}
