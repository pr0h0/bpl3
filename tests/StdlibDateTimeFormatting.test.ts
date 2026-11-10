import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("formats dates with patterns and parses Go and ISO 8601 durations", () => {
  expectCorrectnessSuite([
    {
      name: "date patterns and durations",
      validateLlvm: true,
      expectedStdout:
        "full 2024-01-02 15:04:05 03PM Tue Tuesday Jan January 002 2 2 24  2|% %q\niso 2024-01-02 15:04:05 +0000 UTC 1704207845 01 2024\nrfc3339 2024-01-02T15:04:05Z\nhttp Tue, 02 Jan 2024 15:04:05 GMT\nedge Friday January week 53 isoYear 2020 isoDay 5\nlate week 1 isoYear 2025\nmonth 1 29\ndate 15/02/2024\n12h 12:30 AM\nparse 1h30m -> ok 5400000 PT1H30M\nparse 1.5s -> ok 1500 PT1.5S\nparse 250ms -> ok 250 PT0.25S\nparse -2m -> ok -120000 -PT2M\nparse 1h2m3.25s -> ok 3723250 PT1H2M3.25S\nparse 1500us -> ok 1 PT0.001S\nparse 2000000ns -> ok 2 PT0.002S\nparse 0 -> ok 0 PT0S\nparse PT1H30M -> ok 5400000 PT1H30M\nparse P2DT3H -> ok 183600000 P2DT3H\nparse PT0.5S -> ok 500 PT0.5S\nparse -PT1M -> ok -60000 -PT1M\nparse P1D -> ok 86400000 P1D\nparse  -> bad -1 -PT0.001S\nparse 5 -> bad -1 -PT0.001S\nparse 1x -> bad -1 -PT0.001S\nparse P1Y -> bad -1 -PT0.001S\nparse PT -> bad -1 -PT0.001S\nparse P1H -> bad -1 -PT0.001S\ndays 6 zero T negative T abs 5\n",
      source: `import [Date], [DateTime] from "std/date.bpl";
import [Duration] from "std/time.bpl";
import [String] from "std/string.bpl";
extern printf(fmt: string, ...);
extern free(ptr: *void);
frame show(label: string, text: String) { printf("%s %s\\n", label, text.cstr()); local t: String = text; t.destroy(); }
frame dur(text: string) {
    local d: Duration = Duration.fromMs(cast<long>(-1));
    local ok: bool = Duration.parse(text, &d);
    local iso: string = d.formatIso();
    printf("parse %s -> %s %ld %s\\n", text, ok ? "ok" : "bad", d.toMs(), iso);
    free(cast<*void>(iso));
}
frame main() ret int {
    local at: DateTime = DateTime.new(2024, 1, 2, 15, 4, 5);
    show("full", at.formatPattern("%Y-%m-%d %H:%M:%S %I%p %a %A %b %B %j %u %w %y %e|%% %q"));
    show("iso", at.formatPattern("%F %T %z %Z %s %V %G"));
    show("rfc3339", at.formatRfc3339());
    show("http", at.formatHttp());
    local edge: Date = Date.new(2021, 1, 1);
    printf("edge %s %s week %d isoYear %d isoDay %d\\n", edge.weekdayName(), edge.monthName(), edge.weekOfYear(), edge.isoWeekYear(), edge.isoWeekday());
    local late: Date = Date.new(2024, 12, 30);
    printf("late week %d isoYear %d\\n", late.weekOfYear(), late.isoWeekYear());
    local feb: Date = Date.new(2024, 2, 15);
    local s: Date = feb.startOfMonth(); local e: Date = feb.endOfMonth();
    printf("month %d %d\\n", s.day, e.day);
    show("date", feb.formatPattern("%d/%m/%Y"));
    local midnight: DateTime = DateTime.new(2024, 1, 2, 0, 30, 0);
    show("12h", midnight.formatPattern("%I:%M %p"));
    dur("1h30m"); dur("1.5s"); dur("250ms"); dur("-2m"); dur("1h2m3.25s"); dur("1500us"); dur("2000000ns"); dur("0");
    dur("PT1H30M"); dur("P2DT3H"); dur("PT0.5S"); dur("-PT1M"); dur("P1D");
    dur(""); dur("5"); dur("1x"); dur("P1Y"); dur("PT"); dur("P1H");
    local d: Duration = Duration.fromDays(cast<long>(2));
    local twice: Duration = d.scale(cast<long>(3));
    local neg: Duration = Duration.fromMs(cast<long>(-5));
    local positive: Duration = neg.abs();
    printf("days %ld zero %s negative %s abs %ld\\n", twice.toDays(), Duration.fromMs(cast<long>(0)).isZero() ? "T" : "F", neg.isNegative() ? "T" : "F", positive.toMs());
    return 0;
}
`,
    },
  ]);
}, 120000);
