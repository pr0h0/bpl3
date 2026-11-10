# Higher-level filesystem helpers built on std/fs.bpl (native targets).
#
# Recursive traversal and removal, line-oriented reads and writes, type and
# size queries, temporary files and directories, and the working directory.
# Functions returning String or Array<String> allocate; destroy the results
# (`StringUtils.destroyAll` releases an Array<String>). Failures return false
# or throw IOError as documented per function.

export [Files];

import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [FS], [FileInfo] from "std/fs.bpl";
import [Path] from "std/path.bpl";
import [StringUtils] from "std/string_utils.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [IOError] from "std/errors.bpl";

extern __bpl_file_info(path: string, followLinks: int, size: *long, kind: *int) ret int;
extern getcwd(buffer: string, size: long) ret string;
extern chdir(path: string) ret int;
extern mkstemp(template: string) ret int;
extern mkdtemp(template: string) ret string;
extern close(fd: int) ret int;
extern getenv(name: string) ret string;
extern remove(path: string) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;

# 0 missing or unreadable, 1 file, 2 directory, 3 symlink, 4 other.
frame _filesKind(path: string, followLinks: int) ret int {
    local size: long = 0;
    local kind: int = 0;
    if (__bpl_file_info(path, followLinks, &size, &kind) != 0) {
        return 0;
    }
    if (kind == 0) {
        return 4;
    }
    return kind;
}

frame _filesTemplate(prefix: string) ret String {
    local directory: string = getenv("TMPDIR");
    if ((directory == nullptr) || (directory[0] == cast<char>(0))) {
        directory = "/tmp";
    }
    local name: StringBuilder = StringBuilder.new(32);
    if (prefix != nullptr) {
        name.append(prefix);
    }
    name.append("XXXXXX");
    local joined: String = Path.join(directory, name.buffer);
    name.destroy();
    return joined;
}

struct Files {
    # True for a regular file (following symlinks).
    frame isFile(path: string) ret bool {
        return _filesKind(path, 1) == 1;
    }

    # True for a directory (following symlinks).
    frame isDir(path: string) ret bool {
        return _filesKind(path, 1) == 2;
    }

    # True when `path` itself is a symbolic link.
    frame isSymlink(path: string) ret bool {
        return _filesKind(path, 0) == 3;
    }

    # The size in bytes, or -1 when it cannot be read.
    frame fileSize(path: string) ret long {
        local size: long = 0;
        local kind: int = 0;
        if (__bpl_file_info(path, 1, &size, &kind) != 0) {
            return -1;
        }
        return size;
    }

    # The lines of a text file (LF, CRLF or CR), without terminators.
    # Throws IOError when the file cannot be read.
    frame readLines(path: string) ret Array<String> {
        if (!Files.isFile(path)) {
            throw IOError { code: 2, message: "Cannot read file" };
        }
        local text: String = FS.readFile(path);
        local lines: Array<String> = StringUtils.splitLines(text.data);
        text.destroy();
        return lines;
    }

    # Writes each line followed by "\n"; returns whether it succeeded.
    frame writeLines(path: string, lines: *Array<String>) ret bool {
        local out: StringBuilder = StringBuilder.new(64);
        loop (local i: int = 0; i < lines.length; i = i + 1) {
            if (lines.data[i].data != nullptr) {
                out.append(lines.data[i].data);
            }
            out.appendChar('\n');
        }
        local ok: bool = FS.writeBytes(path, cast<*u8>(out.buffer), out.length);
        out.destroy();
        return ok;
    }

    # Creates an empty file, or leaves an existing one unchanged.
    frame touch(path: string) ret bool {
        if (FS.exists(path)) {
            return true;
        }
        return FS.writeFile(path, "");
    }

    /#
        Every path below `root` (files, directories and links), depth first
        with children in sorted order, each joined onto `root`. Symbolic
        links to directories are listed but not followed. Unreadable
        directories are skipped.
    #/
    frame walk(root: string) ret Array<String> {
        local out: Array<String> = Array<String>.new(16);
        Files._walkInto(root, &out);
        return out;
    }

    frame _walkInto(directory: string, out: *Array<String>) {
        local names: Array<String> = Array<String>.new(0);
        try {
            names.destroy();
            names = FS.listDirChecked(directory);
        } catch (error: IOError) {
            return;
        }
        names.sortBy(|a: String, b: String| ret int {
            return Files._compare(a.data, b.data);
        });
        loop (local i: int = 0; i < names.length; i = i + 1) {
            local child: String = Path.join(directory, names.data[i].data);
            out.push(child);
            if (_filesKind(child.data, 0) == 2) {
                Files._walkInto(child.data, out);
            }
        }
        StringUtils.destroyAll(&names);
    }

    frame _compare(a: string, b: string) ret int {
        local i: long = 0;
        loop ((a[i] != cast<char>(0)) && (a[i] == b[i])) {
            i = i + 1;
        }
        return cast<int>(cast<u8>(a[i])) - cast<int>(cast<u8>(b[i]));
    }

    # Only the regular files below `root` (see `walk`).
    frame walkFiles(root: string) ret Array<String> {
        local all: Array<String> = Files.walk(root);
        local files: Array<String> = Array<String>.new(all.length);
        loop (local i: int = 0; i < all.length; i = i + 1) {
            if (_filesKind(all.data[i].data, 0) == 1) {
                files.push(all.data[i]);
            } else {
                local entry: String = all.data[i];
                entry.destroy();
            }
        }
        all.destroy();
        return files;
    }

    /#
        Removes a file, link or directory tree. Links are removed, never
        followed. Returns true when nothing is left at `path` (also when it
        did not exist).
    #/
    frame removeAll(path: string) ret bool {
        local kind: int = _filesKind(path, 0);
        if (kind == 0) {
            return !FS.exists(path);
        }
        if (kind == 2) {
            local names: Array<String> = Array<String>.new(0);
            try {
                names.destroy();
                names = FS.listDirChecked(path);
            } catch (error: IOError) {
                return false;
            }
            local ok: bool = true;
            loop (local i: int = 0; i < names.length; i = i + 1) {
                local child: String = Path.join(path, names.data[i].data);
                if (!Files.removeAll(child.data)) {
                    ok = false;
                }
                child.destroy();
            }
            StringUtils.destroyAll(&names);
            if (!ok) {
                return false;
            }
        }
        return remove(path) == 0;
    }

    # Copies a directory tree (files and directories; links are copied as
    # the files they point to). Returns whether everything was copied.
    frame copyTree(source: string, target: string) ret bool {
        if (!Files.isDir(source)) {
            return FS.copyFile(source, target);
        }
        if (!FS.mkdirp(target)) {
            return false;
        }
        local names: Array<String> = Array<String>.new(0);
        try {
            names.destroy();
            names = FS.listDirChecked(source);
        } catch (error: IOError) {
            return false;
        }
        local ok: bool = true;
        loop (local i: int = 0; i < names.length; i = i + 1) {
            local sourceChild: String = Path.join(source, names.data[i].data);
            local targetChild: String = Path.join(target, names.data[i].data);
            if (!Files.copyTree(sourceChild.data, targetChild.data)) {
                ok = false;
            }
            sourceChild.destroy();
            targetChild.destroy();
        }
        StringUtils.destroyAll(&names);
        return ok;
    }

    # Creates a new empty file in $TMPDIR (or /tmp) named `prefix` plus six
    # random characters, and returns its path. Throws IOError on failure.
    frame tempFile(prefix: string) ret String {
        local template: String = _filesTemplate(prefix);
        local fd: int = mkstemp(template.data);
        if (fd < 0) {
            template.destroy();
            throw IOError { code: 5, message: "Cannot create temporary file" };
        }
        close(fd);
        return template;
    }

    # Creates a new private directory in $TMPDIR (or /tmp) and returns its
    # path. Throws IOError on failure.
    frame tempDir(prefix: string) ret String {
        local template: String = _filesTemplate(prefix);
        if (mkdtemp(template.data) == nullptr) {
            template.destroy();
            throw IOError { code: 5, message: "Cannot create temporary directory" };
        }
        return template;
    }

    # The current working directory. Throws IOError when it is unavailable.
    frame cwd() ret String {
        local size: long = 256;
        loop (size <= cast<long>(1048576)) {
            local buffer: string = cast<string>(malloc(size));
            if (buffer == nullptr) {
                throw IOError { code: 12, message: "Cannot allocate working directory" };
            }
            if (getcwd(buffer, size) != nullptr) {
                local result: String;
                result.data = buffer;
                result.length = cast<int>(strlen(buffer));
                return result;
            }
            free(cast<*void>(buffer));
            size = size * 2;
        }
        throw IOError { code: 36, message: "Working directory path too long" };
    }

    # Changes the working directory; returns whether it succeeded.
    frame chdir(path: string) ret bool {
        if (path == nullptr) {
            return false;
        }
        return chdir(path) == 0;
    }
}
