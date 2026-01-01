export [DataType];
export [Value];
export [ValueType];
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
frame serialize_value(v: *Value) ret string {
    local buf: string = malloc(256);
    match (v[0]) {
        Value.Int(i) => sprintf(buf, "I:%d", i),
        Value.Str(s) => sprintf(buf, "S:%s", s),
        Value.Bool(b) => sprintf(buf, "B:%d", b),
        Value.Null => sprintf(buf, "N"),
    };
    return buf;
}

extern atoi(s: string) ret int;

frame deserialize_value(s: string) ret Value {
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
