# Date and DateTime Test Example

import [Date], [DateTime] from "std/std.bpl";

import [printf] from "std/c.bpl";
import [free] from "std/c.bpl";

frame main() ret int {
    printf("=== Date and DateTime Test ===\n\n");

    # Date creation
    printf("--- Date Creation ---\n");
    local d1: Date = Date.new(2024, 6, 15);
    printf("Date.new(2024, 6, 15): %d-%02d-%02d\n", d1.year, d1.month, d1.day);

    local d2: Date = Date.new(2024, 1, 1);
    printf("Date.new(2024, 1, 1): %d-%02d-%02d\n", d2.year, d2.month, d2.day);

    local d3: Date = Date.new(2023, 12, 31);
    printf("Date.new(2023, 12, 31): %d-%02d-%02d\n", d3.year, d3.month, d3.day);

    # Leap year checks (static method)
    printf("\n--- Leap Year ---\n");
    printf("2024 is leap year: %d\n", cast<int>(Date.isLeapYearInt(2024)));
    printf("2023 is leap year: %d\n", cast<int>(Date.isLeapYearInt(2023)));
    printf("2000 is leap year: %d\n", cast<int>(Date.isLeapYearInt(2000)));
    printf("1900 is leap year: %d\n", cast<int>(Date.isLeapYearInt(1900)));

    # Days in month (static method)
    printf("\n--- Days in Month ---\n");
    printf("Days in Feb 2024 (leap): %d\n", Date.daysInMonthStatic(2024, 2));
    printf("Days in Feb 2023 (normal): %d\n", Date.daysInMonthStatic(2023, 2));
    printf("Days in Jan: %d\n", Date.daysInMonthStatic(2024, 1));
    printf("Days in Apr: %d\n", Date.daysInMonthStatic(2024, 4));
    printf("Days in Dec: %d\n", Date.daysInMonthStatic(2024, 12));

    # Instance leap year check
    printf("\n--- Instance Checks ---\n");
    printf("d1.isLeapYear(): %d\n", cast<int>(d1.isLeapYear()));
    printf("d1.daysInMonth(): %d\n", d1.daysInMonth());

    # Day of year
    printf("\n--- Day of Year ---\n");
    printf("Jan 1 2024 day of year: %d\n", d2.dayOfYear());
    printf("Jun 15 2024 day of year: %d\n", d1.dayOfYear());
    printf("Dec 31 2023 day of year: %d\n", d3.dayOfYear());

    # Day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
    printf("\n--- Day of Week ---\n");
    local monday: Date = Date.new(2024, 1, 1); # Jan 1 2024 is Monday
    printf("Jan 1 2024 day of week: %d (1=Monday)\n", monday.dayOfWeek());

    local sunday: Date = Date.new(2024, 1, 7); # Jan 7 2024 is Sunday
    printf("Jan 7 2024 day of week: %d (0=Sunday)\n", sunday.dayOfWeek());

    local saturday: Date = Date.new(2024, 6, 15); # Jun 15 2024 is Saturday
    printf("Jun 15 2024 day of week: %d (6=Saturday)\n", saturday.dayOfWeek());

    # Week of year
    printf("\n--- Week of Year ---\n");
    printf("Jan 1 2024 week: %d\n", d2.weekOfYear());
    printf("Jun 15 2024 week: %d\n", d1.weekOfYear());

    # Date arithmetic
    printf("\n--- Date Arithmetic ---\n");
    local base: Date = Date.new(2024, 1, 15);
    printf("Base date: %d-%02d-%02d\n", base.year, base.month, base.day);

    local plus10: Date = base.addDays(10);
    printf("Add 10 days: %d-%02d-%02d\n", plus10.year, plus10.month, plus10.day);

    local plus30: Date = base.addDays(30);
    printf("Add 30 days: %d-%02d-%02d\n", plus30.year, plus30.month, plus30.day);

    local minus5: Date = base.addDays(-5);
    printf("Subtract 5 days: %d-%02d-%02d\n", minus5.year, minus5.month, minus5.day);

    local plus1m: Date = base.addMonths(1);
    printf("Add 1 month: %d-%02d-%02d\n", plus1m.year, plus1m.month, plus1m.day);

    local plus3m: Date = base.addMonths(3);
    printf("Add 3 months: %d-%02d-%02d\n", plus3m.year, plus3m.month, plus3m.day);

    local plus1y: Date = base.addYears(1);
    printf("Add 1 year: %d-%02d-%02d\n", plus1y.year, plus1y.month, plus1y.day);

    # Date comparisons using compare()
    printf("\n--- Date Comparisons ---\n");
    local a: Date = Date.new(2024, 6, 15);
    local b: Date = Date.new(2024, 6, 15);
    local c: Date = Date.new(2024, 7, 1);
    printf("2024-06-15 == 2024-06-15: %d\n", cast<int>(a.equals(&b)));
    printf("2024-06-15 == 2024-07-01: %d\n", cast<int>(a.equals(&c)));
    printf("compare(2024-06-15, 2024-07-01): %d (neg=before)\n", a.compare(&c));
    printf("compare(2024-07-01, 2024-06-15): %d (pos=after)\n", c.compare(&a));

    # Days between
    printf("\n--- Days Between ---\n");
    local start: Date = Date.new(2024, 1, 1);
    local endDate: Date = Date.new(2024, 1, 10);
    printf("Days from Jan 1 to Jan 10: %d\n", start.diffDays(&endDate));

    local yearEnd: Date = Date.new(2024, 12, 31);
    printf("Days from Jan 1 to Dec 31: %d\n", start.diffDays(&yearEnd));

    # Date formatting
    printf("\n--- Date Formatting ---\n");
    local fmtDate: Date = Date.new(2024, 6, 15);
    local formatted: string = fmtDate.format();
    printf("Formatted date: %s\n", formatted);
    free(cast<*void>(formatted));

    # DateTime creation
    printf("\n--- DateTime Creation ---\n");
    local dt1: DateTime = DateTime.new(2024, 6, 15, 14, 30, 45);
    printf("DateTime: %d-%02d-%02d %02d:%02d:%02d\n", dt1.year, dt1.month, dt1.day, dt1.hour, dt1.minute, dt1.second);

    local dt2: DateTime = DateTime.fromDate(d1);
    printf("DateTime from Date: %d-%02d-%02d %02d:%02d:%02d\n", dt2.year, dt2.month, dt2.day, dt2.hour, dt2.minute, dt2.second);

    # DateTime arithmetic
    printf("\n--- DateTime Arithmetic ---\n");
    local dtBase: DateTime = DateTime.new(2024, 1, 1, 12, 0, 0);
    printf("Base: %d-%02d-%02d %02d:%02d:%02d\n", dtBase.year, dtBase.month, dtBase.day, dtBase.hour, dtBase.minute, dtBase.second);

    local plus1h: DateTime = dtBase.addHours(1);
    printf("Add 1 hour: %02d:%02d:%02d\n", plus1h.hour, plus1h.minute, plus1h.second);

    local plus90m: DateTime = dtBase.addMinutes(90);
    printf("Add 90 minutes: %02d:%02d:%02d\n", plus90m.hour, plus90m.minute, plus90m.second);

    local plus3700s: DateTime = dtBase.addSeconds(3700);
    printf("Add 3700 seconds: %02d:%02d:%02d\n", plus3700s.hour, plus3700s.minute, plus3700s.second);

    local plus2d: DateTime = dtBase.addDays(2);
    printf("Add 2 days: %d-%02d-%02d\n", plus2d.year, plus2d.month, plus2d.day);

    # DateTime comparisons
    printf("\n--- DateTime Comparisons ---\n");
    local dtA: DateTime = DateTime.new(2024, 6, 15, 10, 30, 0);
    local dtB: DateTime = DateTime.new(2024, 6, 15, 10, 30, 0);
    local dtC: DateTime = DateTime.new(2024, 6, 15, 11, 0, 0);
    printf("10:30 == 10:30: %d\n", cast<int>(dtA.equals(&dtB)));
    printf("10:30 == 11:00: %d\n", cast<int>(dtA.equals(&dtC)));
    printf("compare(10:30, 11:00): %d (neg=before)\n", dtA.compare(&dtC));

    # DateTime to Date
    printf("\n--- DateTime to Date ---\n");
    local dateOnly: Date = dt1.toDate();
    printf("Date from DateTime: %d-%02d-%02d\n", dateOnly.year, dateOnly.month, dateOnly.day);

    printf("\n=== Date and DateTime Test Complete ===\n");
    return 0;
}
