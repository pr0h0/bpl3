import [Log] from "std/log.bpl";

frame main() ret int {
    Log.info("=== Log Demo ===");
    Log.debug("debug message");
    Log.warn("warn message");
    Log.error("error message");
    return 0;
}
