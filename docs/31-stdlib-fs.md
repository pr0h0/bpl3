# Standard Library: File System

`std/fs.bpl` exports `FS` and `File`. These are small wrappers over C/POSIX file
operations on the native Linux/macOS runtime.

```bpl
import [FS], [File] from "std/fs.bpl";
```

## Available filesystem helpers

| Method                                              | Current behavior                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `FS.exists(path: string) ret bool`                  | Checks native metadata without opening the file; follows symlinks          |
| `FS.writeFile(path: string, data: string) ret bool` | Opens with `"wb"`, writes NUL-terminated text, then closes                  |
| `FS.readFile(path: string) ret String`              | Reads a stream into an owned String; native failures throw `IOError`   |
| `FS.mkdir(path: string) ret bool`                   | Calls POSIX `mkdir(path, 511)`; false includes already-existing directories |
| `FS.mkdirp(path: string) ret bool`                  | Creates missing directories; checks errors and existing directory types     |
| `FS.listDir(path: string) ret Array<String>`        | Owned entry names excluding `.` and `..`; empty array on failure            |
| `FS.listDirChecked(path: string) ret Array<String>` | Same names; throws `IOError` on open, read, close, size, or allocation failure |

There are no `FS.appendFile`, `deleteFile`, `copyFile`, `isDir`, or `fileSize`
methods. For append, open a `File` with mode `"a"`. Other operations require
appropriate native APIs or additional application code.

`exists` checks metadata with POSIX `stat` without opening or reading the file.
It recognizes directories and special files, including named pipes without a
writer, and does not require read permission on the file itself. False can mean
missing, an inaccessible path component, a broken symlink, or another metadata
error. Success does not guarantee that a later open will succeed.

`writeFile` checks writes and close, returning false on failure. This includes
buffered errors reported only when closing, but does not guarantee disk durability.
`readFile` checks allocation, size, read, and close results without requiring seeks.
Failures throw `IOError` with a nonzero native error code. Embedded NUL truncates
the text view, preserving the existing text API behavior.

`FS.readBytes(path) ret Array<u8>` preserves every byte, including NUL. Destroy the
returned Array after use. `FS.writeBytes(path, data: *u8, length: int) ret bool`
writes exactly the supplied byte count. Null data is accepted only for zero length;
negative lengths fail. Callers must supply a readable buffer of the stated length.
Whole-file reads are limited to 2,147,483,646 bytes to leave room for a terminator
within the stdlib's int-sized storage. Allocation failure may impose a lower limit.
Read failure frees the temporary buffer. Failed writes can leave a partial file.

Null paths make `exists`, `mkdir`, and writes return false; `listDir` returns an
empty array. Whole-file reads and `listDirChecked` throw `IOError` for null paths.

`mkdirp` preserves absolute roots and accepts relative paths, repeated separators,
and trailing slashes. It succeeds for existing directories (including symlinks to
directories), but rejects file collisions, null/empty paths, and native failures.
It creates with mode 0777 subject to the process umask. Components created before
a later failure remain in place. It follows normal filesystem path resolution,
including symlinks and `..`; it does not confine paths to a directory. This helper
uses the native Linux/macOS runtime; rebuild runtime support after updating it.

Both listing methods use the native platform's `dirent` layout. Entry order is
unspecified; hidden entries other than `.` and `..` are included. Names are owned
copies and remain valid after the directory closes. Destroy each returned String
before destroying the Array that stores them.

Use `listDirChecked` when an empty directory must be distinguishable from a failed
listing. It throws `IOError` with a nonzero native error code and releases temporary
names and storage on failure. The legacy `listDir` catches these errors and returns
an empty array. Neither method returns a partial listing after a reported failure.
Listings are not atomic snapshots: concurrent directory changes follow the native
filesystem's enumeration behavior. Counts and name lengths must fit the stdlib's
int-sized storage, and available memory can impose a lower limit.

```bpl
import [FS] from "std/fs.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [IOError] from "std/errors.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    try {
        local names: Array<String> = FS.listDirChecked(".");
        defer {
            loop (local i: int = 0; i < names.length; i = i + 1) {
                names.data[i].destroy();
            }
            names.destroy();
        }
        loop (local i: int = 0; i < names.length; i = i + 1) {
            printf("%s\n", names.data[i].data);
        }
    } catch (error: IOError) {
        printf("Listing failed: %s (code %d)\n", error.message, error.code);
        return 1;
    }
    return 0;
}
```

## File handles

- `File.open(path, mode)` returns a `File`; inspect `handle != nullptr` for success.
  A null path or mode returns a closed handle.
- `file.write(data) ret bool` writes text; false indicates an invalid handle/data or write failure.
- `file.writeBytes(data: *u8, length: int) ret bool` writes binary data with the same buffer contract as `FS.writeBytes`.
- `file.readBytes(data: *u8, length: int) ret int` reads into caller-owned storage
  and returns the actual byte count. With a positive length, zero means EOF.
  It preserves embedded NULs, requires no seeking, and allocates no buffer.
  Invalid arguments, a closed handle, or native read failure throw `IOError`.
  A failure may consume input and partially modify the buffer. A zero-length
  request on an open handle succeeds without consuming input, including when
  data is null. Negative lengths and null data with positive lengths fail.
- `file.readLine(buf, max_len)` uses `fgets`, retains the newline when present,
  and returns false for EOF, read failure, or a closed handle. Provide a writable
  buffer with at least `max_len` bytes and a limit greater than one. Null buffers
  and smaller limits return false.
- `file.close() ret bool` closes and resets the handle, returning false on close
  failure. Closing an already closed handle succeeds. Always check close after
  writing: successful buffered writes can still fail when flushed.

Use `"r"` to read, `"w"` to create/truncate, and `"a"` to append. Binary modes
`"rb"`/`"wb"` are accepted by the underlying C library, but `File.write` still
uses NUL-terminated text. File values shallow-copy the handle; close each opened
handle once and do not use copies after closing it.

## Reading binary data in chunks

Provide a writable buffer with at least the requested number of bytes. Reads may
block until the requested count, EOF, or an error; this is buffered file I/O, not
a nonblocking socket API. Only the returned prefix is valid after a successful
short read. Unlike `FS.readBytes`, the method takes a buffer and returns a count,
so callers can process files larger than the whole-file read limit with bounded
memory. Close the File on every exit path, including exceptions.

```bpl
import [File] from "std/fs.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    local file: File = File.open("input.bin", "rb");
    if (file.handle == nullptr) { return 1; }
    defer { file.close(); }
    local buffer: u8[4096];
    loop {
        local count: int = file.readBytes(&buffer[0], 4096);
        if (count == 0) { break; }
        printf("Read %d bytes\n", count);
    }
    return 0;
}
```

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
    local written: bool = file.write("second line\n");
    local closed: bool = file.close();
    if (!written || !closed) { return 4; }
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
