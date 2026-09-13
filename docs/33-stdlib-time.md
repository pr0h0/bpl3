# Standard Library: Time

The `Time`, `Duration`, and `Stopwatch` structs provide time-related utilities.

## Import

```bpl
import [Time], [Duration], [Stopwatch] from "std/time.bpl";
```

## Clock and ownership limitations

`nowSeconds`, `nowMs`, and `nowUs` return signed 64-bit Unix wall-clock timestamps.
`monotonicMs` and `monotonicUs` use an unspecified system epoch: use their differences
for elapsed time. Stopwatch and `measure` use this monotonic clock. Clock access
failures throw strings. These APIs require the native Linux/macOS runtime.
`Time.now` is the legacy signed 32-bit seconds API and throws outside its range;
use `nowSeconds` for timestamps beyond 2038.

Duration stores signed 64-bit milliseconds. Factories and addition/subtraction
throw strings on overflow; conversions to larger units truncate toward zero.
Sleep accepts nonnegative long values, checks unit conversion, and retries the
remaining interval after signal interruption. Invalid values and native failures
throw strings. Scheduling can make a sleep longer than requested.

`formatTimestamp` returns an allocation that callers must free. It formats UTC
Unix seconds with the same proleptic Gregorian conversion as `DateTime`, including
negative timestamps and year zero. It throws a string when the resulting year
falls outside the signed `int` range.

## Time Static Methods

| Method                                             | Description                      |
| -------------------------------------------------- | -------------------------------- |
| `Time.now() ret int`                               | Current Unix timestamp (seconds) |
| `Time.nowSeconds() ret long` | Unix timestamp in seconds |
| `Time.monotonicMs() ret long` | Monotonic milliseconds |
| `Time.monotonicUs() ret long` | Monotonic microseconds |
| `Time.nowMs() ret long`                            | Current time in milliseconds     |
| `Time.nowUs() ret long`                            | Current time in microseconds     |
| `Time.sleep(ms: long)`                              | Sleep for milliseconds           |
| `Time.sleepUs(usec: long)`                          | Sleep for microseconds           |
| `Time.sleepSeconds(sec: long)`                      | Sleep for seconds                |
| `Time.formatTimestamp(timestamp: long) ret string` | Format as "YYYY-MM-DD HH:MM:SS"  |
| `Time.measure(action: Lambda<void>()) ret long`    | Measure execution time in ms     |

## Duration

Represents a time duration with various unit conversions.

**Creation:**

```bpl
local d1: Duration = Duration.fromMs(1500);       # 1.5 seconds
local d2: Duration = Duration.fromSeconds(60);    # 1 minute
local d3: Duration = Duration.fromMinutes(5);     # 5 minutes
local d4: Duration = Duration.fromHours(2);       # 2 hours
```

**Conversion:**

```bpl
local ms: long = d1.toMs();       # Get milliseconds
local sec: long = d1.toSeconds(); # Get seconds
local min: long = d1.toMinutes(); # Get minutes
local hrs: long = d1.toHours();   # Get hours
```

**Arithmetic:**

```bpl
local sum: Duration = d1 + d2;    # Add durations
local diff: Duration = d2 - d1;   # Subtract durations

# Comparisons
if (d1 == d2) { ... }
if (d1 < d2) { ... }
if (d1 > d2) { ... }
```

## Stopwatch

For measuring elapsed time. Both `start` and `restart` begin a new interval.
`stop` freezes the elapsed duration; repeated stops and elapsed queries return
that duration until reset or started again:

```bpl
local sw: Stopwatch = Stopwatch.new();

sw.start();
# ... do some work ...
local elapsed: Duration = sw.elapsed();
printf("Elapsed: %ld ms\n", elapsed.toMs());

sw.stop();   # Stop and get final duration
sw.reset();  # Reset to zero
sw.restart(); # Reset and start again
```

| Method                          | Description                         |
| ------------------------------- | ----------------------------------- |
| `Stopwatch.new() ret Stopwatch` | Create new stopwatch                |
| `sw.start()`                    | Start timing                        |
| `sw.stop() ret Duration`        | Stop and return elapsed time        |
| `sw.elapsed() ret Duration`     | Get elapsed time (without stopping) |
| `sw.elapsedMs() ret long`       | Get elapsed milliseconds            |
| `sw.reset()`                    | Reset to zero                       |
| `sw.restart()`                  | Reset and start                     |

## Example

```bpl
import [Time], [Duration], [Stopwatch] from "std/time.bpl";

extern printf(fmt: string, ...);
extern free(ptr: string);

frame main() {
    # Get current time
    local now: long = Time.nowSeconds();
    printf("Current timestamp: %ld\n", now);
    local formatted: string = Time.formatTimestamp(now);
    printf("Formatted: %s\n", formatted);
    free(formatted);

    # Measure execution time with stopwatch
    local sw: Stopwatch = Stopwatch.new();
    sw.start();

    # Simulate work
    local sum: int = 0;
    local i: int = 0;
    loop (i < 1000000) {
        sum = sum + i;
        i = i + 1;
    }

    local elapsed: Duration = sw.stop();
    printf("Computation took: %ld ms\n", elapsed.toMs());

    # Using Time.measure with lambda
    local time: long = Time.measure(|| {
        Time.sleep(100);  # Sleep 100ms
    });
    printf("Sleep took: %ld ms\n", time);

    # Duration arithmetic
    local d1: Duration = Duration.fromSeconds(90);
    printf("90 seconds = %ld minutes\n", d1.toMinutes());

    local d2: Duration = Duration.fromMinutes(2);
    local total: Duration = d1 + d2;
    printf("90s + 2min = %ld seconds\n", total.toSeconds());
}
```

## Sleep Example

```bpl
import [Time] from "std/time.bpl";

extern printf(fmt: string, ...);

frame main() {
    printf("Starting...\n");

    local i: int = 0;
    loop (i < 5) {
        printf("Tick %d\n", i);
        Time.sleep(1000);  # Wait 1 second
        i = i + 1;
    }

    printf("Done!\n");
}
```
