# Standard Library: Time

The `Time`, `Duration`, and `Stopwatch` structs provide time-related utilities.

## Import

```bpl
import [Time], [Duration], [Stopwatch] from "std/time.bpl";
```

## Time Static Methods

| Method                                             | Description                      |
| -------------------------------------------------- | -------------------------------- |
| `Time.now() ret int`                               | Current Unix timestamp (seconds) |
| `Time.nowMs() ret long`                            | Current time in milliseconds     |
| `Time.nowUs() ret long`                            | Current time in microseconds     |
| `Time.sleep(ms: int)`                              | Sleep for milliseconds           |
| `Time.sleepUs(usec: int)`                          | Sleep for microseconds           |
| `Time.sleepSeconds(sec: int)`                      | Sleep for seconds                |
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

For measuring elapsed time:

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

frame main() {
    # Get current time
    local now: int = Time.now();
    printf("Current timestamp: %d\n", now);
    printf("Formatted: %s\n", Time.formatTimestamp(cast<long>(now)));

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
