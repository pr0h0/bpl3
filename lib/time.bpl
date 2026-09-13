# Time

import [DateTime] from "std/date.bpl";

export [Time];
export [Duration];
export [Stopwatch];

extern __bpl_clock(monotonic: int, units: int, result: *long) ret int;
extern __bpl_sleep_us(microseconds: long) ret int;

struct Duration {
    milliseconds: long,

    frame fromMs(ms: long) ret Duration {
        local d: Duration;
        d.milliseconds = ms;
        return d;
    }

    frame fromSeconds(sec: long) ret Duration {
        local d: Duration;
        d.milliseconds = checkedTimeScale(sec, 1000);
        return d;
    }

    frame fromMinutes(min: long) ret Duration {
        local d: Duration;
        d.milliseconds = checkedTimeScale(min, 60000);
        return d;
    }

    frame fromHours(hours: long) ret Duration {
        local d: Duration;
        d.milliseconds = checkedTimeScale(hours, 3600000);
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
        local maximum: long = cast<long>(0x7fffffffffffffff);
        local minimum: long = cast<long>(0x8000000000000000);
        if ((other.milliseconds > 0 && this.milliseconds > maximum - other.milliseconds) ||
            (other.milliseconds < 0 && this.milliseconds < minimum - other.milliseconds)) {
            throw "Duration overflow";
        }
        return Duration.fromMs(this.milliseconds + other.milliseconds);
    }

    frame __sub__(this: *Duration, other: Duration) ret Duration {
        local maximum: long = cast<long>(0x7fffffffffffffff);
        local minimum: long = cast<long>(0x8000000000000000);
        if ((other.milliseconds < 0 && this.milliseconds > maximum + other.milliseconds) ||
            (other.milliseconds > 0 && this.milliseconds < minimum + other.milliseconds)) {
            throw "Duration overflow";
        }
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
    elapsedTime: long,

    frame new() ret Stopwatch {
        local sw: Stopwatch;
        sw.startTime = 0;
        sw.running = false;
        sw.elapsedTime = 0;
        return sw;
    }

    frame start(this: *Stopwatch) {
        this.startTime = Time.monotonicMs();
        this.elapsedTime = 0;
        this.running = true;
    }

    frame elapsed(this: *Stopwatch) ret Duration {
        if (!this.running) {
            return Duration.fromMs(this.elapsedTime);
        }
        local now: long = Time.monotonicMs();
        return Duration.fromMs(now - this.startTime);
    }

    frame elapsedMs(this: *Stopwatch) ret long {
        return this.elapsed().toMs();
    }

    frame stop(this: *Stopwatch) ret Duration {
        local d: Duration = this.elapsed();
        this.running = false;
        this.elapsedTime = d.milliseconds;
        return d;
    }

    frame reset(this: *Stopwatch) {
        this.startTime = 0;
        this.elapsedTime = 0;
        this.running = false;
    }

    frame restart(this: *Stopwatch) {
        this.startTime = Time.monotonicMs();
        this.elapsedTime = 0;
        this.running = true;
    }
}

struct Time {
    # Legacy int timestamp. Throws rather than wrapping outside the int range.
    frame now() ret int {
        local seconds: long = Time.nowSeconds();
        if (seconds < cast<long>(-2147483648) || seconds > cast<long>(2147483647)) {
            throw "Time.now exceeds int range; use Time.nowSeconds";
        }
        return cast<int>(seconds);
    }

    frame nowSeconds() ret long { return readClock(0, 1); }
    frame nowMs() ret long { return readClock(0, 1000); }
    frame nowUs() ret long { return readClock(0, 1000000); }

    # Unspecified epoch, suitable only for differences within this system.
    frame monotonicMs() ret long { return readClock(1, 1000); }
    frame monotonicUs() ret long { return readClock(1, 1000000); }

    frame sleep(ms: long) { Time.sleepUs(checkedTimeScale(ms, 1000)); }

    frame sleepUs(usec: long) {
        if (__bpl_sleep_us(usec) != 0) { throw "Cannot sleep for requested duration"; }
    }

    frame sleepSeconds(sec: long) { Time.sleepUs(checkedTimeScale(sec, 1000000)); }

    # Format UTC Unix seconds using the proleptic Gregorian calendar.
    # The caller owns the returned string; out-of-range years throw a string.
    frame formatTimestamp(timestamp: long) ret string {
        local dt: DateTime = DateTime.fromTimestamp(timestamp);
        return dt.format();
    }

    # Measure execution time of a function (returns milliseconds)
    frame measure(action: Lambda<void>()) ret long {
        local start: long = Time.monotonicMs();
        action();
        return Time.monotonicMs() - start;
    }
}

frame checkedTimeScale(value: long, scale: long) ret long {
    local maximum: long = cast<long>(0x7fffffffffffffff);
    local minimum: long = cast<long>(0x8000000000000000);
    if (value > maximum / scale || value < minimum / scale) { throw "Duration overflow"; }
    return value * scale;
}

frame readClock(monotonic: int, units: int) ret long {
    local result: long = 0;
    if (__bpl_clock(monotonic, units, &result) != 0) { throw "Cannot read clock"; }
    return result;
}
