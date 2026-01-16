# Filesystem

export [FS];
export [File];

import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [IOError] from "std/errors.bpl";
extern fopen(path: string, mode: string) ret *void;
extern fclose(file: *void) ret int;
extern fseek(file: *void, offset: long, whence: int) ret int;
extern ftell(file: *void) ret int;
extern rewind(file: *void) ret void;
extern fread(ptr: *void, size: long, nmemb: long, file: *void) ret long;
extern fwrite(ptr: *void, size: long, nmemb: long, file: *void) ret long;
extern strlen(s: string) ret int;
extern malloc(size: long) ret string;
extern free(ptr: string) ret void;
extern fgets(str: string, n: int, stream: *void) ret string;
extern mkdir(path: string, mode: int) ret int;
extern opendir(name: string) ret *void;
extern readdir(dir: *void) ret *void;
extern closedir(dir: *void) ret int;
extern strcpy(dest: string, src: string) ret string;

struct File {
    handle: *void,
    frame open(path: string, mode: string) ret File {
        local f: File;
        f.handle = fopen(path, mode);
        return f;
    }

    frame close(this: *File) {
        if (this.handle != nullptr) {
            fclose(this.handle);
            this.handle = nullptr;
        }
    }

    frame write(this: *File, data: string) {
        if (this.handle != nullptr) {
            local len: int = strlen(data);
            fwrite(cast<*void>(data), cast<long>(1), cast<long>(len), this.handle);
        }
    }

    frame readLine(this: *File, buf: string, max_len: int) ret bool {
        if (this.handle == nullptr) 
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
        local f: *void = fopen(path, "w");
        if (f == nullptr) {
            return false;
        }
        local len: int = strlen(cast<string>(data));
        fwrite(cast<*void>(data), cast<long>(1), cast<long>(len), f);
        fclose(f);
        return true;
    }

    frame readFile(path: string) ret String {
        local f: *void = fopen(path, "rb");
        if (f == nullptr) {
            # cannot open
            throw IOError { code: -1, message: "Cannot open file" };
        }
        # SEEK_END = 2
        fseek(f, cast<long>(0), cast<int>(2));
        local len: int = ftell(f);
        rewind(f);
        local buf: string = malloc(cast<long>(len + 1));
        fread(cast<*void>(buf), cast<long>(1), cast<long>(len), f);
        buf[len] = cast<char>(0);
        local s: String = String.new(buf);
        free(buf);
        fclose(f);
        return s;
    }

    frame mkdir(path: string) ret bool {
        # 0777 octal = 511 decimal
        return mkdir(path, 511) == 0;
    }

    frame mkdirp(path: string) ret bool {
        local s: String = String.new(path);
        local parts: Array<String> = s.split(cast<char>(47)); # /
        local current: String = String.new("");

        local i: int = 0;
        loop (i < parts.length) {
            local part: String = parts.get(i);
            if (part.length > 0) {
                if (current.length > 0) {
                    current = current + "/";
                }
                current = current + part;
                # Ignore error if exists
                mkdir(current.data, 511);
            }
            i = i + 1;
        }
        return true;
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
            # struct dirent linux x64: d_ino (8), d_off (8), d_reclen (2), d_type (1), d_name (offset 19)
            # We assume offset 19 for d_name and it is null terminated
            local ptr: *u8 = cast<*u8>(ent);
            local namePtr: *u8 = &(ptr[19]);
            local nameStr: string = cast<string>(namePtr);

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
