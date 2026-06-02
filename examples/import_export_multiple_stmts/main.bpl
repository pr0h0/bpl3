import {exportedVar}, {EXPORTED_CONST} from "./exporter.bpl";
import getExportedConst from "./exporter.bpl";

import [printf] from "std/c.bpl";
extern exit(code: int);

frame main() {
    if (EXPORTED_CONST != 42) {
        printf("EXPORTED_CONST mismatch: %d\n", EXPORTED_CONST);
        exit(1);
    }
    if (exportedVar != 99) {
        printf("exportedVar mismatch: %d\n", exportedVar);
        exit(1);
    }
    if (getExportedConst() != 42) {
        printf("getExportedConst() mismatch\n");
        exit(1);
    }
    # Modify imported var (should be allowed if not const)
    exportedVar = 100;
    if (exportedVar != 100) {
        printf("exportedVar modification failed\n");
        exit(1);
    }
    # Modify imported const (should fail compilation)
    # EXPORTED_CONST = 43;

    printf("Import test passed\n");
}
