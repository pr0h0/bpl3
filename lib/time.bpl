# Time

import [DateTime] from "std/date.bpl";

export [Time];
export [Duration];
export [Stopwatch];

extern __bpl_clock(monotonic: int, units: int, result: *long) ret int;
extern __bpl_sleep_us(microseconds: long) ret int;
extern malloc(size: long) ret *void;
extern snprintf(dst: string, size: long, format: string, ...) ret int;

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

    /#
    The duration as text in the style of Go's `time.Duration`: `0s`, `450ms`
    under a second, otherwise seconds with any fraction (`1.5s`) preceded by
    minutes and hours once they are non-zero (`2m3s`, `1h0m0s`,
    `25h1m1.25s`), and a leading `-` when negative. Returns a newly
    allocated string (caller must free), or nullptr if allocation fails.
    #/
    frame format(this: *Duration) ret string {
        # "-2562047788015h12m55.808s" is the longest result.
        local output: string = cast<string>(malloc(40));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        local sign: string = "";
        local magnitude: ulong = cast<ulong>(this.milliseconds);
        if (this.milliseconds < 0) {
            sign = "-";
            magnitude = cast<ulong>(0) - magnitude;
        }
        if (magnitude == cast<ulong>(0)) {
            snprintf(output, 40, "0s");
            return output;
        }
        if (magnitude < cast<ulong>(1000)) {
            snprintf(output, 40, "%s%lums", sign, magnitude);
            return output;
        }
        local hours: ulong = magnitude / cast<ulong>(3600000);
        local minutes: ulong = (magnitude / cast<ulong>(60000)) % cast<ulong>(60);
        local seconds: ulong = (magnitude / cast<ulong>(1000)) % cast<ulong>(60);
        local millis: ulong = magnitude % cast<ulong>(1000);
        # The fraction keeps only significant digits: .5, .25, .125.
        local fraction: char[8];
        fraction[0] = cast<char>(0);
        if (millis != cast<ulong>(0)) {
            local digits: ulong = millis;
            local width: int = 3;
            loop ((digits % cast<ulong>(10)) == cast<ulong>(0)) {
                digits = digits / cast<ulong>(10);
                width = width - 1;
            }
            snprintf(cast<string>(&fraction[0]), 8, ".%0*lu", width, digits);
        }
        if (hours > cast<ulong>(0)) {
            snprintf(output, 40, "%s%luh%lum%lu%ss", sign, hours, minutes, seconds, cast<string>(&fraction[0]));
        } else if (minutes > cast<ulong>(0)) {
            snprintf(output, 40, "%s%lum%lu%ss", sign, minutes, seconds, cast<string>(&fraction[0]));
        } else {
            snprintf(output, 40, "%s%lu%ss", sign, seconds, cast<string>(&fraction[0]));
        }
        return output;
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
        if (((other.milliseconds > 0) && (this.milliseconds > (maximum - other.milliseconds))) || ((other.milliseconds < 0) && (this.milliseconds < (minimum - other.milliseconds)))) {
            throw "Duration overflow";
        }
        return Duration.fromMs(this.milliseconds + other.milliseconds);
    }

    frame __sub__(this: *Duration, other: Duration) ret Duration {
        local maximum: long = cast<long>(0x7fffffffffffffff);
        local minimum: long = cast<long>(0x8000000000000000);
        if (((other.milliseconds < 0) && (this.milliseconds > (maximum + other.milliseconds))) || ((other.milliseconds > 0) && (this.milliseconds < (minimum + other.milliseconds)))) {
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
        if ((seconds < cast<long>(-2147483648)) || (seconds > cast<long>(2147483647))) {
            throw "Time.now exceeds int range; use Time.nowSeconds";
        }
        return cast<int>(seconds);
    }

    frame nowSeconds() ret long {
        return readClock(0, 1);
    }
    frame nowMs() ret long {
        return readClock(0, 1000);
    }
    frame nowUs() ret long {
        return readClock(0, 1000000);
    }

    # Unspecified epoch, suitable only for differences within this system.
    frame monotonicMs() ret long {
        return readClock(1, 1000);
    }
    frame monotonicUs() ret long {
        return readClock(1, 1000000);
    }

    frame sleep(ms: long) {
        Time.sleepUs(checkedTimeScale(ms, 1000));
    }

    frame sleepUs(usec: long) {
        if (__bpl_sleep_us(usec) != 0) {
            throw "Cannot sleep for requested duration";
        }
    }

    frame sleepSeconds(sec: long) {
        Time.sleepUs(checkedTimeScale(sec, 1000000));
    }

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
    if ((value > (maximum / scale)) || (value < (minimum / scale))) {
        throw "Duration overflow";
    }
    return value * scale;
}

frame readClock(monotonic: int, units: int) ret long {
    local result: long = 0;
    if (__bpl_clock(monotonic, units, &result) != 0) {
        throw "Cannot read clock";
    }
    return result;
}
