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
import [Text] from "./core/text.bpl";

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
    if (Text.equals(cmd, "help") || Text.equals(cmd, "--help")) {
        usage();
        return 0;
    }
    printf("unknown command: %s\n", cmd);
    usage();
    return 2;
}
