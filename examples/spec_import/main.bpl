import [Disposable], [User] from "./defs.bpl";

frame process(d: *Disposable) {
    d.destroy();
}

extern printf(fmt: string, ...);

frame main() ret int {
    local u: User = User { name: "test" };
    process(&u);
    printf("Done\n");
    return 0;
}
