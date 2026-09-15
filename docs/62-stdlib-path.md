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
strings. Path results are limited to 2,147,483,646 bytes. `isAbsolute` tests only
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
