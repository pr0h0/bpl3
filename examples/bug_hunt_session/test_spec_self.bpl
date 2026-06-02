# Bug Hunt: Spec implementing itself
import [printf] from "std/c.bpl";

spec SelfSpec: SelfSpec {
    frame method(this: *SelfSpec);
}

frame main() {
    printf("Test\n");
}
