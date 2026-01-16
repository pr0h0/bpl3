import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
# import [Vector] from "std/vec.bpl";
# import [strcmp], [strstr], [strlen] from "libc";
extern strcmp(s1: string, s2: string) ret int;
extern strstr(haystack: string, needle: string) ret string;
extern strlen(s: string) ret int;
extern sprintf(str: string, fmt: string, ...) ret int;
extern malloc(size: int) ret *void;

frame int_to_string(val: int) ret string {
    local buf: *u8 = cast<*u8>(malloc(32));
    sprintf(cast<string>(buf), "%d", val);
    return cast<string>(buf);
}

struct KeyVal {
    key: string,
    val: string,
}

frame parse_form(body: string) ret Array<KeyVal> {
    local vec: Array<KeyVal> = Array<KeyVal>.new(16);
    if (body == nullptr) 
        return vec;
    # Naive split by '&'
    # Then split by '='
    # In a real app we need URL decoding.

    # ... Implementation skipped for brevity, using simple string searching ...
    # Wait, I need this to work for the demo.

    local ptr: string = body;
    local len: int = strlen(body);
    local end: string = ptr + len;

    local current: string = ptr;
    loop (current < end) {
        # Find next &
        local next_amp: string = strchr(current, 38); # '&'
        local segment_len: int = 0;
        if (next_amp == nullptr) {
            segment_len = cast<int>(end - current);
        } else {
            segment_len = cast<int>(next_amp - current);
        }

        # In this segment, find '='
        # We need to copy the segment to process it safely?
        # Or just parse in place if we can modify it? No, body might be const.

        # Allocate temp buffer
        local seg: string = strndup(current, segment_len);

        local eq: string = strchr(seg, 61); # '='
        if (eq != nullptr) {
            # Split
            ptr_set_byte(eq, 0); # Null terminate key
            local key: string = seg;
            local val: string = eq + 1;

            # Simple URL decode (replacing + with space)
            replace_char(val, 43, 32);

            vec.push(KeyVal { key: strdup(key), val: strdup(val) });
        }
        # create_user expects duplicated strings anyway?
        # My store.bpl does strdup.

        free(cast<*void>(seg));

        if (next_amp == nullptr) 
            break;
        current = next_amp + 1;
    }

    return vec;
}

extern strchr(s: string, c: int) ret string;
extern strndup(s: string, n: int) ret string;
extern strdup(s: string) ret string;
extern free(ptr: *void);

frame ptr_set_byte(ptr: string, val: int) {
    local p: *u8 = cast<*u8>(ptr);
    p[0] = cast<u8>(val);
}

frame replace_char(s: string, old: int, new: int) {
    local p: *u8 = cast<*u8>(s);
    loop (p[0] != 0) {
        if (p[0] == cast<u8>(old)) {
            p[0] = cast<u8>(new);
        }
        p = p + 1;
    }
}

frame find_form_val(vec: *Array<KeyVal>, key: string) ret string {
    local i: int = 0;
    loop (i < vec.length) {
        local kv: KeyVal = vec.get(i);
        if (strcmp(kv.key, key) == 0) {
            return kv.val;
        }
        i = i + 1;
    }
    return nullptr;
}

export parse_form;
export find_form_val;
export KeyVal;
export int_to_string;
