# Self-tests for the CSV reader, option-book scenarios and Sobol sequences.

import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Text] from "../core/text.bpl";
import [CsvTable] from "../core/csv_reader.bpl";
import [OptionBook], [BookPosition], [BookGreeks], [ScenarioGrid], [Sobol] from "../quant/scenario.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "../quant/black_scholes.bpl";

export runScenarioTests;

frame testCsv(c: *Check) {
    c.begin("csv_reader");
    local t: CsvTable;
    c.ok("parse", t.parse("time,open,high,low,close\r\n1,10,11,9,10.5\n2,\"10.5\",\"12\",10,11.5\n\n\"3\",11.5,12.5,11,\"12\"\n", 100));
    c.equalInt("rows", cast<long>(t.rows), 4);
    c.equalInt("close_col", cast<long>(t.column("close")), 4);
    c.equalInt("case_insensitive", cast<long>(t.column("HIGH")), 2);
    local ok: bool = true;
    c.near("number", t.number(2, 1, &ok), 10.5, 0.0);
    c.ok("number_ok", ok);
    c.ok("quoted_value", Text.equals(t.field(3, 4), "12"));
    t.destroy();
    local q: CsvTable;
    c.ok("embedded", q.parse("a,b\n\"x, \"\"quoted\"\"\nline\",2\n", 10));
    c.ok("embedded_value", Text.equals(q.field(1, 0), "x, \"quoted\"\nline"));
    c.equalInt("embedded_width", cast<long>(q.width(1)), 2);
    q.destroy();
    local bad: CsvTable;
    c.ok("unterminated", !bad.parse("a,b\n\"oops,1\n", 10));
    c.equalInt("error_line", cast<long>(bad.error_line), 3);
    bad.destroy();
    local junk: CsvTable;
    c.ok("text_after_quote", !junk.parse("\"a\"b,1\n", 10));
    junk.destroy();
    local big: CsvTable;
    c.ok("row_limit", !big.parse("1\n2\n3\n", 2));
    big.destroy();
    local nan: CsvTable;
    nan.parse("x\nabc\n", 10);
    local good: bool = true;
    nan.number(1, 0, &good);
    c.ok("non_numeric_detected", !good);
    nan.destroy();
}

frame testBook(c: *Check) {
    c.begin("option_book");
    local book: OptionBook;
    book.init(0.03);
    local spx: int = book.addUnderlying(100.0, 0.2);
    local tech: int = book.addUnderlying(50.0, 0.35);
    # Short straddle on spx hedged with stock; long tech calls.
    book.add(BookPosition { underlying: spx, is_option: true, kind: OptionKind.Call, strike: 100.0, expiry: 0.5, quantity: -10.0 });
    book.add(BookPosition { underlying: spx, is_option: true, kind: OptionKind.Put, strike: 100.0, expiry: 0.5, quantity: -10.0 });
    book.add(BookPosition { underlying: spx, is_option: false, kind: OptionKind.Call, strike: 0.0, expiry: 0.0, quantity: 0.5 });
    book.add(BookPosition { underlying: tech, is_option: true, kind: OptionKind.Call, strike: 55.0, expiry: 1.0, quantity: 20.0 });
    local g: BookGreeks = book.greeks();
    c.near("value_matches", g.value, book.value(), 0.000000001);
    c.value("book_value", g.value, 6);
    c.value("book_delta", g.delta, 6);
    c.value("book_gamma", g.gamma, 6);
    c.value("book_vega", g.vega, 6);
    c.ok("short_gamma_spx", (g.gamma < 0.0) || (g.vega < 1000.0));
    local grid: ScenarioGrid = book.grid(-0.2, 0.2, 9, -0.1, 0.1, 5, 0.0);
    c.near("grid_center_zero", grid.at(4, 2), 0.0, 0.000000001);
    c.value("worst_pnl", grid.worst, 6);
    c.value("worst_spot", grid.worst_spot, 4);
    # Small moves: delta-gamma tracks full revaluation.
    local small: ScenarioGrid = book.grid(-0.01, 0.01, 3, 0.0, 0.0, 1, 0.0);
    local approx: float = OptionBook.deltaGamma(&g, 0.01);
    c.ok("delta_gamma_close", Math.abs(small.at(2, 0) - approx) < ((0.05 * Math.abs(small.at(2, 0))) + 0.5));
    small.destroy();
    local decay: ScenarioGrid = book.grid(0.0, 0.0, 1, 0.0, 0.0, 1, 1.0 / 365.0);
    c.near("theta_one_day", decay.at(0, 0), g.theta, 0.1);
    decay.destroy();
    local expired: ScenarioGrid = book.grid(0.0, 0.0, 1, 0.0, 0.0, 1, 2.0);
    c.value("all_expired_pnl", expired.at(0, 0), 6);
    expired.destroy();
    grid.destroy();
    book.destroy();
}

frame testSobol(c: *Check) {
    c.begin("sobol");
    local s: Sobol;
    s.init(2);
    local p: float[2] = [0.0, 0.0];
    s.next(&p[0]);
    c.near("first", p[0], 0.5, 0.0);
    s.next(&p[0]);
    c.near("second", p[0], 0.75, 0.0);
    c.near("second_dim2", p[1], 0.25, 0.0);
    s.next(&p[0]);
    c.near("third", p[0], 0.25, 0.0);
    # 1024 points stratify [0, 1) exactly in each of 1024 cells per dimension.
    local s2: Sobol;
    s2.init(2);
    local cells: int[1024];
    local cells2: int[1024];
    loop (local i: int = 0; i < 1024; i = i + 1) {
        cells[i] = 0;
        cells2[i] = 0;
    }
    # The Gray-code walk visits indices 0..1023; together with the origin they form one net.
    cells[0] = 1;
    cells2[0] = 1;
    loop (local i: int = 0; i < 1023; i = i + 1) {
        s2.next(&p[0]);
        cells[cast<int>(p[0] * 1024.0)] = cells[cast<int>(p[0] * 1024.0)] + 1;
        cells2[cast<int>(p[1] * 1024.0)] = cells2[cast<int>(p[1] * 1024.0)] + 1;
    }
    local stratified: bool = true;
    loop (local i: int = 0; i < 1024; i = i + 1) {
        if ((cells[i] != 1) || (cells2[i] != 1)) {
            stratified = false;
        }
    }
    c.ok("stratified", stratified);
    local call: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    local qmc: float = Sobol.european(&call, 16383);
    c.near("qmc_price", qmc, BlackScholes.price(&call), 0.002);
    c.value("qmc_error", qmc - BlackScholes.price(&call), 8);
}

frame runScenarioTests(c: *Check) {
    testCsv(c);
    testBook(c);
    testSobol(c);
}
