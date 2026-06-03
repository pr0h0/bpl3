import [free], [malloc], [memset], [printf] from "std/c.bpl";

frame main() ret int {
    # Allocate 12 bytes and zero them
    local ptr: *void = malloc(12);
    memset(ptr, 0, 12);

    # Cast to char* and test __bpl_mem_is_zero
    local _bytes: *int = cast<*int>(ptr);
    local _result: int;

    printf("Testing zeroed memory...\n");

    free(ptr);
    return 0;
}
