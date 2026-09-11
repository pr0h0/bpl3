# Standard Library: File System

`std/fs.bpl` exports `FS` and `File`. These are small wrappers over C/POSIX file
operations, with limited error checking and platform assumptions.

```bpl
import [FS], [File] from "std/fs.bpl";
```

## Available filesystem helpers

| Method                                              | Current behavior                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `FS.exists(path: string) ret bool`                  | Attempts to open for reading; false can mean inaccessible, not just missing |
| `FS.writeFile(path: string, data: string) ret bool` | Opens with `"w"`, writes NUL-terminated text, then closes                   |
| `FS.readFile(path: string) ret String`              | Reads a seekable file into an owned String; open failure throws `IOError`   |
| `FS.mkdir(path: string) ret bool`                   | Calls POSIX `mkdir(path, 511)`; false includes already-existing directories |
| `FS.mkdirp(path: string) ret bool`                  | Experimental relative-path helper; ignores errors and always returns true   |
| `FS.listDir(path: string) ret Array<String>`        | Owned entry names excluding `.` and `..`; empty array on open failure       |

There are no `FS.appendFile`, `deleteFile`, `copyFile`, `isDir`, or `fileSize`
methods. For append, open a `File` with mode `"a"`. Other operations require
appropriate native APIs or additional application code.

`writeFile` reports whether opening succeeded; it does not check short writes
or close errors. `readFile` does not validate all seek, size, allocation, or read
results. It uses an int-sized file length and is not a large-file or binary-data
API: embedded NUL truncates the resulting String. `mkdirp` does not preserve a
leading root slash and must not be used as a reliable absolute-path creator.

`listDir` assumes the Linux x86-64 `dirent` name offset. Do not assume this helper
works on macOS or Windows. Entry order is unspecified. Destroy each returned
String before destroying the Array that stores them.

## File handles

- `File.open(path, mode)` returns a `File`; inspect `handle != nullptr` for success.
- `file.write(data)` writes text when open; it returns no status.
- `file.readLine(buf, max_len)` uses `fgets`, retains the newline when present,
  and returns false for EOF, read failure, or a closed handle. Provide a writable
  buffer with at least `max_len` bytes and a positive limit.
- `file.close()` closes a non-null handle and resets it. It ignores close errors.

Use `"r"` to read, `"w"` to create/truncate, and `"a"` to append. Binary modes
`"rb"`/`"wb"` are accepted by the underlying C library, but `File.write` still
uses NUL-terminated text. File values shallow-copy the handle; close each opened
handle once and do not use copies after closing it.

## Checked-open example

```bpl
import [FS], [File] from "std/fs.bpl";
import [String] from "std/string.bpl";
import [IOError] from "std/errors.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    if (!FS.writeFile("notes.txt", "first line\n")) {
        return 1;
    }
    local file: File = File.open("notes.txt", "a");
    if (file.handle == nullptr) { return 2; }
    file.write("second line\n");
    file.close();
    try {
        local content: String = FS.readFile("notes.txt");
        printf("%s", content.toString());
        content.destroy();
    } catch (error: IOError) {
        printf("%s\n", error.message);
        return 3;
    }
    return 0;
}
```

The example leaves `notes.txt` in the working directory. Open success alone is
not a guarantee that all data reached persistent storage.
