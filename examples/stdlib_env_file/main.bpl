import printf from "std/c.bpl";
import [Env] from "std/env.bpl";
import [FS] from "std/fs.bpl";

frame show(name: string) {
    local value: string = Env.get(name);
    if (value == nullptr) {
        printf("%s unset\n", name);
    } else {
        printf("%s=[%s]\n", name, value);
    }
}

frame main() ret int {
    # Examples run from the repository root; the files stay in this folder.
    local good: string = "examples/stdlib_env_file/app.env.tmp";
    local bad: string = "examples/stdlib_env_file/bad.env.tmp";
    FS.writeFile(good, "# settings\nexport APP_NAME=demo app   # trailing comment\nAPP_PORT = 8080\nAPP_GREETING=\"hello\\tworld \\\"quoted\\\"\"\nAPP_RAW='no $escape \\n here'\nAPP_HASH=a#b\nAPP_EMPTY=\nAPP_KEEP=from-file\r\n\r\n");
    FS.writeFile(bad, "GOOD=1\nnot a valid line\n");

    Env.set("APP_KEEP", "from-process");
    printf("loaded %d\n", Env.loadFile(good, false));
    show("APP_NAME");
    show("APP_PORT");
    show("APP_GREETING");
    show("APP_RAW");
    show("APP_HASH");
    show("APP_EMPTY");
    show("APP_KEEP");
    printf("override loaded %d\n", Env.loadFile(good, true));
    show("APP_KEEP");
    printf("bad %d\n", Env.loadFile(bad, true));
    show("GOOD");
    printf("missing %d\n", Env.loadFile("examples/stdlib_env_file/none.env", true));

    FS.remove(good);
    FS.remove(bad);
    return 0;
}
