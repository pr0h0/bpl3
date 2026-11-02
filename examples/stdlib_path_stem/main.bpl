import printf from "std/c.bpl";
import [Path] from "std/path.bpl";
import [String] from "std/string.bpl";

frame show(path: string) {
    local stem: String = Path.stem(path);
    local ext: String = Path.extname(path);
    local md: String = Path.withExtension(path, ".md");
    local bare: String = Path.withExtension(path, "");
    printf("[%s] stem [%s] ext [%s] md [%s] bare [%s]\n", path, stem.cstr(), ext.cstr(), md.cstr(), bare.cstr());
    stem.destroy();
    ext.destroy();
    md.destroy();
    bare.destroy();
}

frame main() ret int {
    show("docs/report.md");
    show("archive.tar.gz");
    show(".bashrc");
    show("dir/.env.local");
    show("noext");
    show("a/b/");
    show("/x/y.txt/");
    show("..");
    show("file.");
    show("a.b/c");
    show("");
    return 0;
}
