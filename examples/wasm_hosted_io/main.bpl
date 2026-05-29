import [String] from "std/string.bpl";

extern __bpl_argc() ret int;
extern __bpl_argv_get(index: int) ret string;
extern dprintf(fd: int, fmt: string, ...) ret int;
extern printf(fmt: string, ...) ret int;
extern putchar(value: int) ret int;
extern puts(value: string) ret int;

frame main() ret int {
    if (__bpl_argc() != 3) {
        dprintf(2, "bad argc\n");
        return 10;
    }

    local first: String = String.new(__bpl_argv_get(1));
    local second: String = String.new(__bpl_argv_get(2));
    if (first.length != 5) {
        first.destroy();
        second.destroy();
        return 20;
    }
    if (second.length != 4) {
        first.destroy();
        second.destroy();
        return 30;
    }

    printf("host:");
    puts(first.toString());
    dprintf(2, "host stderr\n");
    putchar(33);
    putchar(10);

    first.destroy();
    second.destroy();
    return 0;
}
