import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("walks, copies and removes trees and buffers file I/O", () => {
  expectCorrectnessSuite([
    {
      name: "files and bufio",
      validateLlvm: true,
      expectedStdout:
        "tempdir T T\nkinds T F F size 11 -1\nlines 3 [x] [y] [last]\nwalk a a/b a/b/two.txt a/one.txt z.txt\nfiles 3\ncopytree T T\nwriter T\nreader 70000 ah second line -12345 T\nbytes x 13 rest 8 -1\ncwd T T\ntempfile T 0\nremoveAll T F T\nopen error Cannot open file for reading\n",
      source: `import [Files] from "std/files.bpl";
import [BufferedReader], [BufferedWriter] from "std/bufio.bpl";
import [FS] from "std/fs.bpl";
import [Path] from "std/path.bpl";
import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [StringUtils] from "std/string_utils.bpl";
import [IOError] from "std/errors.bpl";
extern printf(fmt: string, ...);
extern strlen(s: string) ret long;
frame b(v: bool) ret string { if (v) { return "T"; } return "F"; }
frame at(root: String, name: string) ret String { return Path.join(root.data, name); }
frame main() ret int {
    local root: String = Files.tempDir("bpl-files-");
    printf("tempdir %s %s\\n", b(Files.isDir(root.data)), b(StringUtils.contains(root.data, "bpl-files-")));
    local sub: String = at(root, "a/b");
    FS.mkdirp(sub.data);
    local f1: String = at(root, "a/one.txt");
    local f2: String = at(root, "a/b/two.txt");
    local f3: String = at(root, "z.txt");
    FS.writeFile(f1.data, "x\\r\\ny\\nlast");
    Files.touch(f2.data);
    local lines: Array<String> = Array<String>.new(2);
    lines.push(String.new("alpha")); lines.push(String.new("beta"));
    Files.writeLines(f3.data, &lines);
    StringUtils.destroyAll(&lines);
    printf("kinds %s %s %s size %ld %ld\\n", b(Files.isFile(f1.data)), b(Files.isDir(f1.data)), b(Files.isSymlink(f1.data)), Files.fileSize(f3.data), Files.fileSize("/definitely/missing"));
    local read: Array<String> = Files.readLines(f1.data);
    printf("lines %d [%s] [%s] [%s]\\n", read.length, read.get(0).cstr(), read.get(1).cstr(), read.get(2).cstr());
    StringUtils.destroyAll(&read);
    local walked: Array<String> = Files.walk(root.data);
    printf("walk");
    loop (local i: int = 0; i < walked.length; i = i + 1) { printf(" %s", walked.get(i).cstr() + strlen(root.data) + 1); }
    printf("\\n");
    StringUtils.destroyAll(&walked);
    local onlyFiles: Array<String> = Files.walkFiles(root.data);
    printf("files %d\\n", onlyFiles.length);
    StringUtils.destroyAll(&onlyFiles);
    local copy: String = at(root, "copy");
    local src: String = at(root, "a");
    printf("copytree %s", b(Files.copyTree(src.data, copy.data)));
    local copied: String = at(root, "copy/b/two.txt");
    printf(" %s\\n", b(Files.isFile(copied.data)));
    local big: String = at(root, "big.txt");
    local w: BufferedWriter = BufferedWriter.create(big.data);
    loop (local i: int = 0; i < 70000; i = i + 1) { w.writeByte(cast<u8>(97 + (i % 26))); }
    w.write("\\r\\nsecond line\\n");
    w.writeLong(cast<long>(-12345));
    printf("writer %s\\n", b(w.close()));
    local r: BufferedReader = BufferedReader.open(big.data);
    local first: String = r.readLine().unwrap();
    local second: String = r.readLine().unwrap();
    local third: String = r.readLine().unwrap();
    printf("reader %d %c%c %s %s %s\\n", first.length, first.get(0), first.get(69999), second.cstr(), third.cstr(), b(r.readLine().isNone()));
    first.destroy(); second.destroy(); third.destroy();
    r.close();
    local r2: BufferedReader = BufferedReader.open(f1.data);
    local c0: int = r2.readByte();
    local p: int = r2.peekByte();
    local rest: String = r2.readAll();
    printf("bytes %c %d rest %d %d\\n", cast<char>(c0), p, rest.length, r2.readByte());
    rest.destroy(); r2.close();
    local here: String = Files.cwd();
    Files.chdir(root.data);
    local inside: String = Files.cwd();
    printf("cwd %s %s\\n", b(StringUtils.endsWith(inside.data, StringUtils.removePrefix(root.data, "/").data)), b(Files.isFile("z.txt")));
    Files.chdir(here.data);
    here.destroy(); inside.destroy();
    local tmp: String = Files.tempFile("bpl-file-");
    printf("tempfile %s %ld\\n", b(Files.isFile(tmp.data)), Files.fileSize(tmp.data));
    Files.removeAll(tmp.data);
    printf("removeAll %s %s %s\\n", b(Files.removeAll(root.data)), b(FS.exists(root.data)), b(Files.removeAll(root.data)));
    try { BufferedReader.open("/definitely/missing/file"); } catch (e: IOError) { printf("open error %s\\n", e.message); }
    return 0;
}
`,
    },
  ]);
}, 120000);
