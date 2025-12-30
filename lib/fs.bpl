# Filesystem

export [FS];
export [File];

import [String] from "std/string.bpl";
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
        if (this.handle == nullptr) return false;
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
}
