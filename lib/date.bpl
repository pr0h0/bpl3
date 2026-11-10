# Date and DateTime utilities

export [Date];
export [DateTime];

extern time(ptr: *long) ret long;
extern gettimeofday(tv: *void, tz: *void) ret int;
extern malloc(size: long) ret *void;
extern snprintf(str: string, capacity: ulong, format: string, ...) ret int;
extern strlen(str: string) ret long;

import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";

global DATE_WEEKDAY_NAMES: string[7] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
global DATE_MONTH_NAMES: string[12] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

frame datePad(out: *StringBuilder, value: long, width: int, fill: char) {
    local negative: bool = value < cast<long>(0);
    local magnitude: ulong = cast<ulong>(value);
    if (negative) {
        magnitude = cast<ulong>(0) - magnitude;
        out.appendChar('-');
    }
    local digits: char[24];
    local count: int = 0;
    loop {
        digits[count] = cast<char>(cast<int>(magnitude % cast<ulong>(10)) + 48);
        count = count + 1;
        magnitude = magnitude / cast<ulong>(10);
        if (magnitude == cast<ulong>(0)) {
            break;
        }
    }
    loop (local i: int = count; i < width; i = i + 1) {
        out.appendChar(fill);
    }
    loop (local i: int = count - 1; i >= 0; i = i - 1) {
        out.appendChar(digits[i]);
    }
}

# Appends the first `count` bytes of `text` (all of it for count < 0).
frame dateAppendName(out: *StringBuilder, text: string, count: int) {
    loop (local i: int = 0; (text[i] != cast<char>(0)) && ((count < 0) || (i < count)); i = i + 1) {
        out.appendChar(text[i]);
    }
}

# Reads exactly `count` ASCII digits of `text` starting at `at` into `value`.
frame dateReadDigits(text: string, length: long, at: long, count: int, value: *int) ret bool {
    if ((at + cast<long>(count)) > length) {
        return false;
    }
    local result: int = 0;
    loop (local i: int = 0; i < count; i = i + 1) {
        local c: int = cast<int>(cast<u8>(text[at + cast<long>(i)]));
        if ((c < 48) || (c > 57)) {
            return false;
        }
        result = (result * 10) + (c - 48);
    }
    *value = result;
    return true;
}

# Parses `YYYY-MM-DD` at the start of `text` into the three fields.
frame dateReadYmd(text: string, length: long, year: *int, month: *int, day: *int) ret bool {
    return dateReadDigits(text, length, 0, 4, year) && (length > 4) && (text[4] == '-') && dateReadDigits(text, length, 5, 2, month) && (length > 7) && (text[7] == '-') && dateReadDigits(text, length, 8, 2, day);
}

struct Timeval {
    tv_sec: long,
    tv_usec: long,
}

struct Date {
    year: int,
    month: int,
    day: int,
    # Create a new date
    frame new(year: int, month: int, day: int) ret Date {
        local d: Date;
        d.year = year;
        d.month = month;
        d.day = day;
        return d;
    }

    # Get today's date (UTC)
    frame today() ret Date {
        local t: long = 0;
        time(&t);
        return Date.fromTimestamp(t);
    }

    # Gregorian civil-day conversion uses March-based 400-year cycles.
    # Algorithm reference: https://howardhinnant.github.io/date_algorithms.html
    # Floor division is required because BPL signed division truncates toward zero.
    frame fromTimestamp(timestamp: long) ret Date {
        local days: long = timestamp / cast<long>(86400);
        if ((timestamp % cast<long>(86400)) < 0) {
            days = days - 1;
        }
        local shifted: long = days + 719468;
        local era: long = shifted / 146097;
        if ((shifted % 146097) < 0) {
            era = era - 1;
        }
        local dayOfEra: long = shifted - (era * 146097);
        local yearOfEra: long = (((dayOfEra - (dayOfEra / 1460)) + (dayOfEra / 36524)) - (dayOfEra / 146096)) / 365;
        local year: long = yearOfEra + (era * 400);
        local dayOfYear: long = dayOfEra - (((yearOfEra * 365) + (yearOfEra / 4)) - (yearOfEra / 100));
        local marchMonth: long = ((cast<long>(5) * dayOfYear) + 2) / 153;
        local day: int = cast<int>((dayOfYear - (((cast<long>(153) * marchMonth) + 2) / 5)) + 1);
        local month: int = cast<int>(marchMonth) + 3;
        if (marchMonth >= 10) {
            month = month - 12;
            year = year + 1;
        }
        if ((year < -2147483648) || (year > 2147483647)) {
            throw "Date.fromTimestamp: year is outside the int range";
        }
        return Date.new(cast<int>(year), month, day);
    }

    # Convert a valid proleptic Gregorian date to midnight UTC.
    # Every int year fits safely in a long Unix timestamp.
    frame toTimestamp(this: *Date) ret long {
        if (!this.isValid()) {
            throw "Date.toTimestamp: invalid date";
        }
        local year: long = cast<long>(this.year);
        local marchMonth: long = cast<long>(this.month) - 3;
        if (this.month <= 2) {
            year = year - 1;
            marchMonth = marchMonth + 12;
        }
        local era: long = year / 400;
        if ((year % 400) < 0) {
            era = era - 1;
        }
        local yearOfEra: long = year - (era * 400);
        local dayOfYear: long = ((((cast<long>(153) * marchMonth) + 2) / 5) + cast<long>(this.day)) - 1;
        local dayOfEra: long = (((yearOfEra * 365) + (yearOfEra / 4)) - (yearOfEra / 100)) + dayOfYear;
        return (((era * 146097) + dayOfEra) - 719468) * cast<long>(86400);
    }

    # Static helper for leap year check
    frame isLeapYearInt(year: int) ret bool {
        return ((year % 4) == 0) && (((year % 100) != 0) || ((year % 400) == 0));
    }

    # Static helper for days in month
    frame daysInMonthStatic(year: int, month: int) ret int {
        if (month == 2) {
            if (Date.isLeapYearInt(year)) {
                return 29;
            }
            return 28;
        }
        if ((month == 4) || (month == 6) || (month == 9) || (month == 11)) {
            return 30;
        }
        return 31;
    }

    # Check if this year is a leap year
    frame isLeapYear(this: *Date) ret bool {
        return Date.isLeapYearInt(this.year);
    }

    # Get days in the current month
    frame daysInMonth(this: *Date) ret int {
        return Date.daysInMonthStatic(this.year, this.month);
    }

    # Get day of year (1-366)
    frame dayOfYear(this: *Date) ret int {
        if (!this.isValid()) {
            throw "Date.dayOfYear: invalid date";
        }
        local total: int = 0;
        local m: int = 1;
        loop (m < this.month) {
            total = total + Date.daysInMonthStatic(this.year, m);
            m = m + 1;
        }
        return total + this.day;
    }

    # Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
    frame dayOfWeek(this: *Date) ret int {
        local days: long = this.toTimestamp() / cast<long>(86400);
        local dow: int = cast<int>((days + 4) % 7);
        if (dow < 0) {
            dow = dow + 7;
        }
        return dow;
    }

    # ISO week number (1-53); early January / late December may belong
    # to the adjacent ISO week-year rather than this calendar year.
    frame weekOfYear(this: *Date) ret int {
        local doy: int = this.dayOfYear();
        local dow: int = this.dayOfWeek();
        local januaryFirst: int = ((dow - ((doy - 1) % 7)) + 7) % 7;
        if (dow == 0) {
            dow = 7;
        }
        local week: int = ((doy - dow) + 10) / 7;
        if (week < 1) {
            # Widen before subtraction so the minimum int year is supported.
            local previousYear: long = cast<long>(this.year) - 1;
            local previousLeap: bool = ((previousYear % 4) == 0) && (((previousYear % 100) != 0) || ((previousYear % 400) == 0));
            if ((januaryFirst == 5) || ((januaryFirst == 6) && previousLeap)) {
                return 53;
            }
            return 52;
        }
        if ((week == 53) && (januaryFirst != 4) && !((januaryFirst == 3) && this.isLeapYear())) {
            return 1;
        }
        return week;
    }

    # Add days to the date
    frame addDays(this: *Date, days: int) ret Date {
        local ts: long = this.toTimestamp() + (cast<long>(days) * cast<long>(86400));
        return Date.fromTimestamp(ts);
    }

    # Subtract days from the date
    frame subDays(this: *Date, days: int) ret Date {
        local ts: long = this.toTimestamp() - (cast<long>(days) * cast<long>(86400));
        return Date.fromTimestamp(ts);
    }

    # Add months (adjusts day if needed)
    frame addMonths(this: *Date, months: int) ret Date {
        if (!this.isValid()) {
            throw "Date.addMonths: invalid date";
        }
        local totalMonths: long = (((cast<long>(this.year) * 12) + cast<long>(this.month)) - 1) + cast<long>(months);
        local year: long = totalMonths / 12;
        local month: long = totalMonths % 12;
        if (month < 0) {
            month = month + 12;
            year = year - 1;
        }
        if ((year < -2147483648) || (year > 2147483647)) {
            throw "Date.addMonths: year is outside the int range";
        }
        local newYear: int = cast<int>(year);
        local newMonth: int = cast<int>(month) + 1;

        local maxDay: int = Date.daysInMonthStatic(newYear, newMonth);
        local newDay: int = this.day;
        if (newDay > maxDay) {
            newDay = maxDay;
        }
        return Date.new(newYear, newMonth, newDay);
    }

    # Add years
    frame addYears(this: *Date, years: int) ret Date {
        if (!this.isValid()) {
            throw "Date.addYears: invalid date";
        }
        local year: long = cast<long>(this.year) + cast<long>(years);
        if ((year < -2147483648) || (year > 2147483647)) {
            throw "Date.addYears: year is outside the int range";
        }
        local newYear: int = cast<int>(year);
        local maxDay: int = Date.daysInMonthStatic(newYear, this.month);
        local newDay: int = this.day;
        if (newDay > maxDay) {
            newDay = maxDay;
        }
        return Date.new(newYear, this.month, newDay);
    }

    # Calculate difference in days between two dates
    frame diffDays(this: *Date, other: *Date) ret int {
        local days: long = this.diffDaysLong(other);
        if ((days < -2147483648) || (days > 2147483647)) {
            throw "Date.diffDays: difference is outside the int range";
        }
        return cast<int>(days);
    }

    # Exact signed day difference across the full supported year range.
    frame diffDaysLong(this: *Date, other: *Date) ret long {
        return (this.toTimestamp() - other.toTimestamp()) / cast<long>(86400);
    }

    # Check if date is valid
    frame isValid(this: *Date) ret bool {
        if ((this.month < 1) || (this.month > 12)) {
            return false;
        }
        if (this.day < 1) {
            return false;
        }
        if (this.day > Date.daysInMonthStatic(this.year, this.month)) {
            return false;
        }
        return true;
    }

    # Format date as string (YYYY-MM-DD)
    # Parses an ISO 8601 calendar date, exactly `YYYY-MM-DD`. Returns false,
    # leaving `output` unchanged, for any other text or an impossible date
    # such as `2026-02-30`.
    frame tryParse(text: string, output: *Date) ret bool {
        if ((text == nullptr) || (output == nullptr)) {
            return false;
        }
        local length: long = strlen(text);
        local year: int = 0;
        local month: int = 0;
        local day: int = 0;
        if ((length != 10) || !dateReadYmd(text, length, &year, &month, &day)) {
            return false;
        }
        local date: Date = Date.new(year, month, day);
        if (!date.isValid()) {
            return false;
        }
        *output = date;
        return true;
    }

    frame format(this: *Date) ret string {
        # Three signed int fields (at most 11 bytes each), separators, and NUL.
        local buf: string = cast<string>(malloc(cast<long>(36)));
        if (buf == nullptr) {
            throw "Date formatting: allocation failed";
        }
        snprintf(buf, cast<ulong>(36), "%04d-%02d-%02d", this.year, this.month, this.day);
        return buf;
    }

    # Format date with custom separator
    frame formatSep(this: *Date, sep: u8) ret string {
        # Three signed int fields (at most 11 bytes each), separators, and NUL.
        local buf: string = cast<string>(malloc(cast<long>(36)));
        if (buf == nullptr) {
            throw "Date formatting: allocation failed";
        }
        local sepBytes: u8[2];
        local sepStr: string = cast<string>(&sepBytes[0]);
        local sepPtr: *u8 = cast<*u8>(sepStr);
        *sepPtr = sep;
        *(sepPtr + 1) = cast<u8>(0);
        snprintf(buf, cast<ulong>(36), "%04d%s%02d%s%02d", this.year, sepStr, this.month, sepStr, this.day);
        return buf;
    }

    # Compare dates
    frame compare(this: *Date, other: *Date) ret int {
        if (this.year < other.year) {
            return -1;
        }
        if (this.year > other.year) {
            return 1;
        }
        if (this.month < other.month) {
            return -1;
        }
        if (this.month > other.month) {
            return 1;
        }
        if (this.day < other.day) {
            return -1;
        }
        if (this.day > other.day) {
            return 1;
        }
        return 0;
    }

    frame equals(this: *Date, other: *Date) ret bool {
        return (this.year == other.year) && (this.month == other.month) && (this.day == other.day);
    }

    frame __eq__(this: *Date, other: *Date) ret bool {
        return this.equals(other);
    }

    frame __ne__(this: *Date, other: *Date) ret bool {
        return !this.equals(other);
    }

    frame __lt__(this: *Date, other: *Date) ret bool {
        return this.compare(other) < 0;
    }

    frame __le__(this: *Date, other: *Date) ret bool {
        return this.compare(other) <= 0;
    }

    frame __gt__(this: *Date, other: *Date) ret bool {
        return this.compare(other) > 0;
    }

    frame __ge__(this: *Date, other: *Date) ret bool {
        return this.compare(other) >= 0;
    }

    # The English weekday name ("Sunday" ... "Saturday").
    frame weekdayName(this: *Date) ret string {
        return DATE_WEEKDAY_NAMES[this.dayOfWeek()];
    }

    # The English month name, or "" for an invalid month.
    frame monthName(this: *Date) ret string {
        if ((this.month < 1) || (this.month > 12)) {
            return "";
        }
        return DATE_MONTH_NAMES[this.month - 1];
    }

    # ISO weekday: 1 = Monday ... 7 = Sunday.
    frame isoWeekday(this: *Date) ret int {
        local dow: int = this.dayOfWeek();
        if (dow == 0) {
            return 7;
        }
        return dow;
    }

    # The ISO week-numbering year (differs from `year` near January 1).
    frame isoWeekYear(this: *Date) ret int {
        local week: int = this.weekOfYear();
        if ((this.month == 1) && (week >= 52)) {
            return this.year - 1;
        }
        if ((this.month == 12) && (week == 1)) {
            return this.year + 1;
        }
        return this.year;
    }

    # The first and last day of this date's month.
    frame startOfMonth(this: *Date) ret Date {
        return Date.new(this.year, this.month, 1);
    }

    frame endOfMonth(this: *Date) ret Date {
        return Date.new(this.year, this.month, this.daysInMonth());
    }

    # Formats with strftime-style directives (see DateTime.formatPattern).
    frame formatPattern(this: *Date, pattern: string) ret String {
        local at: DateTime = DateTime.fromDate(*this);
        return at.formatPattern(pattern);
    }

    frame clone(this: *Date) ret Date {
        return Date.new(this.year, this.month, this.day);
    }
}

struct DateTime {
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
    second: int,
    # Create a new DateTime
    frame new(year: int, month: int, day: int, hour: int, minute: int, second: int) ret DateTime {
        local dt: DateTime;
        dt.year = year;
        dt.month = month;
        dt.day = day;
        dt.hour = hour;
        dt.minute = minute;
        dt.second = second;
        return dt;
    }

    # Create from Date (at midnight)
    frame fromDate(d: Date) ret DateTime {
        return DateTime.new(d.year, d.month, d.day, 0, 0, 0);
    }

    # Get current date and time (UTC)
    frame now() ret DateTime {
        local t: long = 0;
        time(&t);
        return DateTime.fromTimestamp(t);
    }

    # Create from Unix timestamp
    frame fromTimestamp(timestamp: long) ret DateTime {
        local d: Date = Date.fromTimestamp(timestamp);
        local remaining: long = timestamp % cast<long>(86400);
        if (remaining < 0) {
            remaining = remaining + 86400;
        }
        local hour: int = cast<int>(remaining / cast<long>(3600));
        remaining = remaining % cast<long>(3600);
        local minute: int = cast<int>(remaining / cast<long>(60));
        local second: int = cast<int>(remaining % cast<long>(60));

        return DateTime.new(d.year, d.month, d.day, hour, minute, second);
    }

    # Convert to Unix timestamp
    frame toTimestamp(this: *DateTime) ret long {
        if (!this.isValid()) {
            throw "DateTime.toTimestamp: invalid date or time";
        }
        local d: Date = Date.new(this.year, this.month, this.day);
        local ts: long = d.toTimestamp();
        ts = ts + (cast<long>(this.hour) * cast<long>(3600));
        ts = ts + (cast<long>(this.minute) * cast<long>(60));
        ts = ts + cast<long>(this.second);
        return ts;
    }

    # Get the Date part
    frame toDate(this: *DateTime) ret Date {
        return Date.new(this.year, this.month, this.day);
    }

    # Check if valid
    frame isValid(this: *DateTime) ret bool {
        local d: Date = Date.new(this.year, this.month, this.day);
        if (!d.isValid()) {
            return false;
        }
        if ((this.hour < 0) || (this.hour > 23)) {
            return false;
        }
        if ((this.minute < 0) || (this.minute > 59)) {
            return false;
        }
        if ((this.second < 0) || (this.second > 59)) {
            return false;
        }
        return true;
    }

    # Add seconds
    frame addSeconds(this: *DateTime, seconds: long) ret DateTime {
        return addDateTimeUnits(this, seconds, 1);
    }

    # Add minutes
    frame addMinutes(this: *DateTime, minutes: long) ret DateTime {
        return addDateTimeUnits(this, minutes, 60);
    }

    # Add hours
    frame addHours(this: *DateTime, hours: long) ret DateTime {
        return addDateTimeUnits(this, hours, 3600);
    }

    # Add days
    frame addDays(this: *DateTime, days: long) ret DateTime {
        return addDateTimeUnits(this, days, 86400);
    }

    # Add calendar months, clamping the day and preserving the clock fields.
    frame addMonths(this: *DateTime, months: int) ret DateTime {
        if (!this.isValid()) {
            throw "DateTime.addMonths: invalid date or time";
        }
        local date: Date = this.toDate();
        local result: Date = date.addMonths(months);
        return DateTime.new(result.year, result.month, result.day, this.hour, this.minute, this.second);
    }

    # Add calendar years, clamping February 29 when necessary.
    frame addYears(this: *DateTime, years: int) ret DateTime {
        if (!this.isValid()) {
            throw "DateTime.addYears: invalid date or time";
        }
        local date: Date = this.toDate();
        local result: Date = date.addYears(years);
        return DateTime.new(result.year, result.month, result.day, this.hour, this.minute, this.second);
    }

    # Calculate difference in seconds
    frame diffSeconds(this: *DateTime, other: *DateTime) ret long {
        return this.toTimestamp() - other.toTimestamp();
    }

    # Format as ISO 8601 string (YYYY-MM-DD HH:MM:SS)
    frame format(this: *DateTime) ret string {
        # Six signed int fields, five separators, and NUL fit in 72 bytes.
        local buf: string = cast<string>(malloc(cast<long>(72)));
        if (buf == nullptr) {
            throw "DateTime formatting: allocation failed";
        }
        snprintf(buf, cast<ulong>(72), "%04d-%02d-%02d %02d:%02d:%02d", this.year, this.month, this.day, this.hour, this.minute, this.second);
        return buf;
    }

    /#
    Parses an ISO 8601 date and time: `YYYY-MM-DD`, then `T`, `t` or a
    space, then `HH:MM:SS`, optional fractional seconds (ignored), and an
    optional `Z` or `+HH:MM`/`-HH:MM`/`+HHMM` offset. With an offset the
    result is converted to UTC; without one the fields are kept as written.
    Returns false, leaving `output` unchanged, for other text or an
    impossible date or time.
    #/
    frame tryParse(text: string, output: *DateTime) ret bool {
        if ((text == nullptr) || (output == nullptr)) {
            return false;
        }
        local length: long = strlen(text);
        local year: int = 0;
        local month: int = 0;
        local day: int = 0;
        local hour: int = 0;
        local minute: int = 0;
        local second: int = 0;
        if (!dateReadYmd(text, length, &year, &month, &day) || (length < 19)) {
            return false;
        }
        local separator: char = text[10];
        if ((separator != 'T') && (separator != 't') && (separator != ' ')) {
            return false;
        }
        if (!dateReadDigits(text, length, 11, 2, &hour) || (text[13] != ':') || !dateReadDigits(text, length, 14, 2, &minute) || (text[16] != ':') || !dateReadDigits(text, length, 17, 2, &second)) {
            return false;
        }
        local at: long = 19;
        if ((at < length) && (text[at] == '.')) {
            at = at + 1;
            local fractionStart: long = at;
            loop ((at < length) && (cast<int>(cast<u8>(text[at])) >= 48) && (cast<int>(cast<u8>(text[at])) <= 57)) {
                at = at + 1;
            }
            if (at == fractionStart) {
                return false;
            }
        }
        local offsetSeconds: long = 0;
        if (at < length) {
            local zone: char = text[at];
            if ((zone == 'Z') || (zone == 'z')) {
                at = at + 1;
            } else if ((zone == '+') || (zone == '-')) {
                local offsetHours: int = 0;
                local offsetMinutes: int = 0;
                if (!dateReadDigits(text, length, at + 1, 2, &offsetHours)) {
                    return false;
                }
                local minutesAt: long = at + 3;
                if ((minutesAt < length) && (text[minutesAt] == ':')) {
                    minutesAt = minutesAt + 1;
                }
                if (!dateReadDigits(text, length, minutesAt, 2, &offsetMinutes) || (offsetHours > 23) || (offsetMinutes > 59)) {
                    return false;
                }
                offsetSeconds = cast<long>((offsetHours * 3600) + (offsetMinutes * 60));
                if (zone == '-') {
                    offsetSeconds = -offsetSeconds;
                }
                at = minutesAt + 2;
            } else {
                return false;
            }
        }
        if (at != length) {
            return false;
        }
        local parsed: DateTime = DateTime.new(year, month, day, hour, minute, second);
        if (!parsed.isValid()) {
            return false;
        }
        if (offsetSeconds != 0) {
            parsed = DateTime.fromTimestamp(parsed.toTimestamp() - offsetSeconds);
        }
        *output = parsed;
        return true;
    }

    # Format as ISO 8601 with T separator
    frame formatISO(this: *DateTime) ret string {
        # Six signed int fields, five separators, and NUL fit in 72 bytes.
        local buf: string = cast<string>(malloc(cast<long>(72)));
        if (buf == nullptr) {
            throw "DateTime formatting: allocation failed";
        }
        snprintf(buf, cast<ulong>(72), "%04d-%02d-%02dT%02d:%02d:%02d", this.year, this.month, this.day, this.hour, this.minute, this.second);
        return buf;
    }

    # Format time only (HH:MM:SS)
    frame formatTime(this: *DateTime) ret string {
        # Three signed int fields (at most 11 bytes each), separators, and NUL.
        local buf: string = cast<string>(malloc(cast<long>(36)));
        if (buf == nullptr) {
            throw "Date formatting: allocation failed";
        }
        snprintf(buf, cast<ulong>(36), "%02d:%02d:%02d", this.hour, this.minute, this.second);
        return buf;
    }

    # Compare DateTimes
    frame compare(this: *DateTime, other: *DateTime) ret int {
        local ts1: long = this.toTimestamp();
        local ts2: long = other.toTimestamp();
        if (ts1 < ts2) {
            return -1;
        }
        if (ts1 > ts2) {
            return 1;
        }
        return 0;
    }

    frame equals(this: *DateTime, other: *DateTime) ret bool {
        return this.toTimestamp() == other.toTimestamp();
    }

    frame __eq__(this: *DateTime, other: *DateTime) ret bool {
        return this.equals(other);
    }

    frame __ne__(this: *DateTime, other: *DateTime) ret bool {
        return !this.equals(other);
    }

    frame __lt__(this: *DateTime, other: *DateTime) ret bool {
        return this.compare(other) < 0;
    }

    frame __le__(this: *DateTime, other: *DateTime) ret bool {
        return this.compare(other) <= 0;
    }

    frame __gt__(this: *DateTime, other: *DateTime) ret bool {
        return this.compare(other) > 0;
    }

    frame __ge__(this: *DateTime, other: *DateTime) ret bool {
        return this.compare(other) >= 0;
    }

    /#
        Formats with strftime-style directives: %Y year, %y two-digit year,
        %m month, %d day, %e space-padded day, %H hour, %I 12-hour hour, %p
        AM/PM, %M minute, %S second, %j day of year, %a/%A weekday name,
        %b/%B month name, %u ISO weekday (1-7), %w weekday (0-6, Sunday 0),
        %V ISO week, %G ISO week-year, %s Unix seconds, %F = %Y-%m-%d, %T =
        %H:%M:%S, %z +0000, %Z UTC and %% a percent sign. Other text is
        copied. Returns a new String the caller destroys.
    #/
    frame formatPattern(this: *DateTime, pattern: string) ret String {
        local out: StringBuilder = StringBuilder.new(32);
        local date: Date = this.toDate();
        local n: long = 0;
        if (pattern != nullptr) {
            n = strlen(pattern);
        }
        local i: long = 0;
        loop (i < n) {
            local c: char = pattern[i];
            if ((c != '%') || ((i + 1) >= n)) {
                out.appendChar(c);
                i = i + 1;
                continue;
            }
            local d: char = pattern[i + 1];
            i = i + 2;
            if (d == 'Y') {
                datePad(&out, cast<long>(this.year), 4, '0');
            } else if (d == 'y') {
                local short: int = this.year % 100;
                if (short < 0) {
                    short = short + 100;
                }
                datePad(&out, cast<long>(short), 2, '0');
            } else if (d == 'm') {
                datePad(&out, cast<long>(this.month), 2, '0');
            } else if (d == 'd') {
                datePad(&out, cast<long>(this.day), 2, '0');
            } else if (d == 'e') {
                datePad(&out, cast<long>(this.day), 2, ' ');
            } else if (d == 'H') {
                datePad(&out, cast<long>(this.hour), 2, '0');
            } else if (d == 'I') {
                local twelve: int = this.hour % 12;
                if (twelve == 0) {
                    twelve = 12;
                }
                datePad(&out, cast<long>(twelve), 2, '0');
            } else if (d == 'p') {
                if (this.hour < 12) {
                    out.append("AM");
                } else {
                    out.append("PM");
                }
            } else if (d == 'M') {
                datePad(&out, cast<long>(this.minute), 2, '0');
            } else if (d == 'S') {
                datePad(&out, cast<long>(this.second), 2, '0');
            } else if (d == 'j') {
                datePad(&out, cast<long>(date.dayOfYear()), 3, '0');
            } else if (d == 'a') {
                dateAppendName(&out, date.weekdayName(), 3);
            } else if (d == 'A') {
                dateAppendName(&out, date.weekdayName(), -1);
            } else if (d == 'b') {
                dateAppendName(&out, date.monthName(), 3);
            } else if (d == 'B') {
                dateAppendName(&out, date.monthName(), -1);
            } else if (d == 'u') {
                datePad(&out, cast<long>(date.isoWeekday()), 1, '0');
            } else if (d == 'w') {
                datePad(&out, cast<long>(date.dayOfWeek()), 1, '0');
            } else if (d == 'V') {
                datePad(&out, cast<long>(date.weekOfYear()), 2, '0');
            } else if (d == 'G') {
                datePad(&out, cast<long>(date.isoWeekYear()), 4, '0');
            } else if (d == 's') {
                datePad(&out, this.toTimestamp(), 1, '0');
            } else if (d == 'F') {
                datePad(&out, cast<long>(this.year), 4, '0');
                out.appendChar('-');
                datePad(&out, cast<long>(this.month), 2, '0');
                out.appendChar('-');
                datePad(&out, cast<long>(this.day), 2, '0');
            } else if (d == 'T') {
                datePad(&out, cast<long>(this.hour), 2, '0');
                out.appendChar(':');
                datePad(&out, cast<long>(this.minute), 2, '0');
                out.appendChar(':');
                datePad(&out, cast<long>(this.second), 2, '0');
            } else if (d == 'z') {
                out.append("+0000");
            } else if (d == 'Z') {
                out.append("UTC");
            } else if (d == '%') {
                out.appendChar('%');
            } else {
                out.appendChar('%');
                out.appendChar(d);
            }
        }
        local result: String;
        result.data = out.buffer;
        result.length = out.length;
        return result;
    }

    # RFC 3339 / ISO 8601 UTC timestamp ("2024-01-02T03:04:05Z").
    frame formatRfc3339(this: *DateTime) ret String {
        return this.formatPattern("%FT%TZ");
    }

    # RFC 7231 HTTP date ("Tue, 02 Jan 2024 03:04:05 GMT").
    frame formatHttp(this: *DateTime) ret String {
        return this.formatPattern("%a, %d %b %Y %T GMT");
    }

    frame clone(this: *DateTime) ret DateTime {
        return DateTime.new(this.year, this.month, this.day, this.hour, this.minute, this.second);
    }
}

# Private helper: secondsPerUnit is a positive constant supplied by DateTime.
frame addDateTimeUnits(value: *DateTime, amount: long, secondsPerUnit: long) ret DateTime {
    local timestamp: long = value.toTimestamp();
    local first: DateTime = DateTime.new(cast<int>(0x80000000), 1, 1, 0, 0, 0);
    local last: DateTime = DateTime.new(2147483647, 12, 31, 23, 59, 59);
    # Both differences fit long. Truncation rounds the nonpositive lower bound
    # up and the nonnegative upper bound down, so these are inclusive limits.
    local minimum: long = (first.toTimestamp() - timestamp) / secondsPerUnit;
    local maximum: long = (last.toTimestamp() - timestamp) / secondsPerUnit;
    if ((amount < minimum) || (amount > maximum)) {
        throw "DateTime arithmetic: result is outside the int year range";
    }
    # The checked offset and resulting timestamp are now both safe in long.
    return DateTime.fromTimestamp(timestamp + (amount * secondsPerUnit));
}
