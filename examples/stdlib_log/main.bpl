import [Log], [LogLevel] from "std/log.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    Log.info("=== Log Demo ===");
    Log.debug("debug message");
    Log.warn("warn message");
    Log.error("error message");

    Log.setPrefix(true);
    Log.setLevel(LogLevel.Warn);
    Log.info("filtered out");
    Log.warn("disk almost full");
    Log.write(LogLevel.Error, "write at a level");
    printf("debug enabled: %d, error enabled: %d\n", Log.enabled(LogLevel.Debug), Log.enabled(LogLevel.Error));

    # The test sets BPL_LOG_LEVEL=info.
    printf("from env: %d\n", Log.levelFromEnv());
    Log.debug("still filtered");
    Log.info("info is back");

    Log.setLevel(LogLevel.Off);
    Log.error("silent");
    printf("off enabled: %d\n", Log.enabled(LogLevel.Off));
    return 0;
}
