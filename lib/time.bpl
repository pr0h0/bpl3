# Time

export [Time];
export [Duration];
export [Stopwatch];

extern time(ptr: *long) ret long;
extern usleep(usec: int) ret int;
extern gettimeofday(tv: *void, tz: *void) ret int;

extern malloc(size: long) ret *void;
extern sprintf(str: string, format: string, ...) ret int;

# Timeval struct for gettimeofday
struct Timeval {
    tv_sec: long,
    tv_usec: long,
}

struct Duration {
    milliseconds: long,

    frame fromMs(ms: long) ret Duration {
        local d: Duration;
        d.milliseconds = ms;
        return d;
    }

    frame fromSeconds(sec: long) ret Duration {
        local d: Duration;
        d.milliseconds = sec * cast<long>(1000);
        return d;
    }

    frame fromMinutes(min: long) ret Duration {
        local d: Duration;
        d.milliseconds = min * cast<long>(60) * cast<long>(1000);
        return d;
    }

    frame fromHours(hours: long) ret Duration {
        local d: Duration;
        d.milliseconds = hours * cast<long>(60) * cast<long>(60) * cast<long>(1000);
        return d;
    }

    frame toMs(this: *Duration) ret long {
        return this.milliseconds;
    }

    frame toSeconds(this: *Duration) ret long {
        return this.milliseconds / cast<long>(1000);
    }

    frame toMinutes(this: *Duration) ret long {
        return this.milliseconds / (cast<long>(60) * cast<long>(1000));
    }

    frame toHours(this: *Duration) ret long {
        return this.milliseconds / (cast<long>(60) * cast<long>(60) * cast<long>(1000));
    }

    frame __add__(this: *Duration, other: Duration) ret Duration {
        return Duration.fromMs(this.milliseconds + other.milliseconds);
    }

    frame __sub__(this: *Duration, other: Duration) ret Duration {
        return Duration.fromMs(this.milliseconds - other.milliseconds);
    }

    frame __eq__(this: *Duration, other: *Duration) ret bool {
        return this.milliseconds == other.milliseconds;
    }

    frame __lt__(this: *Duration, other: *Duration) ret bool {
        return this.milliseconds < other.milliseconds;
    }

    frame __gt__(this: *Duration, other: *Duration) ret bool {
        return this.milliseconds > other.milliseconds;
    }

    frame __le__(this: *Duration, other: *Duration) ret bool {
        return this.milliseconds <= other.milliseconds;
    }

    frame __ge__(this: *Duration, other: *Duration) ret bool {
        return this.milliseconds >= other.milliseconds;
    }
}

struct Stopwatch {
    startTime: long,
    running: bool,

    frame new() ret Stopwatch {
        local sw: Stopwatch;
        sw.startTime = 0;
        sw.running = false;
        return sw;
    }

    frame start(this: *Stopwatch) {
        this.startTime = Time.nowMs();
        this.running = true;
    }

    frame elapsed(this: *Stopwatch) ret Duration {
        if (!this.running) {
            return Duration.fromMs(0);
        }
        local now: long = Time.nowMs();
        return Duration.fromMs(now - this.startTime);
    }

    frame elapsedMs(this: *Stopwatch) ret long {
        return this.elapsed().toMs();
    }

    frame stop(this: *Stopwatch) ret Duration {
        local d: Duration = this.elapsed();
        this.running = false;
        return d;
    }

    frame reset(this: *Stopwatch) {
        this.startTime = 0;
        this.running = false;
    }

    frame restart(this: *Stopwatch) {
        this.startTime = Time.nowMs();
        this.running = true;
    }
}

struct Time {
    frame now() ret int {
        local t: long = 0;
        return cast<int>(time(&t));
    }

    frame nowMs() ret long {
        local tv: Timeval;
        gettimeofday(cast<*void>(&tv), nullptr);
        return (tv.tv_sec * 1000) + (tv.tv_usec / 1000);
    }

    frame nowUs() ret long {
        local tv: Timeval;
        gettimeofday(cast<*void>(&tv), nullptr);
        return (tv.tv_sec * 1000000) + tv.tv_usec;
    }

    frame sleep(ms: int) {
        local usec: int = ms * 1000;
        usleep(usec);
    }

    frame sleepUs(usec: int) {
        usleep(usec);
    }

    frame sleepSeconds(sec: int) {
        local usec: int = sec * 1000000;
        usleep(usec);
    }

    # Format timestamp as simple string (YYYY-MM-DD HH:MM:SS approximation)
    # Note: This is a simplified version, not handling timezones
    frame formatTimestamp(timestamp: long) ret string {
        local buf: string = cast<string>(malloc(32));

        # Unix timestamp to approximate date (simplified, assumes UTC)
        local days: long = timestamp / 86400;
        local remaining: long = timestamp % 86400;

        local hours: int = cast<int>(remaining / 3600);
        remaining = remaining % 3600;
        local minutes: int = cast<int>(remaining / 60);
        local seconds: int = cast<int>(remaining % 60);

        # Approximate year/month/day (simplified calculation)
        local year: int = 1970;
        local daysLeft: long = days;

        loop (daysLeft >= 365) {
            local daysInYear: int = 365;
            if (((year % 4) == 0) && (((year % 100) != 0) || ((year % 400) == 0))) {
                daysInYear = 366;
            }
            if (daysLeft < cast<long>(daysInYear)) 
                break;
            daysLeft = daysLeft - cast<long>(daysInYear);
            year = year + 1;
        }

        local month: int = 1;
        local daysInMonth: int[12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

        # Check leap year for February
        if (((year % 4) == 0) && (((year % 100) != 0) || ((year % 400) == 0))) {
            daysInMonth[1] = 29;
        }
        loop (month <= 12) {
            if (daysLeft < cast<long>(daysInMonth[month - 1])) 
                break;
            daysLeft = daysLeft - cast<long>(daysInMonth[month - 1]);
            month = month + 1;
        }

        local day: int = cast<int>(daysLeft) + 1;

        sprintf(buf, "%04d-%02d-%02d %02d:%02d:%02d", year, month, day, hours, minutes, seconds);
        return buf;
    }

    # Measure execution time of a function (returns milliseconds)
    frame measure(action: Lambda<void>()) ret long {
        local start: long = Time.nowMs();
        action();
        return Time.nowMs() - start;
    }
}
