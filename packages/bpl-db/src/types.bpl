export [DataType];
export [Value];
export clone_value;
export destroy_value;
export value_kind;
export data_kind;
export serialize_value;
export deserialize_value;

import [String] from "std/string.bpl";

extern sprintf(str: string, format: string, ...) ret int;
extern malloc(size: long) ret *void;

enum DataType {
    Int,
    Str,
    Bool,
}

enum Value {
    Int(int),
    Str(string),
    Bool(bool),
    Null,
}

# Helper to get type of a value
frame get_type(v: *Value) ret DataType {
    local res: DataType = DataType.Int;
    match (v[0]) {
        Value.Int(_) => res = DataType.Int,
        Value.Str(_) => res = DataType.Str,
        Value.Bool(_) => res = DataType.Bool,
        Value.Null => res = DataType.Int,
    };
    return res;
}
extern strlen(text: string) ret long;
extern free(ptr: *void);
frame clone_value(v: *Value) ret Value {
    return match(v[0]) {
        Value.Str(text) => {
            if (text == nullptr) { throw "Null database string"; }
            local len: long = strlen(text); local copy: string = malloc(len + 1);
            if (copy == nullptr) { throw "Database allocation failed"; }
            loop(local i: long = 0; i <= len; i = i + 1) { copy[i] = text[i]; }
            return Value.Str(copy);
        },
        _ => v[0],
    };
}
frame destroy_value(v: *Value) {
    match(v[0]) { Value.Str(text) => free(text), _ => {}, };
    v[0] = Value.Null;
}
frame value_kind(v: *Value) ret int {
    return match(v[0]) { Value.Int(_) => 0, Value.Str(_) => 1, Value.Bool(_) => 2, Value.Null => 3, };
}
frame serialize_value(v: *Value) ret string {
    local size: long = 32;
    match(v[0]) { Value.Str(text) => size = strlen(text) * 2 + 3, _ => {}, };
    local buf: string = malloc(size);
    if (buf == nullptr) { throw "Database allocation failed"; }
    match(v[0]) {
        Value.Int(i) => sprintf(buf, "I:%d", i),
        Value.Str(text) => {
            buf[0] = 'X'; buf[1] = ':';
            local digits: string = "0123456789abcdef";
            local len: long = strlen(text);
            loop(local i: long = 0; i < len; i = i + 1) {
                local c: int = cast<int>(cast<u8>(text[i]));
                buf[2+i*2] = digits[c / 16]; buf[3+i*2] = digits[c % 16];
            }
            buf[2+len*2] = 0;
        },
        Value.Bool(b) => sprintf(buf, "B:%d", b),
        Value.Null => sprintf(buf, "N"),
    };
    return buf;
}
frame db_hex(c: char) ret int {
    if(c >= '0' && c <= '9') {return cast<int>(c - '0');}
    if(c >= 'a' && c <= 'f') {return cast<int>(c - 'a') + 10;}
    return -1;
}

extern atoi(s: string) ret int;

frame deserialize_value(s: string) ret Value {
    if(s == nullptr || s[0] == 0) {return Value.Null;}
    if(s[0] == 'X' && s[1] == ':') {
        local len: long = strlen(s + 2);
        if(len % 2 != 0) {throw "Invalid database hex string";}
        local result: string = malloc(len / 2 + 1);
        if(result == nullptr) {throw "Database allocation failed";}
        loop(local i: long = 0; i < len; i = i + 2) {
            local a: int = db_hex(s[i+2]); local b: int = db_hex(s[i+3]);
            if(a < 0 || b < 0 || (a == 0 && b == 0)) {free(result); throw "Invalid database hex string";}
            result[i/2] = cast<char>(a*16+b);
        }
        result[len/2] = 0; return Value.Str(result);
    }
    if(s[0] != 'N' && (strlen(s) < 2 || s[1] != ':')) {throw "Invalid database value";}

    if (s[0] == 73) {
        # 'I'
        return Value.Int(atoi(s + 2));
    }
    # 'S'
    if (s[0] == 83) {
        # Need to copy the string part
        local len: int = 0;
        local ptr: string = s + 2;
        loop (ptr[len] != 0) {
            len = len + 1;
        }
        local str: string = malloc(cast<long>(len + 1));
        local i: int = 0;
        loop (i < len) {
            str[i] = ptr[i];
            i = i + 1;
        }
        str[len] = 0;
        return Value.Str(str);
    }
    # 'B'
    if (s[0] == 66) {
        return Value.Bool(atoi(s + 2) != 0);
    }
    return Value.Null;
}
frame value_to_string(v: *Value) ret string {
    local res: string = "";
    match (v[0]) {
        Value.Int(i) => {
            local buf: *void = malloc(32);
            sprintf(cast<string>(buf), "%d", i);
            res = cast<string>(buf);
        },
        Value.Str(s) => {
            res = s;
        },
        Value.Bool(b) => {
            if (b)
                res = "true";
            else
                res = "false";
        },
        Value.Null => {
            res = "NULL";
        },
    };
    return res;
}

frame data_kind(kind: DataType) ret int {return match(kind) {DataType.Int => 0, DataType.Str => 1, DataType.Bool => 2, };}
