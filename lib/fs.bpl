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
extern __bpl_dirent_name(entry: *void) ret string;
extern strlen(s: string) ret int;
extern fgets(str: string, n: int, stream: *void) ret string;
extern mkdir(path: string, mode: int) ret int;
extern __bpl_mkdirp(path: string) ret int;
extern opendir(name: string) ret *void;
extern readdir(dir: *void) ret *void;
extern closedir(dir: *void) ret int;

struct File {
    handle: *void,
    frame open(path: string, mode: string) ret File {
        local f: File;
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

    frame readLine(this: *File, buf: string, max_len: int) ret bool {
        if (this.handle == nullptr || buf == nullptr || max_len <= 1)
            return false;
        local res: string = fgets(buf, max_len, this.handle);
        return res != nullptr;
    }
}

struct FS {
    frame exists(path: string) ret bool {
        local f: *void = fopen(path, "r");
        if (f != nullptr) {
            fclose(f);
            return true;
        }
        return false;
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
        # 0777 octal = 511 decimal
        return mkdir(path, 511) == 0;
    }

    # Create missing path components, preserving roots and checking existing directories.
    frame mkdirp(path: string) ret bool {
        return __bpl_mkdirp(path) == 0;
    }

    frame listDir(path: string) ret Array<String> {
        local dir: *void = opendir(path);
        if (dir == nullptr) {
            return Array<String>.new(0);
        }
        local result: Array<String> = Array<String>.new(10);
        loop {
            local ent: *void = readdir(dir);
            if (ent == nullptr) {
                break;
            }
            local nameStr: string = __bpl_dirent_name(ent);

            # Skip . and ..
            if (strlen(nameStr) > 0) {
                local skip: bool = false;
                if (nameStr[0] == cast<char>(46)) {
                    # .
                    if (nameStr[1] == cast<char>(0)) 
                        skip = true;
                    else if ((nameStr[1] == cast<char>(46)) && (nameStr[2] == cast<char>(0))) 
                        skip = true;
                }
                if (!skip) {
                    result.push(String.new(nameStr));
                }
            }
        }
        closedir(dir);
        return result;
    }
}
