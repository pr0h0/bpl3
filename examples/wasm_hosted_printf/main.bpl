extern dprintf(fd: int, fmt: string, ...) ret int;
import [printf] from "std/c.bpl";

frame main() ret int {
    local label: string = "wasm";
    local marker: char = 'A';
    local outLen: int = printf("%s=%d%c\n", label, 42, 33);
    local percentLen: int = printf("literal %% %c\n", marker);
    local widthLen: int = printf("hex=%x upper=%X zero=%04d wide=%5d\n", 48879, 48879, 7, 42);
    local errLen: int = dprintf(2, "err:%d:%s%c\n", -7, "ok", 63);

    if (outLen != 9) {
        return 10 + outLen;
    }
    if (percentLen != 12) {
        return 20 + percentLen;
    }
    if (widthLen != 41) {
        return 30 + widthLen;
    }
    if (errLen != 11) {
        return 40 + errLen;
    }

    return 0;
}
