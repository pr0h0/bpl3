import printf from "std/c.bpl";
import [FS] from "std/fs.bpl";
import [String] from "std/string.bpl";

frame show(label: string, path: string) {
    if (!FS.exists(path)) {
        printf("%s: missing\n", label);
        return;
    }
    local text: String = FS.readFile(path);
    printf("%s: [%s]\n", label, text.cstr());
    text.destroy();
}

frame main() ret int {
    # Examples run from the repository root; every file stays in this folder.
    local dir: string = "examples/stdlib_fs_ops/scratch_dir";
    FS.mkdir(dir);
    local a: string = "examples/stdlib_fs_ops/fs_ops_a.txt";
    printf("write %d\n", cast<int>(FS.writeFile(a, "one")));
    printf("append %d %d\n", cast<int>(FS.appendFile(a, " two")), cast<int>(FS.appendFile(a, " three")));
    show("a", a);
    printf("append new %d\n", cast<int>(FS.appendFile("examples/stdlib_fs_ops/fs_ops_new.txt", "fresh")));
    show("new", "examples/stdlib_fs_ops/fs_ops_new.txt");
    printf("copy %d\n", cast<int>(FS.copyFile(a, "examples/stdlib_fs_ops/fs_ops_b.txt")));
    show("b", "examples/stdlib_fs_ops/fs_ops_b.txt");
    printf("copy onto itself %d\n", cast<int>(FS.copyFile(a, "examples/stdlib_fs_ops/./fs_ops_a.txt")));
    show("a after self copy", a);
    printf("copy missing %d\n", cast<int>(FS.copyFile("examples/stdlib_fs_ops/fs_ops_none.txt", "examples/stdlib_fs_ops/fs_ops_c.txt")));
    printf("rename %d\n", cast<int>(FS.rename("examples/stdlib_fs_ops/fs_ops_b.txt", "examples/stdlib_fs_ops/fs_ops_c.txt")));
    show("b after rename", "examples/stdlib_fs_ops/fs_ops_b.txt");
    show("c", "examples/stdlib_fs_ops/fs_ops_c.txt");
    printf("remove %d %d %d\n", cast<int>(FS.remove(a)), cast<int>(FS.remove("examples/stdlib_fs_ops/fs_ops_c.txt")), cast<int>(FS.remove("examples/stdlib_fs_ops/fs_ops_new.txt")));
    printf("remove missing %d\n", cast<int>(FS.remove(a)));
    show("a after remove", a);
    printf("remove dir %d\n", cast<int>(FS.remove(dir)));
    printf("dir exists %d\n", cast<int>(FS.exists(dir)));
    return 0;
}
