import frameaddress, returnaddress from "std/intrinsics.bpl";
import [printf] from "std/c.bpl";

frame trace() {
    printf("Stack Trace:\n");

    # Level 0: trace()
    local ra0: *void = returnaddress(0);
    printf("  [0] RA: %p\n", ra0);

    # Level 1: main()
    # Note: returnaddress(1) might crash if frame pointers are missing or if we are at the root.
    # local ra1: *void = returnaddress(1);
    # printf("  [1] RA: %p\n", ra1);

    # We can't loop with returnaddress(i) because the argument must be constant.
    # But we can manually walk the stack if we know the layout.
    # On x86_64, RBP points to the previous RBP, and RBP+8 is the return address.

    local fp: *void = frameaddress(0);
    printf("  [0] FP: %p\n", fp);

    if (cast<long>(fp) != 0) {
        # Dereference FP to get previous FP
        # Note: This assumes standard stack frames are enabled (-fno-omit-frame-pointer equivalent)
        # BPL compiler seems to generate standard frames.

        local fp_ptr: **void = cast<**void>(fp);
        local prev_fp: *void = fp_ptr[0];

        # Sanity check: Stack grows down, so previous frame should be at higher address
        if (cast<long>(prev_fp) > cast<long>(fp)) {
            printf("  [1] FP: %p\n", prev_fp);

            local prev_fp_ptr: **void = cast<**void>(prev_fp);
            local ra_from_fp: *void = prev_fp_ptr[1]; # RBP+8
            printf("  [1] RA (from FP): %p\n", ra_from_fp);
        } else {
            printf("  [1] FP: %p (End of stack or invalid)\n", prev_fp);
        }
    }
}

frame main() {
    trace();
}
