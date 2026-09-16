extern printf(format: string, ...) ret int;

frame main() ret int {
    local changed: int = 0;
    local pointer: *int = &changed;
    try {
        defer { *pointer += 1; }
        changed = 41;
        throw 7;
    } catch (error: int) {
        printf("Caught %d; local value: %d\n", error, changed);
    }
    if (changed != 42) { return 1; }
    return 0;
}
