import [printf] from "std/c.bpl";

frame main() ret int {
    local res: int = 0;

    # Using x86 assembly via LLVM inline asm
    # The syntax is: asm("flavor") { ... }
    # Where flavor can be "intel" or "att" (default)
    # But wait, LLVM IR uses "call void asm" syntax.
    # The current BPL asm block just injects the content directly into the IR stream.
    # So if we want to write x86, we need to wrap it in LLVM's inline asm call.

    # Example of what we want to achieve:
    # asm("intel") {
    #   "mov rax, 42"
    #   "mov %0, rax"
    #   : "=r"(res)
    # }

    # But currently BPL only supports raw injection.
    # So we have to write the LLVM IR wrapper ourselves inside the asm block.

    asm {
        %res_val = call i64 asm sideeffect "movq $$42, %rax; movq %rax, $0", "=r,~{rax},~{dirflag},~{fpsr},~{flags}"()
        store i64 %res_val, i64* (res)
    }

    printf("Result: %d\n", res);
    return 0;
}
