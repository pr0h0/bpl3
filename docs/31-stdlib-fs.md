# Standard Library: File System

The `FS` and `File` structs provide file system operations.

## Import

```bpl
import [FS], [File] from "std/fs.bpl";
```

## FS Static Methods

| Method                                               | Description                                  |
| ---------------------------------------------------- | -------------------------------------------- |
| `FS.exists(path: string) ret bool`                   | Check if file exists                         |
| `FS.readFile(path: string) ret String`               | Read entire file (throws IOError on failure) |
| `FS.writeFile(path: string, data: string) ret bool`  | Write data to file                           |
| `FS.appendFile(path: string, data: string) ret bool` | Append data to file                          |
| `FS.deleteFile(path: string) ret bool`               | Delete a file                                |
| `FS.copyFile(src: string, dest: string) ret bool`    | Copy a file                                  |
| `FS.mkdir(path: string) ret bool`                    | Create directory                             |
| `FS.isDir(path: string) ret bool`                    | Check if path is directory                   |
| `FS.listDir(path: string) ret Array<String>`         | List directory contents                      |
| `FS.fileSize(path: string) ret long`                 | Get file size in bytes                       |

## File Object

For more control over file operations:

```bpl
# Open a file
local f: File = File.open("data.txt", "r");  # "r", "w", "a", "rb", "wb"

# Read line by line
local buf: char[256];
loop (f.readLine(cast<string>(&buf), 256)) {
    printf("%s", &buf);
}

# Write to file
local out: File = File.open("output.txt", "w");
out.write("Hello, World!\n");

# Always close files
f.close();
out.close();
```

## File Modes

| Mode   | Description                |
| ------ | -------------------------- |
| `"r"`  | Read (file must exist)     |
| `"w"`  | Write (creates/truncates)  |
| `"a"`  | Append (creates if needed) |
| `"rb"` | Read binary                |
| `"wb"` | Write binary               |

## Example

```bpl
import [FS], [File] from "std/fs.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...);

frame main() {
    local path: string = "test.txt";

    # Write to file
    if (FS.writeFile(path, "Hello, BPL!\nLine 2\n")) {
        printf("File written successfully\n");
    }

    # Check if exists
    if (FS.exists(path)) {
        printf("File exists\n");

        # Read entire file
        try {
            local content: String = FS.readFile(path);
            printf("Content:\n%s", content.toString());
            content.destroy();
        } catch (e: IOError) {
            printf("Error reading file: %s\n", e.message);
        }
    }

    # Append to file
    FS.appendFile(path, "Appended line\n");

    # Get file size
    local size: long = FS.fileSize(path);
    printf("File size: %ld bytes\n", size);

    # Clean up
    FS.deleteFile(path);
}
```

## Directory Operations

```bpl
import [FS] from "std/fs.bpl";

frame main() {
    # Create directory
    FS.mkdir("mydir");

    # Check if directory
    if (FS.isDir("mydir")) {
        printf("mydir is a directory\n");
    }

    # List directory contents
    local files: Array<String> = FS.listDir(".");
    local i: int = 0;
    loop (i < files.len()) {
        printf("  %s\n", files.get(i).toString());
        i = i + 1;
    }
    files.destroy();
}
```
