# Filesystem

export [FS];
export [File];

import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [IOError] from "std/errors.bpl";
extern fopen(path: string, mode: string) ret *void;
extern fclose(file: *void) ret int;
extern __bpl_read_file(path: string, data: *string, length: *int) ret int;
extern __bpl_write_file(path: string, data: *void, length: long) ret int;
extern __bpl_file_write(file: *void, data: *void, length: long) ret int;
extern __bpl_file_read(file: *void, data: *void, length: int, count: *int) ret int;
extern __bpl_list_dir(path: string, names: **string, count: *int) ret int;
extern __bpl_free_dir_names(names: *string, count: int);
extern __bpl_fs_allocate_entries(count: int, width: long, data: **void) ret int;
extern strlen(s: string) ret int;
extern fgets(str: string, n: int, stream: *void) ret string;
extern mkdir(path: string, mode: int) ret int;
extern __bpl_mkdirp(path: string) ret int;
extern __bpl_path_exists(path: string) ret int;

struct File {
    handle: *void,
    frame open(path: string, mode: string) ret File {
        local f: File;
        f.handle = nullptr;
        if (path == nullptr || mode == nullptr) { return f; }
        f.handle = fopen(path, mode);
        return f;
    }

    # Closing consumes the handle even when buffered writes fail.
    frame close(this: *File) ret bool {
        if (this.handle == nullptr) { return true; }
        local result: int = fclose(this.handle);
        this.handle = nullptr;
        return result == 0;
    }

    frame write(this: *File, data: string) ret bool {
        if (data == nullptr) { return false; }
        return __bpl_file_write(this.handle, cast<*void>(data), cast<long>(strlen(data))) == 0;
    }

    frame writeBytes(this: *File, data: *u8, length: int) ret bool {
        return __bpl_file_write(this.handle, cast<*void>(data), cast<long>(length)) == 0;
    }

    # Read up to length bytes into caller-owned storage; zero indicates EOF
    # for positive length. Errors throw IOError; the buffer may be partly filled.
    frame readBytes(this: *File, data: *u8, length: int) ret int {
        local count: int = 0;
        local error: int = __bpl_file_read(this.handle, cast<*void>(data), length, &count);
        if (error != 0) {
            throw IOError { code: error, message: "Cannot read from file" };
        }
        return count;
    }

    frame readLine(this: *File, buf: string, max_len: int) ret bool {
        if (this.handle == nullptr || buf == nullptr || max_len <= 1)
            return false;
        local res: string = fgets(buf, max_len, this.handle);
        return res != nullptr;
    }
}

struct FS {
    frame exists(path: string) ret bool {
        return __bpl_path_exists(path) != 0;
    }

    frame writeFile(path: string, data: string) ret bool {
        if (data == nullptr) { return false; }
        return __bpl_write_file(path, cast<*void>(data), cast<long>(strlen(data))) == 0;
    }

    # Writes exactly length bytes, including embedded NULs. Checks close errors.
    frame writeBytes(path: string, data: *u8, length: int) ret bool {
        return __bpl_write_file(path, cast<*void>(data), cast<long>(length)) == 0;
    }

    # Caller owns the returned Array; destroy it after use.
    frame readBytes(path: string) ret Array<u8> {
        local buffer: string = nullptr;
        local length: int = 0;
        local error: int = __bpl_read_file(path, &buffer, &length);
        if (error != 0) {
            throw IOError { code: error, message: "Cannot read file" };
        }
        local result: Array<u8>;
        result.data = cast<*u8>(buffer);
        result.length = length;
        result.capacity = length;
        return result;
    }

    # Text retains the historical first-NUL termination behavior.
    frame readFile(path: string) ret String {
        local buffer: string = nullptr;
        local length: int = 0;
        local error: int = __bpl_read_file(path, &buffer, &length);
        if (error != 0) {
            throw IOError { code: error, message: "Cannot read file" };
        }
        local result: String;
        result.data = buffer;
        result.length = strlen(buffer);
        return result;
    }

    frame mkdir(path: string) ret bool {
        if (path == nullptr) { return false; }
        # 0777 octal = 511 decimal
        return mkdir(path, 511) == 0;
    }

    # Create missing path components, preserving roots and checking existing directories.
    frame mkdirp(path: string) ret bool {
        return __bpl_mkdirp(path) == 0;
    }

    frame listDir(path: string) ret Array<String> {
        local result: Array<String>;
        result.data = nullptr;
        result.length = 0;
        result.capacity = 0;
        try {
            result = FS.listDirChecked(path);
        } catch (error: IOError) {
            # Preserve the legacy empty-on-error result.
        }
        return result;
    }

    # Owned names excluding . and ..; failures throw without partial results.
    frame listDirChecked(path: string) ret Array<String> {
        local names: *string = nullptr;
        local count: int = 0;
        local error: int = __bpl_list_dir(path, &names, &count);
        if (error != 0) {
            throw IOError { code: error, message: "Cannot list directory" };
        }
        defer { __bpl_free_dir_names(names, count); }
        local storage: *void = nullptr;
        error = __bpl_fs_allocate_entries(count, cast<long>(sizeof<String>()), &storage);
        if (error != 0) {
            throw IOError { code: error, message: "Cannot allocate directory entries" };
        }
        local result: Array<String>;
        result.data = cast<*String>(storage);
        result.length = count;
        result.capacity = count;
        loop (local i: int = 0; i < count; i = i + 1) {
            local name: String;
            name.data = names[i];
            name.length = strlen(names[i]);
            result.data[i] = name;
            names[i] = nullptr;
        }
        return result;
    }
}
