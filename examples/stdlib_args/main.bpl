import [Args] from "std/args.bpl";
import [IO] from "std/io.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;

frame main(argc: int, argv: **char) ret int {
    printf("=== Program Arguments From main ===\n");
    printf("Program started with %d arguments.\n", argc);
    local x: int = 0;
    loop (x < argc) {
        printf("argv[%d]: %s\n", x, argv[x]);
        x = x + 1;
    }

    IO.log("=== Args Demo From [Args] ===");
    local count: int = Args.count();
    IO.printInt(count);
    local i: int = 0;
    loop (i < count) {
        local arg: String = Args.get(i);
        printf("arg[%d]: %s\n", i, arg.cstr());
        i = i + 1;
    }
    return 0;
}
