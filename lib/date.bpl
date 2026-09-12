# Date and DateTime utilities

export [Date];
export [DateTime];

extern time(ptr: *long) ret long;
extern gettimeofday(tv: *void, tz: *void) ret int;
extern malloc(size: long) ret *void;
extern snprintf(str: string, capacity: ulong, format: string, ...) ret int;

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
        if (timestamp % cast<long>(86400) < 0) {
            days = days - 1;
        }
        local shifted: long = days + 719468;
        local era: long = shifted / 146097;
        if (shifted % 146097 < 0) {
            era = era - 1;
        }
        local dayOfEra: long = shifted - era * 146097;
        local yearOfEra: long = (dayOfEra - dayOfEra / 1460 + dayOfEra / 36524 - dayOfEra / 146096) / 365;
        local year: long = yearOfEra + era * 400;
        local dayOfYear: long = dayOfEra - (yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100);
        local marchMonth: long = (cast<long>(5) * dayOfYear + 2) / 153;
        local day: int = cast<int>(dayOfYear - (cast<long>(153) * marchMonth + 2) / 5 + 1);
        local month: int = cast<int>(marchMonth) + 3;
        if (marchMonth >= 10) {
            month = month - 12;
            year = year + 1;
        }
        if (year < -2147483648 || year > 2147483647) {
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
        if (year % 400 < 0) {
            era = era - 1;
        }
        local yearOfEra: long = year - era * 400;
        local dayOfYear: long = (cast<long>(153) * marchMonth + 2) / 5 + cast<long>(this.day) - 1;
        local dayOfEra: long = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
        return (era * 146097 + dayOfEra - 719468) * cast<long>(86400);
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
        if (!this.isValid()) { throw "Date.dayOfYear: invalid date"; }
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
        if (dow < 0) { dow = dow + 7; }
        return dow;
    }

    # ISO week number (1-53); early January / late December may belong
    # to the adjacent ISO week-year rather than this calendar year.
    frame weekOfYear(this: *Date) ret int {
        local doy: int = this.dayOfYear();
        local dow: int = this.dayOfWeek();
        local januaryFirst: int = (dow - (doy - 1) % 7 + 7) % 7;
        if (dow == 0) { dow = 7; }
        local week: int = (doy - dow + 10) / 7;
        if (week < 1) {
            # Widen before subtraction so the minimum int year is supported.
            local previousYear: long = cast<long>(this.year) - 1;
            local previousLeap: bool = previousYear % 4 == 0 && (previousYear % 100 != 0 || previousYear % 400 == 0);
            if (januaryFirst == 5 || (januaryFirst == 6 && previousLeap)) {
                return 53;
            }
            return 52;
        }
        if (week == 53 && januaryFirst != 4 && !(januaryFirst == 3 && this.isLeapYear())) {
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
        return this.addDays(-days);
    }

    # Add months (adjusts day if needed)
    frame addMonths(this: *Date, months: int) ret Date {
        local totalMonths: int = (((this.year * 12) + this.month) - 1) + months;
        local newYear: int = totalMonths / 12;
        local newMonth: int = (totalMonths % 12) + 1;

        local maxDay: int = Date.daysInMonthStatic(newYear, newMonth);
        local newDay: int = this.day;
        if (newDay > maxDay) {
            newDay = maxDay;
        }
        return Date.new(newYear, newMonth, newDay);
    }

    # Add years
    frame addYears(this: *Date, years: int) ret Date {
        local newYear: int = this.year + years;
        local maxDay: int = Date.daysInMonthStatic(newYear, this.month);
        local newDay: int = this.day;
        if (newDay > maxDay) {
            newDay = maxDay;
        }
        return Date.new(newYear, this.month, newDay);
    }

    # Calculate difference in days between two dates
    frame diffDays(this: *Date, other: *Date) ret int {
        local ts1: long = this.toTimestamp();
        local ts2: long = other.toTimestamp();
        return cast<int>((ts1 - ts2) / cast<long>(86400));
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
    frame format(this: *Date) ret string {
        # Three signed int fields (at most 11 bytes each), separators, and NUL.
        local buf: string = cast<string>(malloc(cast<long>(36)));
        if (buf == nullptr) { throw "Date formatting: allocation failed"; }
        snprintf(buf, cast<ulong>(36), "%04d-%02d-%02d", this.year, this.month, this.day);
        return buf;
    }

    # Format date with custom separator
    frame formatSep(this: *Date, sep: u8) ret string {
        # Three signed int fields (at most 11 bytes each), separators, and NUL.
        local buf: string = cast<string>(malloc(cast<long>(36)));
        if (buf == nullptr) { throw "Date formatting: allocation failed"; }
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
        local ts: long = this.toTimestamp() + seconds;
        return DateTime.fromTimestamp(ts);
    }

    # Add minutes
    frame addMinutes(this: *DateTime, minutes: long) ret DateTime {
        return this.addSeconds(minutes * cast<long>(60));
    }

    # Add hours
    frame addHours(this: *DateTime, hours: long) ret DateTime {
        return this.addSeconds(hours * cast<long>(3600));
    }

    # Add days
    frame addDays(this: *DateTime, days: long) ret DateTime {
        return this.addSeconds(days * cast<long>(86400));
    }

    # Calculate difference in seconds
    frame diffSeconds(this: *DateTime, other: *DateTime) ret long {
        return this.toTimestamp() - other.toTimestamp();
    }

    # Format as ISO 8601 string (YYYY-MM-DD HH:MM:SS)
    frame format(this: *DateTime) ret string {
        # Six signed int fields, five separators, and NUL fit in 72 bytes.
        local buf: string = cast<string>(malloc(cast<long>(72)));
        if (buf == nullptr) { throw "DateTime formatting: allocation failed"; }
        snprintf(buf, cast<ulong>(72), "%04d-%02d-%02d %02d:%02d:%02d", this.year, this.month, this.day, this.hour, this.minute, this.second);
        return buf;
    }

    # Format as ISO 8601 with T separator
    frame formatISO(this: *DateTime) ret string {
        # Six signed int fields, five separators, and NUL fit in 72 bytes.
        local buf: string = cast<string>(malloc(cast<long>(72)));
        if (buf == nullptr) { throw "DateTime formatting: allocation failed"; }
        snprintf(buf, cast<ulong>(72), "%04d-%02d-%02dT%02d:%02d:%02d", this.year, this.month, this.day, this.hour, this.minute, this.second);
        return buf;
    }

    # Format time only (HH:MM:SS)
    frame formatTime(this: *DateTime) ret string {
        # Three signed int fields (at most 11 bytes each), separators, and NUL.
        local buf: string = cast<string>(malloc(cast<long>(36)));
        if (buf == nullptr) { throw "Date formatting: allocation failed"; }
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

    frame clone(this: *DateTime) ret DateTime {
        return DateTime.new(this.year, this.month, this.day, this.hour, this.minute, this.second);
    }
}
