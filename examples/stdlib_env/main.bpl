# Environment Variables Test Example

import [Env] from "std/std.bpl";

import [printf] from "std/c.bpl";

frame main() ret int {
    printf("=== Environment Variables Test ===\n\n");

    # Set test environment variables
    printf("--- Set Variables ---\n");
    local setResult: bool = Env.set("BPL_TEST_VAR", "hello_world");
    printf("Set BPL_TEST_VAR=hello_world: %d\n", cast<int>(setResult));

    Env.set("BPL_TEST_INT", "42");
    printf("Set BPL_TEST_INT=42\n");

    Env.set("BPL_TEST_BOOL_TRUE", "true");
    Env.set("BPL_TEST_BOOL_FALSE", "false");
    Env.set("BPL_TEST_BOOL_ONE", "1");
    Env.set("BPL_TEST_BOOL_ZERO", "0");
    printf("Set BPL_TEST_BOOL_* variables\n");

    # Get variables
    printf("\n--- Get Variables ---\n");
    local val: *char = Env.get("BPL_TEST_VAR");
    if (val != nullptr) {
        printf("BPL_TEST_VAR = %s\n", val);
    } else {
        printf("BPL_TEST_VAR not found\n");
    }

    local intVal: *char = Env.get("BPL_TEST_INT");
    if (intVal != nullptr) {
        printf("BPL_TEST_INT = %s\n", intVal);
    }
    # Get with default
    printf("\n--- Get With Default ---\n");
    local existing: *char = Env.getOr("BPL_TEST_VAR", "default");
    printf("getOr(BPL_TEST_VAR, default) = %s\n", existing);

    local nonExisting: *char = Env.getOr("BPL_NONEXISTENT_VAR", "my_default");
    printf("getOr(BPL_NONEXISTENT_VAR, default) = %s\n", nonExisting);

    # Has checks
    printf("\n--- Has Checks ---\n");
    printf("has(BPL_TEST_VAR): %d\n", cast<int>(Env.has("BPL_TEST_VAR")));
    printf("has(BPL_NONEXISTENT): %d\n", cast<int>(Env.has("BPL_NONEXISTENT")));

    # Integer parsing
    printf("\n--- Integer Parsing ---\n");
    local parsedInt: int = Env.getInt("BPL_TEST_INT", -1);
    printf("getInt(BPL_TEST_INT, -1) = %d\n", parsedInt);

    local defaultInt: int = Env.getInt("BPL_NONEXISTENT", 999);
    printf("getInt(BPL_NONEXISTENT, 999) = %d\n", defaultInt);

    # Boolean parsing
    printf("\n--- Boolean Parsing ---\n");
    local boolTrue: bool = Env.getBool("BPL_TEST_BOOL_TRUE", false);
    printf("getBool(BPL_TEST_BOOL_TRUE): %d\n", cast<int>(boolTrue));

    local boolFalse: bool = Env.getBool("BPL_TEST_BOOL_FALSE", true);
    printf("getBool(BPL_TEST_BOOL_FALSE): %d\n", cast<int>(boolFalse));

    local boolOne: bool = Env.getBool("BPL_TEST_BOOL_ONE", false);
    printf("getBool(BPL_TEST_BOOL_ONE): %d\n", cast<int>(boolOne));

    local boolZero: bool = Env.getBool("BPL_TEST_BOOL_ZERO", true);
    printf("getBool(BPL_TEST_BOOL_ZERO): %d\n", cast<int>(boolZero));

    local boolDefault: bool = Env.getBool("BPL_NONEXISTENT", true);
    printf("getBool(BPL_NONEXISTENT, true): %d\n", cast<int>(boolDefault));

    # Set if absent
    printf("\n--- Set If Absent ---\n");
    local setNew: bool = Env.setIfAbsent("BPL_NEW_VAR", "new_value");
    printf("setIfAbsent(BPL_NEW_VAR): %d (set new var)\n", cast<int>(setNew));

    local setExisting: bool = Env.setIfAbsent("BPL_TEST_VAR", "other_value");
    printf("setIfAbsent(BPL_TEST_VAR): %d (already exists, no change)\n", cast<int>(setExisting));

    local newVal: *char = Env.get("BPL_NEW_VAR");
    if (newVal != nullptr) {
        printf("BPL_NEW_VAR = %s\n", newVal);
    }
    # Verify existing wasn't changed
    local unchangedVal: *char = Env.get("BPL_TEST_VAR");
    if (unchangedVal != nullptr) {
        printf("BPL_TEST_VAR unchanged = %s\n", unchangedVal);
    }
    # Unset
    printf("\n--- Unset ---\n");
    printf("has(BPL_NEW_VAR) before unset: %d\n", cast<int>(Env.has("BPL_NEW_VAR")));
    Env.unset("BPL_NEW_VAR");
    printf("has(BPL_NEW_VAR) after unset: %d\n", cast<int>(Env.has("BPL_NEW_VAR")));

    # System paths (these may vary but should not crash)
    printf("\n--- System Paths ---\n");
    local path: *char = Env.getPath();
    if (path != nullptr) {
        printf("PATH exists: 1\n");
    } else {
        printf("PATH exists: 0\n");
    }

    local home: *char = Env.getHome();
    if (home != nullptr) {
        printf("HOME exists: 1\n");
    } else {
        printf("HOME exists: 0\n");
    }

    local tmpDir: *char = Env.getTmpDir();
    printf("TmpDir = %s\n", tmpDir);

    # Cleanup test variables
    printf("\n--- Cleanup ---\n");
    Env.unset("BPL_TEST_VAR");
    Env.unset("BPL_TEST_INT");
    Env.unset("BPL_TEST_BOOL_TRUE");
    Env.unset("BPL_TEST_BOOL_FALSE");
    Env.unset("BPL_TEST_BOOL_ONE");
    Env.unset("BPL_TEST_BOOL_ZERO");
    printf("Test variables cleaned up\n");

    printf("\n=== Environment Variables Test Complete ===\n");
    return 0;
}
