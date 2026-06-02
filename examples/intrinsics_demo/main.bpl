import fma, frameaddress, returnaddress, stacksave, stackrestore from "std/intrinsics.bpl";
import [printf] from "std/c.bpl";

frame main() {
    printf("--- Intrinsics Demo ---\n");

    # 1. FMA (Fused Multiply-Add)
    # Computes (a * b) + c with only one rounding error.
    local a: float = 2.0;
    local b: float = 3.0;
    local c: float = 4.0;
    local result: float = fma(a, b, c);
    printf("fma(%f, %f, %f) = %f\n", a, b, c, result);

    # 2. Frame Address
    # Getting the current frame address (level 0)
    local fa: *void = frameaddress(0);
    if (cast<long>(fa) != 0) {
        printf("Current frame address is non-null\n");
    }
    # 3. Return Address
    # Getting the return address of the current function
    local ra: *void = returnaddress(0);
    if (cast<long>(ra) != 0) {
        printf("Return address is non-null\n");
    }
    # 4. Stack Save/Restore
    # This is useful for dynamic stack allocation (like alloca), though BPL doesn't expose alloca directly yet.
    # We can simulate a safe save/restore point.

    local sp_before: *void = stacksave();
    if (cast<long>(sp_before) != 0) {
        printf("Stack pointer saved\n");
    }
    # ... do some stack operations (if we had alloca) ...

    stackrestore(sp_before);
    printf("Stack pointer restored\n");
}
