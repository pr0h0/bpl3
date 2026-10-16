# Formatting utilities

export [Fmt];

extern printf(fmt: string, ...) ret int;

struct Fmt {
    frame printInt(n: int) {
        printf("%d", n);
    }
    frame printIntLn(n: int) {
        printf("%d\n", n);
    }
    frame printHex(n: int) {
        printf("0x%x", n);
    }
    frame printHexLn(n: int) {
        printf("0x%x\n", n);
    }
    frame printString(s: string) {
        printf("%s", s);
    }
    frame printPaddedLeft(text: string, width: int) {
        printf("%*s", width, text);
    }
    frame printPaddedRight(text: string, width: int) {
        # Width is the minimum total byte width, matching printPaddedLeft.
        # Clamp negative widths to avoid accidental enormous padding at INT_MIN.
        local columns: int = width;
        if (columns < 0) { columns = 0; }
        printf("%-*s", columns, text);
    }
}
