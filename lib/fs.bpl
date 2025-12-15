# Filesystem

export [FS];

import [String] from "std/string.bpl";
extern fopen(path: string, mode: string) ret *void;
extern fclose(file: *void) ret int;
extern fseek(file: *void, offset: i64, whence: int) ret int;
extern ftell(file: *void) ret int;
extern rewind(file: *void) ret void;
extern fread(ptr: *void, size: i64, nmemb: i64, file: *void) ret i64;
extern fwrite(ptr: *void, size: i64, nmemb: i64, file: *void) ret i64;
extern strlen(s: *char) ret int;
extern malloc(size: i64) ret *char;
extern free(ptr: *char) ret void;

struct FS {
    frame exists(path: string) ret bool {
        local f: *void = fopen(path, "r");
        if (f != null) {
            fclose(f);
            return true;
        }
        return false;
    }

    frame writeFile(path: string, data: string) ret bool {
        local f: *void = fopen(path, "w");
        if (f == null) {
            return false;
        }
        local len: int = strlen(cast<*char>(data));
        fwrite(cast<*void>(data), cast<i64>(1), cast<i64>(len), f);
        fclose(f);
        return true;
    }

    frame readFile(path: string) ret String {
        local f: *void = fopen(path, "rb");
        if (f == null) {
            # cannot open
            throw -1;
        }
        # SEEK_END = 2
        fseek(f, cast<i64>(0), cast<int>(2));
        local len: int = ftell(f);
        rewind(f);
        local buf: *char = malloc(cast<i64>(len + 1));
        fread(cast<*void>(buf), cast<i64>(1), cast<i64>(len), f);
        buf[len] = cast<char>(0);
        local s: String = String.new(buf);
        free(buf);
        fclose(f);
        return s;
    }
}
