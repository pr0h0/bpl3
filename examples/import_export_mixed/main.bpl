import [Point], {ORIGIN_X} from "./mixed_exporter.bpl";

extern exit(code: int);
import [printf] from "std/c.bpl";

frame main() {
    local p: Point = Point { x: ORIGIN_X, y: 69 };
    if (p.x != 42) {
        printf("Point struct mismatch\n");
        exit(1);
    }
    printf("Mixed import passed\n");
}
