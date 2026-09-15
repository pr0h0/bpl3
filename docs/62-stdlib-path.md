# Standard Library: Paths

`std/path.bpl` exports `Path`, a collection of lexical helpers for slash-separated
paths. They do not access the filesystem. Backslashes are ordinary characters;
Windows drive letters and UNC paths are not interpreted specially. Returned
Strings own their storage: call `destroy` after use.

## Components and joining

| Call | Result |
| --- | --- |
| `Path.join("", "file.txt")` | `file.txt` |
| `Path.join("", "")` | `.` |
| `Path.join("a///", "///b")` | `a/b` |
| `Path.join("/a", "/b")` | `/a/b` |
| `Path.join("a", "../b")` | `a/../b` |
| `Path.basename("/a/b///")` | `b` |
| `Path.basename("/")` | Empty String |
| `Path.dirname("/a/b///")` | `/a` |
| `Path.dirname("a")` | `.` |
| `Path.dirname("///")` | `/` |
| `Path.extname(".profile")` | Empty String |
| `Path.extname(".profile.json")` | `.json` |
| `Path.extname("archive.tar.gz/")` | `.gz` |
| `Path.extname("name.")` | `.` |

`join` ignores empty arguments, uses `.` when both are empty, and joins two
nonempty arguments at one slash boundary. It preserves separators inside each
argument and does not resolve `.` or `..`. An absolute second argument does not
replace the first; use `resolve` for that behavior.

`basename`, `dirname`, and `extname` ignore trailing slashes. `dirname` removes
the final component and its adjacent separators, preserving other interior
separators. The basename of an empty or all-slash path is empty. `dirname("")`
is `.`. Extensions come from the final component's last dot, excluding an initial
dot and the special components `.` and `..`.

These four methods reject null strings and allocation/size failures by throwing
strings. Path inputs and results are limited to 2,147,483,646 bytes. `isAbsolute` tests only
whether the first byte is `/`, and returns false for null or empty inputs.

```bpl
import [Path] from "std/path.bpl";
import [String] from "std/string.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    local file: String = Path.join("", "report.txt");
    defer { file.destroy(); }
    local extension: String = Path.extname(file.data);
    defer { extension.destroy(); }
    printf("%s has extension %s\n", file.data, extension.data);
    return 0;
}
```

## Normalization and resolution

`normalize` collapses repeated slashes, removes `.` components, and processes
`..` lexically. Absolute paths cannot traverse above `/`; relative paths retain
unresolved leading `..` components. Empty results become `.` or `/` as appropriate.
Trailing slashes are removed except for the root. For example:

- `normalize("/a/b/../c/")` returns `/a/c`.
- `normalize("../../a/../b")` returns `../../b`.
- `normalize("a/..")` returns `.`.

`resolve(base, target)` normalizes an absolute target directly, otherwise joins
it to the base and normalizes the result. It does not consult the process working
directory: `resolve("", "file")` returns the relative path `file`.

Both methods reject null arguments, unsupported lengths, and allocation failures
by throwing strings. Normalization uses one owned output buffer; resolution also
releases its temporary joined path, including when normalization throws.

These operations do not resolve symlinks or prove that a path stays inside a
directory. Lexically removing `..` can change actual traversal through symlinks.

## Relative paths

`relative(source, target)` normalizes both inputs, compares complete components,
and returns the traversals from source to target. Identical normalized paths
produce an empty String. Examples:

- `relative("/a/b", "/a/c")` returns `../c`.
- `relative("/a", "/abc")` returns `../abc`.
- `relative("a/b", "a/c")` returns `../c`.
- `relative("../a", "../b")` returns `../b`.

Both inputs must be absolute or both relative. For relative inputs, any leading
`..` components in the normalized source must be part of the shared prefix.
Otherwise the result depends on unknown ancestor names, so the method throws a
string; for example `relative("../a", "b")` fails. It does not consult the working
directory to resolve this ambiguity. Null inputs, allocation failures, and
unsupported result lengths also throw strings. Temporary normalized paths are
released on success and on error.
