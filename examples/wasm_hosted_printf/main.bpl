extern dprintf(fd: int, fmt: string, ...) ret int;
extern printf(fmt: string, ...) ret int;

frame main() ret int {
    local label: string = "wasm";
    local marker: char = 'A';
    local outLen: int = printf("%s=%d%c\n", label, 42, 33);
    local percentLen: int = printf("literal %% %c\n", marker);
    local errLen: int = dprintf(2, "err:%d:%s%c\n", -7, "ok", 63);

    if (outLen != 9) {
        return 10 + outLen;
    }
    if (percentLen != 12) {
        return 20 + percentLen;
    }
    if (errLen != 11) {
        return 30 + errLen;
    }

    return 0;
}
