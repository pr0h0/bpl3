# Self-tests for QScript (lexer, parser, compiler, VM) and the backtester.

import free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Text] from "../core/text.bpl";
import [Lexer], [TokType] from "../dsl/lexer.bpl";
import [Parser] from "../dsl/parser.bpl";
import [ScriptRun] from "../dsl/runner.bpl";
import [Vm], [Value], [VKind], [VmLimits] from "../dsl/vm.bpl";
import [BarSeries] from "../series/bars.bpl";
import [Backtest], [BacktestConfig], [BacktestReport], [Strategies] from "../backtest/backtester.bpl";

export runDslTests;

# Runs a script and returns the numeric value it emitted under `name`.
frame emittedNumber(run: *ScriptRun, name: string) ret float {
    if (!run.has_vm) {
        return 0.0 / 0.0;
    }
    loop (local i: int = 0; i < run.vm.emit_count; i = i + 1) {
        if (Text.equals(run.vm.emitted[i].name, name)) {
            local v: Value = run.vm.emitted[i].value;
            if ((v.kind == VKind.Num) || (v.kind == VKind.Bool)) {
                return v.num;
            }
        }
    }
    return 0.0 / 0.0;
}

frame expectValue(c: *Check, label: string, source: string, expected: float) {
    local run: ScriptRun;
    ScriptRun.execute(&run, source, nullptr, ScriptRun.defaultLimits());
    if (!run.ok) {
        c.ok(label, false);
        c.text(label, run.error);
    } else {
        c.near(label, emittedNumber(&run, "r"), expected, 0.0000000001);
    }
    run.destroy();
}

frame expectError(c: *Check, label: string, source: string, stage: string, line: int) {
    local run: ScriptRun;
    ScriptRun.execute(&run, source, nullptr, ScriptRun.defaultLimits());
    c.ok(label, !run.ok && Text.equals(run.stage, stage) && ((line == 0) || (run.line == line)));
    if (run.ok || !Text.equals(run.stage, stage) || ((line != 0) && (run.line != line))) {
        c.text(label, run.ok ? "ran successfully" : run.error);
    }
    run.destroy();
}

frame testLexer(c: *Check) {
    c.begin("qscript_lexer");
    local l: Lexer = Lexer.tokenize("let x = 1.5e2 + y ** 2; # comment\nfor i in 0..10 { x -= i; }");
    c.ok("ok", l.ok());
    c.equalInt("tokens", cast<long>(l.count), 22);
    c.ok("number", (l.toks[3].kind == TokType.Number) && (l.toks[3].num == 150.0));
    c.ok("power", l.toks[6].kind == TokType.Power);
    c.ok("range", l.toks[13].kind == TokType.DotDot);
    c.equalInt("line_tracking", cast<long>(l.toks[10].line), 2);
    l.destroy();
    local bad: Lexer = Lexer.tokenize("let s = \"open");
    c.ok("unterminated_string", !bad.ok());
    bad.destroy();
    local weird: Lexer = Lexer.tokenize("let a = 1 @ 2;");
    c.ok("bad_char", !weird.ok() && (weird.error_col == 11));
    weird.destroy();
}

frame testParser(c: *Check) {
    c.begin("qscript_parser");
    local p: Parser = Parser.parse("fn f(a, b) { return a * b + 1; }\nlet x = f(2, 3);\nif x > 5 { x = 1; } elif x > 2 { x = 2; } else { x = 3; }");
    c.ok("ok", p.ok());
    c.equalInt("statements", cast<long>(p.ast.at(p.ast.root).count), 3);
    p.destroy();
    local chained: Parser = Parser.parse("let x = 1 < 2 < 3;");
    c.ok("chained_comparison_rejected", !chained.ok());
    chained.destroy();
    local nested: Parser = Parser.parse("let x = ((((((((((((((((((((((((((((((1))))))))))))))))))))))))))))));");
    c.ok("nested_parens", nested.ok());
    nested.destroy();
}

frame testSemantics(c: *Check) {
    c.begin("qscript_eval");
    expectValue(c, "arithmetic", "emit(\"r\", 1 + 2 * 3 - 4 / 2);", 5.0);
    expectValue(c, "precedence_power", "emit(\"r\", -2 ** 2);", -4.0);
    expectValue(c, "power_right_assoc", "emit(\"r\", 2 ** 3 ** 2);", 512.0);
    expectValue(c, "modulo", "emit(\"r\", 17 % 5);", 2.0);
    expectValue(c, "logic_short_circuit", "let a = [1]; emit(\"r\", false and a[5] == 1);", 0.0);
    expectValue(c, "or_value", "emit(\"r\", nil or 7);", 7.0);
    expectValue(c, "while_loop", "let i = 0; let s = 0; while i < 100 { i += 1; s += i; } emit(\"r\", s);", 5050.0);
    expectValue(c, "for_range", "let s = 0; for i in 0..10 { s += i * i; } emit(\"r\", s);", 285.0);
    expectValue(c, "for_each", "let s = 0; for v in [3, 4, 5] { s = s * 10 + v; } emit(\"r\", s);", 345.0);
    expectValue(c, "break_continue", "let s = 0; for i in 0..100 { if i % 2 == 0 { continue; } if i > 10 { break; } s += i; } emit(\"r\", s);", 25.0);
    expectValue(c, "nested_loops", "let s = 0; for i in 0..5 { for j in 0..5 { if j > i { break; } s += 1; } } emit(\"r\", s);", 15.0);
    expectValue(c, "recursion", "fn fib(n) { if n < 2 { return n; } return fib(n - 1) + fib(n - 2); } emit(\"r\", fib(20));", 6765.0);
    expectValue(c, "mutual_recursion", "fn even(n) { if n == 0 { return true; } return odd(n - 1); } fn odd(n) { if n == 0 { return false; } return even(n - 1); } emit(\"r\", even(40));", 1.0);
    expectValue(c, "locals_shadow", "let x = 10; fn f(x) { let y = x * 2; if true { let y = 1; x = x + y; } return x + y; } emit(\"r\", f(3) + x);", 20.0);
    expectValue(c, "function_loops", "fn total(n) { let s = 0; for i in 0..n { for v in [1, 2] { s += v; } } return s; } emit(\"r\", total(4));", 12.0);
    expectValue(c, "arrays", "let a = array(5, 0); for i in 0..5 { a[i] = i * i; } a[2] += 100; emit(\"r\", a[2] + a[-1] + len(a));", 125.0);
    expectValue(c, "push_pop", "let a = []; for i in 0..10 { push(a, i); } let x = pop(a); emit(\"r\", x + len(a));", 18.0);
    expectValue(c, "nested_arrays", "let m = [[1, 2], [3, 4]]; m[1][0] = 9; emit(\"r\", m[1][0] + m[0][1]);", 11.0);
    expectValue(c, "strings", "let s = \"ab\" + \"cd\" + 5; emit(\"r\", len(s));", 5.0);
    expectValue(c, "string_compare", "emit(\"r\", \"abc\" < \"abd\" and \"x\" == \"x\");", 1.0);
    expectValue(c, "builtins_math", "emit(\"r\", abs(-3) + sqrt(16) + floor(2.7) + ceil(2.1) + round(2.5) + max(1, 9, 4) + min([5, 2, 8]));", 26.0);
    expectValue(c, "aggregates", "let a = [2, 4, 4, 4, 5, 5, 7, 9]; emit(\"r\", sum(a) + mean(a) + quantile(a, 0.5));", 49.5);
    expectValue(c, "sma_builtin", "let x = range(1, 11); let s = sma(x, 3); emit(\"r\", s[9]);", 9.0);
    expectValue(c, "is_nil_isnan", "let s = sma([1, 2, 3], 3); emit(\"r\", isnan(s[0]) and is_nil(nil) and not isnan(s[2]));", 1.0);
    expectValue(c, "bs_price", "emit(\"r\", round(bs_price(\"call\", 100, 100, 0.05, 0.2, 1) * 10000));", 104506.0);
    expectValue(c, "contains", "emit(\"r\", contains([1, \"a\", 3], \"a\"));", 1.0);
    expectValue(c, "slice_sort", "let a = sort([5, 3, 9, 1]); let b = slice(a, 1, 3); emit(\"r\", b[0] * 10 + b[1]);", 35.0);
    expectValue(c, "compound_index", "let a = [1, 2, 3]; for i in 0..3 { a[i] *= 10; } emit(\"r\", a[0] + a[1] + a[2]);", 60.0);
    expectValue(c, "random_deterministic", "let x = random(); emit(\"r\", x >= 0 and x < 1);", 1.0);
    expectError(c, "parse_error", "let x = ;", "parse", 1);
    expectError(c, "undefined_variable", "let x = 1;\nlet y = z + 1;", "compile", 2);
    expectError(c, "unknown_function", "let x = nope(1);", "compile", 1);
    expectError(c, "builtin_arity", "let x = sqrt(1, 2);", "compile", 1);
    expectError(c, "function_arity", "fn f(a) { return a; }\nlet x = f(1, 2);", "compile", 2);
    expectError(c, "duplicate_function", "fn f() { return 1; }\nfn f() { return 2; }", "compile", 2);
    expectError(c, "shadow_builtin", "fn len(a) { return 0; }", "compile", 1);
    expectError(c, "break_outside_loop", "break;", "compile", 1);
    expectError(c, "return_outside_function", "return 1;", "compile", 1);
    expectError(c, "assign_undeclared", "y = 1;", "compile", 1);
    expectError(c, "nested_function", "fn f() { fn g() { return 1; } return 1; }", "compile", 1);
    expectError(c, "index_out_of_range", "let a = [1, 2];\nlet b = a[2];", "run", 2);
    expectError(c, "division_by_zero", "let a = 1;\nlet b = a / 0;", "run", 2);
    expectError(c, "type_error", "let a = [1] - 1;", "run", 1);
    expectError(c, "deep_recursion", "fn f(n) { return f(n + 1); }\nf(0);", "run", 0);
    expectError(c, "infinite_loop", "while true { }", "run", 0);
    local limits: VmLimits = ScriptRun.defaultLimits();
    limits.max_elements = 1000;
    local big: ScriptRun;
    ScriptRun.execute(&big, "let a = array(5000, 0);", nullptr, limits);
    c.ok("memory_budget", !big.ok && Text.contains(big.error, "budget"));
    big.destroy();
    local out: ScriptRun;
    ScriptRun.execute(&out, "print(\"hello\", 1, [1, 2], nil, true);", nullptr, ScriptRun.defaultLimits());
    c.ok("print_output", out.ok && Text.equals(out.vm.output.toString(), "hello 1 [1, 2] nil true\n"));
    out.destroy();
}

frame testStrategyScripts(c: *Check) {
    c.begin("qscript_strategy");
    local bars: BarSeries = BarSeries.synthetic(cast<u64>(77), 500, 100.0, 0.08, 0.25, 86400);
    local src: string = "let fast = sma(close, 10);\nlet slow = sma(close, 40);\nfor i in 39..bars {\n  if fast[i] > slow[i] { position(i, 1); } else { position(i, -1); }\n}\nemit(\"crossings\", 0);\n";
    local run: ScriptRun;
    ScriptRun.execute(&run, src, &bars, ScriptRun.defaultLimits());
    c.ok("ran", run.ok);
    c.equalInt("positions", cast<long>(run.positionsSet()), 461);
    local cfg: BacktestConfig = Backtest.defaults();
    local script_report: BacktestReport = Backtest.run(&bars, run.vm.positions, &cfg);
    local native: *float = Strategies.smaCross(&bars, 10, 40, true);
    local native_report: BacktestReport = Backtest.run(&bars, native, &cfg);
    c.near("script_matches_native", script_report.final_equity, native_report.final_equity, 0.0000001);
    c.value("sma_cross_return", script_report.total_return, 6);
    c.value("sma_cross_sharpe", script_report.sharpe, 6);
    c.integer("sma_cross_trades", cast<long>(script_report.trade_count));
    c.integer("instructions", run.instructions);
    script_report.destroy();
    native_report.destroy();
    free(cast<*void>(native));
    run.destroy();
    local rsi_src: string = "let r = rsi(close, 14);\nlet pos = 0;\nfor i in 14..bars {\n  if r[i] < 30 { pos = 1; } elif r[i] > 70 { pos = -1; } elif (pos > 0 and r[i] > 50) or (pos < 0 and r[i] < 50) { pos = 0; }\n  position(i, pos);\n}\n";
    local rsi_run: ScriptRun;
    ScriptRun.execute(&rsi_run, rsi_src, &bars, ScriptRun.defaultLimits());
    local rsi_script: BacktestReport = Backtest.run(&bars, rsi_run.vm.positions, &cfg);
    local rsi_native_t: *float = Strategies.rsiReversion(&bars, 14, 30.0, 70.0);
    local rsi_native: BacktestReport = Backtest.run(&bars, rsi_native_t, &cfg);
    c.near("rsi_script_matches_native", rsi_script.final_equity, rsi_native.final_equity, 0.0000001);
    rsi_script.destroy();
    rsi_native.destroy();
    free(cast<*void>(rsi_native_t));
    rsi_run.destroy();
    bars.destroy();
}

frame testBacktester(c: *Check) {
    c.begin("backtest");
    local bars: BarSeries = BarSeries.synthetic(cast<u64>(5), 756, 100.0, 0.07, 0.2, 86400);
    local cfg: BacktestConfig = Backtest.defaults();
    cfg.commission_bps = 0.0;
    cfg.spread_bps = 0.0;
    local hold: *float = Strategies.buyAndHold(&bars);
    local r: BacktestReport = Backtest.run(&bars, hold, &cfg);
    # Without costs, buy and hold earns close[n-1] / open[1].
    c.near("buy_hold_exact", r.final_equity, (cfg.initial_cash * bars.close[bars.len - 1]) / bars.open[1], 0.000000001);
    c.equalInt("buy_hold_trades", cast<long>(r.trade_count), 1);
    c.near("buy_hold_exposure", r.exposure, cast<float>(bars.len - 1) / cast<float>(bars.len), 0.0000001);
    r.destroy();
    free(cast<*void>(hold));
    local costly: BacktestConfig = Backtest.defaults();
    local names: string[5] = ["sma_cross", "rsi_reversion", "bollinger", "macd_trend", "momentum"];
    loop (local s: int = 0; s < 5; s = s + 1) {
        local t: *float = nullptr;
        if (s == 0) {
            t = Strategies.smaCross(&bars, 20, 50, true);
        } else if (s == 1) {
            t = Strategies.rsiReversion(&bars, 14, 30.0, 70.0);
        } else if (s == 2) {
            t = Strategies.bollingerBreakout(&bars, 20, 2.0);
        } else if (s == 3) {
            t = Strategies.macdTrend(&bars, 0.15);
        } else {
            t = Strategies.momentum(&bars, 60);
        }
        local rep: BacktestReport = Backtest.run(&bars, t, &costly);
        local free_rep: BacktestReport = Backtest.run(&bars, t, &cfg);
        c.value(names[s], rep.total_return, 6);
        c.ok("costs_reduce_return", rep.final_equity <= (free_rep.final_equity + 0.000001));
        c.ok("drawdown_range", (rep.max_drawdown >= 0.0) && (rep.max_drawdown <= 1.0));
        rep.destroy();
        free_rep.destroy();
        free(cast<*void>(t));
    }
    local fast: int = 0;
    local slow: int = 0;
    local best: float = Strategies.optimizeSma(&bars, &costly, &fast, &slow);
    c.integer("optimized_fast", cast<long>(fast));
    c.integer("optimized_slow", cast<long>(slow));
    c.value("optimized_sharpe", best, 6);
    bars.destroy();
}

frame runDslTests(c: *Check) {
    testLexer(c);
    testParser(c);
    testSemantics(c);
    testStrategyScripts(c);
    testBacktester(c);
}
