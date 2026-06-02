global const GLOBAL_CONST: int = 100;
global var_global: int = 200;

import [printf] from "std/c.bpl";
extern exit(code: int);

frame main() {
    local const LOCAL_CONST: int = 10;
    local var_local: int = 20;

    # Read constants
    if (GLOBAL_CONST != 100) {
        printf("GLOBAL_CONST mismatch\n");
        exit(1);
    }
    if (LOCAL_CONST != 10) {
        printf("LOCAL_CONST mismatch\n");
        exit(1);
    }
    # Assignments (should fail compilation if uncommented)
    GLOBAL_CONST = 101;
    LOCAL_CONST = 11;

    printf("Const test passed\n");
}
