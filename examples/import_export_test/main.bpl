import {EXPORTED_CONST}, {exportedVar}, getExportedConst, [Point] from "./exporter.bpl";

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
    local p: Point = Point { x: 10, y: 20 };
    if (p.x != 10) {
        printf("Point struct mismatch\n");
        exit(1);
    }
    printf("Import/Export test passed\n");
}
