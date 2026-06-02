# Bug Hunt: Double comma in function call
import [printf] from "std/c.bpl";

frame test_call() {
    printf("test",, );
}

frame main() {
    printf("Parser test\n");
}
