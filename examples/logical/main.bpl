extern printf(fmt: string, ...);
frame main() ret int {
    local t: bool = true;
    local f: bool = false;
    if (t && !f) {
        printf("t && !f is true\n");
    }
    if (f || t) {
        printf("f || t is true\n");
    }
    if (f && t) {
        printf("f && t is true (fail)\n");
    } else {
        printf("f && t is false\n");
    }
    return 0;
}
