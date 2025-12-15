# String standard library

export [String];

extern strlen(s: *char) ret int;
extern strcpy(dst: *char, src: *char) ret *char;
extern malloc(size: i64) ret *char;
extern free(ptr: *char) ret void;

struct String {
    data: *char,
    length: int,
    frame new(text: *char) ret String {
        local s: String;
        if (text == null) {
            s.data = null;
            s.length = 0;
            return s;
        }
        local len: int = strlen(text);
        s.length = len;
        s.data = malloc(cast<i64>(len + 1));
        strcpy(s.data, text);
        return s;
    }

    frame destroy(this: *String) {
        if (this.data != null) {
            free(this.data);
            this.data = null;
        }
        this.length = 0;
    }

    frame cstr(this: *String) ret *char {
        return this.data;
    }
}
