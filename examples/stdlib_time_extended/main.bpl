# Extended Time Library Test

import [Time], [Duration], [Stopwatch] from "std/std.bpl";

import [printf] from "std/c.bpl";

frame main() ret int {
    printf("=== Extended Time Library Test ===\n\n");

    # Test basic time functions
    printf("--- Basic Time Functions ---\n");
    local timestamp: int = Time.now();
    printf("Current timestamp (seconds): %d\n", timestamp);

    local timestampMs: long = Time.nowMs();
    printf("Current timestamp (milliseconds): %ld\n", timestampMs);

    local timestampUs: long = Time.nowUs();
    printf("Current timestamp (microseconds): %ld\n", timestampUs);

    # Test Duration
    printf("\n--- Duration Tests ---\n");
    local d1: Duration = Duration.fromMs(5000);
    printf("5000ms = %ld seconds\n", d1.toSeconds());

    local d2: Duration = Duration.fromSeconds(120);
    printf("120 seconds = %ld minutes\n", d2.toMinutes());
    printf("120 seconds = %ld ms\n", d2.toMs());

    local d3: Duration = Duration.fromHours(2);
    printf("2 hours = %ld minutes\n", d3.toMinutes());
    printf("2 hours = %ld seconds\n", d3.toSeconds());

    # Test Duration arithmetic
    printf("\n--- Duration Arithmetic ---\n");
    local d4: Duration = Duration.fromSeconds(10);
    local d5: Duration = Duration.fromSeconds(5);
    local sum: Duration = d4 + d5;
    local diff: Duration = d4 - d5;
    printf("10s + 5s = %ld seconds\n", sum.toSeconds());
    printf("10s - 5s = %ld seconds\n", diff.toSeconds());

    # Test Duration comparison
    printf("\n--- Duration Comparison ---\n");
    printf("10s == 10s: %d\n", cast<int>(d4 == d4));
    printf("10s > 5s: %d\n", cast<int>(d4 > d5));
    printf("5s < 10s: %d\n", cast<int>(d5 < d4));

    # Test Stopwatch
    printf("\n--- Stopwatch Test ---\n");
    local sw: Stopwatch = Stopwatch.new();
    sw.start();

    # Simulate some work (sleep 50ms)
    Time.sleep(50);

    local elapsed: Duration = sw.elapsed();
    printf("Elapsed after 50ms sleep: ~%ld ms\n", elapsed.toMs());

    # Sleep more
    Time.sleep(30);

    local total: Duration = sw.stop();
    printf("Total time after stop: ~%ld ms\n", total.toMs());

    # Test restart
    sw.restart();
    Time.sleep(20);
    printf("After restart and 20ms sleep: ~%ld ms\n", sw.elapsedMs());
    sw.stop();

    # Test Time.measure
    printf("\n--- Time.measure Test ---\n");
    local measuredTime: long = Time.measure(|| {
        Time.sleep(25);
    });
    printf("Measured lambda execution: ~%ld ms\n", measuredTime);

    # Test formatTimestamp
    printf("\n--- Format Timestamp Test ---\n");
    local formatted: string = Time.formatTimestamp(0);
    printf("Epoch (0): %s\n", formatted);

    local formatted2: string = Time.formatTimestamp(1704067200); # 2024-01-01 00:00:00 UTC
    printf("2024-01-01: %s\n", formatted2);

    printf("\n=== All Time Tests Completed! ===\n");
    return 0;
}
