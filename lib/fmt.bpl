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
    frame printPaddedLeft(text: string, width: int) {
        printf("%*s", width, text);
    }
    frame printPaddedRight(text: string, width: int) {
        # Right padding: print text then spaces
        printf("%s", text);
        local i: int = 0;
        loop (i < width) {
            printf(" ");
            i = i + 1;
        }
    }
}
