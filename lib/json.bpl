# JSON library with Reflection support

export [JSON];
export [JsonToResult];
export [JsonParseResult];

import [String] from "std/string.bpl";
import [UTF8] from "std/utf8.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [TypeInfo], [FieldInfo], [MethodInfo], {TYPE_KIND_PRIMITIVE}, {TYPE_KIND_STRUCT}, {TYPE_KIND_ARRAY}, {TYPE_KIND_POINTER}, {TYPE_KIND_ENUM} from "std/reflection.bpl";

extern malloc(size: long) ret string;
extern free(ptr: string) ret void;
extern strcmp(s1: string, s2: string) ret int;
extern sprintf(str: string, format: string, ...) ret int;
extern snprintf(str: string, size: long, format: string, ...) ret int;
extern printf(fmt: string, ...) ret int;

extern strlen(s: string) ret int;
extern memset(dest: string, val: int, n: long) ret string;
extern strncmp(s1: string, s2: string, n: long) ret int;
extern memcpy(dest: string, src: string, n: long) ret string;

enum JsonToResult {
    Result(string),
    Ignore,
    Default,
}

enum JsonParseResult {
    Success,
    Ignore,
    Default,
}

export [Jsonable];
spec Jsonable {
    frame toJson(this: *Self) ret JsonToResult;
    frame fromJson(json: string, dest: *Self) ret JsonParseResult;
}

struct JsonParser {
    src: string,
    pos: int,
    len: int,
    has_error: bool,
    error_msg: string,

    frame new(s: string) ret JsonParser {
        local p: JsonParser;
        p.src = s;
        p.pos = 0;
        p.len = strlen(s);
        p.has_error = false;
        p.error_msg = nullptr;
        return p;
    }

    frame fail(this: *JsonParser, msg: string) {
        if (this.has_error == false) {
            this.has_error = true;
            this.error_msg = msg;
        }
    }

    frame peek(this: *JsonParser) ret char {
        if (this.pos >= this.len) {
            return cast<char>(0);
        }
        return this.src[this.pos];
    }

    frame next(this: *JsonParser) ret char {
        local c: char = this.peek();
        if (this.pos < this.len) {
            this.pos = this.pos + 1;
        }
        return c;
    }

    frame skipWs(this: *JsonParser) {
        loop (this.pos < this.len) {
            local c: char = this.src[this.pos];
            if ((c == cast<char>(32)) || (c == cast<char>(10)) || (c == cast<char>(13)) || (c == cast<char>(9))) {
                # space, \n, \r, \t
                this.pos = this.pos + 1;
            } else {
                return;
            }
        }
    }

    frame expect(this: *JsonParser, expected: char) ret bool {
        this.skipWs();
        if (this.peek() == expected) {
            this.next();
            return true;
        }
        # Generic error for now
        this.fail("Unexpected character");
        return false;
    }

    frame parseHex4(this: *JsonParser) ret u32 {
        local value: u32 = 0;
        loop (local i: int = 0; i < 4; i = i + 1) {
            if (this.pos >= this.len) {
                this.fail("Incomplete Unicode escape");
                return 0;
            }
            local c: int = cast<int>(this.next());
            local digit: int = -1;
            if ((c >= 48) && (c <= 57)) {
                digit = c - 48;
            } else if ((c >= 65) && (c <= 70)) {
                digit = (c - 65) + 10;
            } else if ((c >= 97) && (c <= 102)) {
                digit = (c - 97) + 10;
            }
            if (digit < 0) {
                this.fail("Invalid hexadecimal digit in Unicode escape");
                return 0;
            }
            value = (value << 4) | cast<u32>(digit);
        }
        return value;
    }

    frame parseString(this: *JsonParser) ret string {
        this.skipWs();
        if (this.peek() != cast<char>(34)) {
            this.fail("Expected quote");
            return nullptr;
        }
        # "
        this.next(); # skip "

        # Max length is remaining string length
        local remaining: int = this.len - this.pos;
        local res: string = malloc(cast<long>(remaining + 1));
        local idx: int = 0;

        loop (this.pos < this.len) {
            local c: char = this.src[this.pos];
            if (c == cast<char>(34)) {
                # "
                # Found end
                res[idx] = cast<char>(0);
                this.next(); # consume "
                return res;
            } else if (c == cast<char>(92)) {
                # \ (backslash)
                this.next(); # consume \
                local esc: char = this.next();
                if (esc == cast<char>(34)) {
                    res[idx] = cast<char>(34); # "
                } else if (esc == cast<char>(92)) {
                    res[idx] = cast<char>(92); # \
                } else if (esc == cast<char>(47)) {
                    res[idx] = cast<char>(47); # /
                } else if (esc == cast<char>(98)) {
                    res[idx] = cast<char>(8); # \b
                } else if (esc == cast<char>(102)) {
                    res[idx] = cast<char>(12); # \f
                } else if (esc == cast<char>(110)) {
                    res[idx] = cast<char>(10); # \n
                } else if (esc == cast<char>(114)) {
                    res[idx] = cast<char>(13); # \r
                } else if (esc == cast<char>(116)) {
                    res[idx] = cast<char>(9); # \t
                } else if (esc == cast<char>(117)) {
                    local codepoint: u32 = this.parseHex4();
                    if (this.has_error) {
                        free(res);
                        return nullptr;
                    }
                    if ((codepoint >= cast<u32>(0xD800)) && (codepoint <= cast<u32>(0xDBFF))) {
                        if ((this.next() != cast<char>(92)) || (this.next() != cast<char>(117))) {
                            this.fail("High surrogate requires a low surrogate escape");
                            free(res);
                            return nullptr;
                        }
                        local low: u32 = this.parseHex4();
                        if (this.has_error) {
                            free(res);
                            return nullptr;
                        }
                        if ((low < cast<u32>(0xDC00)) || (low > cast<u32>(0xDFFF))) {
                            this.fail("Invalid low surrogate");
                            free(res);
                            return nullptr;
                        }
                        codepoint = cast<u32>(0x10000) + ((codepoint - cast<u32>(0xD800)) << 10) + (low - cast<u32>(0xDC00));
                    } else if ((codepoint >= cast<u32>(0xDC00)) && (codepoint <= cast<u32>(0xDFFF))) {
                        this.fail("Unexpected low surrogate");
                        free(res);
                        return nullptr;
                    }
                    if (codepoint == cast<u32>(0)) {
                        this.fail("JSON string cannot contain U+0000 in a null-terminated string");
                        free(res);
                        return nullptr;
                    }
                    idx = idx + UTF8.encodeCodepoint(codepoint, cast<*u8>(&res[idx]));
                    continue;
                } else {
                    this.fail("Invalid string escape");
                    free(res);
                    return nullptr;
                }
            } else {
                if (cast<u8>(c) < cast<u8>(32)) {
                    this.fail("Unescaped control character in string");
                    free(res);
                    return nullptr;
                }
                res[idx] = c;
                this.next();
            }
            idx = idx + 1;
        }

        this.fail("Unterminated string");
        free(res);
        return nullptr;
    }

    frame parseInt(this: *JsonParser) ret int {
        this.skipWs();
        local sign: int = 1;
        if (this.peek() == cast<char>(45)) {
            # -
            sign = -1;
            this.next();
        }
        local has_digits: bool = false;
        local val: int = 0;
        loop (this.pos < this.len) {
            local c: char = this.peek();
            if ((c < cast<char>(48)) || (c > cast<char>(57))) {
                break;
            }
            val = (val * 10) + (cast<int>(c) - 48);
            has_digits = true;
            this.next();
        }

        if (has_digits == false) {
            this.fail("Expected number");
        }
        return val * sign;
    }

    frame parseBool(this: *JsonParser) ret bool {
        this.skipWs();
        if (this.peek() == cast<char>(116)) {
            # t
            # Check r, u, e
            this.next();
            if ((this.next() == cast<char>(114)) && (this.next() == cast<char>(117)) && (this.next() == cast<char>(101))) {
                return true;
            }
            this.fail("Expected true");
            return false;
        }
        # f
        if (this.peek() == cast<char>(102)) {
            # Check a, l, s, e
            this.next();
            if ((this.next() == cast<char>(97)) && (this.next() == cast<char>(108)) && (this.next() == cast<char>(115)) && (this.next() == cast<char>(101))) {
                return false;
            }
            this.fail("Expected false");
            return false;
        }
        this.fail("Expected boolean");
        return false;
    }

    # Validate and consume one JSON number without converting its value.
    frame skipNumber(this: *JsonParser) {
        if (this.peek() == '-') {
            this.next();
        }
        local c: char = this.peek();
        if (c == '0') {
            this.next();
            c = this.peek();
            if ((c >= '0') && (c <= '9')) {
                this.fail("Leading zero in number");
                return;
            }
        } else if ((c >= '1') && (c <= '9')) {
            loop ((this.peek() >= '0') && (this.peek() <= '9')) {
                this.next();
            }
        } else {
            this.fail("Expected number");
            return;
        }
        if (this.peek() == '.') {
            this.next();
            if ((this.peek() < '0') || (this.peek() > '9')) {
                this.fail("Expected fraction digits");
                return;
            }
            loop ((this.peek() >= '0') && (this.peek() <= '9')) {
                this.next();
            }
        }
        if ((this.peek() == 'e') || (this.peek() == 'E')) {
            this.next();
            if ((this.peek() == '+') || (this.peek() == '-')) {
                this.next();
            }
            if ((this.peek() < '0') || (this.peek() > '9')) {
                this.fail("Expected exponent digits");
                return;
            }
            loop ((this.peek() >= '0') && (this.peek() <= '9')) {
                this.next();
            }
        }
    }

    frame parseNull(this: *JsonParser) {
        if ((this.next() != 'n') || (this.next() != 'u') || (this.next() != 'l') || (this.next() != 'l')) {
            this.fail("Expected null");
        }
    }

    # Consume a container separator. True means another value is required.
    frame nextElement(this: *JsonParser, close: char) ret bool {
        if (this.has_error) {
            return false;
        }
        this.skipWs();
        if (this.peek() == close) {
            this.next();
            return false;
        }
        if (this.peek() != ',') {
            this.fail("Expected comma or closing delimiter");
            return false;
        }
        this.next();
        this.skipWs();
        if ((this.peek() == close) || (this.pos >= this.len)) {
            this.fail("Expected value after comma");
            return false;
        }
        return true;
    }

    frame skipValue(this: *JsonParser) {
        if (this.has_error) {
            return;
        }
        this.skipWs();
        local c: char = this.peek();
        if ((c == '{') || (c == '[')) {
            local close: char = ']';
            if (c == '{') {
                close = '}';
            }
            this.next();
            this.skipWs();
            if (this.peek() == close) {
                this.next();
                return;
            }
            loop {
                if (c == '{') {
                    local key: string = this.parseString();
                    if (key != nullptr) {
                        free(key);
                    }
                    if (this.has_error || !this.expect(':')) {
                        return;
                    }
                }
                this.skipValue();
                if (!this.nextElement(close)) {
                    return;
                }
            }
        }
        if (c == '"') {
            local value: string = this.parseString();
            if (value != nullptr) {
                free(value);
            }
        } else if ((c == 't') || (c == 'f')) {
            this.parseBool();
        } else if (c == 'n') {
            this.parseNull();
        } else if ((c == '-') || ((c >= '0') && (c <= '9'))) {
            this.skipNumber();
        } else {
            this.fail("Expected JSON value");
        }
    }

    frame extractValue(this: *JsonParser) ret string {
        this.skipWs();
        local start: int = this.pos;
        this.skipValue();
        if (this.has_error) {
            return nullptr;
        }
        local end: int = this.pos;
        local len: int = end - start;
        if (len <= 0) {
            return nullptr;
        }
        local s: string = malloc(cast<long>(len + 1));
        local srcInfo: ulong = cast<ulong>(this.src) + cast<ulong>(start);
        memcpy(s, cast<string>(cast<*char>(srcInfo)), cast<long>(len));
        s[len] = cast<char>(0);
        return s;
    }
}

struct JSON {
    # Generic entry point for serializing any object to JSON
    frame stringify<T>(obj: *T) ret String {
        local sb: StringBuilder = StringBuilder.newDefault();
        local ptr: ulong = cast<ulong>(obj);
        local info: *TypeInfo = typeof<T>();

        JSON.serializeAny(&sb, ptr, info);

        local res: String = String.new(sb.buffer);
        sb.destroy();
        return res;
    }

    # Recursive serialization helper
    frame serializeAny(sb: *StringBuilder, ptr: ulong, info: *TypeInfo) {
        # Check for user-defined serialization hook (toJson)
        if (info.kind == TYPE_KIND_STRUCT) {
            local i: int = 0;
            loop (i < info.num_methods) {
                local m: MethodInfo = info.methods[i];
                if ((strncmp(m.name, "toJson", 6) == 0) && (strlen(m.name) == 6)) {
                    local funcPtr: *void = m.func_ptr;
                    if (funcPtr != nullptr) {
                        # Call toJson(this). Note: Frame context generic signature
                        local f: Func<JsonToResult>(*void) = cast<Func<JsonToResult>(*void)>(funcPtr);
                        local res: JsonToResult = f(cast<*void>(ptr));

                        local handled: bool = false;
                        match (res) {
                            JsonToResult.Result(s) => {
                                sb.append(s);
                                handled = true;
                            },
                            JsonToResult.Ignore => {
                                sb.append("null");
                                handled = true;
                            },
                            JsonToResult.Default => {
                                # Fallthrough
                            },
                        };
                        if (handled) {
                            return;
                        }
                        break;
                    }
                }
                i = i + 1;
            }
        }
        if (info.kind == TYPE_KIND_PRIMITIVE) {
            JSON.serializePrimitive(sb, ptr, info);
        } else {
            if (info.kind == TYPE_KIND_STRUCT) {
                # Duck Typing: Check if this struct is actually an "Array<T>"
                if (JSON.isDynamicArray(info)) {
                    JSON.serializeDynamicArray(sb, ptr, info);
                } else {
                    JSON.serializeStruct(sb, ptr, info);
                }
            } else {
                if (info.kind == TYPE_KIND_ARRAY) {
                    JSON.serializeArray(sb, ptr, info);
                } else {
                    if (info.kind == TYPE_KIND_POINTER) {
                        JSON.serializePointer(sb, ptr, info);
                    } else {
                        if (info.kind == TYPE_KIND_ENUM) {
                            JSON.serializeEnum(sb, ptr, info);
                        } else {
                            sb.append("null");
                        }
                    }
                }
            }
        }
    }

    frame serializeEnum(sb: *StringBuilder, ptr: ulong, info: *TypeInfo) {
        # Assume tag is 4 bytes (int) at ptr (standard for simple enums)
        local tag: int = *cast<*int>(ptr);

        local i: int = 0;
        loop (i < info.num_fields) {
            local field: FieldInfo = info.fields[i];
            if (cast<long>(field.offset) == cast<long>(tag)) {
                sb.appendChar(cast<char>(34)); # "
                sb.append(field.name);
                sb.appendChar(cast<char>(34)); # "
                return;
            }
            i = i + 1;
        }

        # Fallback if unknown tag
        sb.append("null");
    }

    frame serializePrimitive(sb: *StringBuilder, ptr: ulong, info: *TypeInfo) {
        if ((strcmp(info.name, "int") == 0) || (strcmp(info.name, "i32") == 0)) {
            # Load int value from pointer
            local val: int = *cast<*int>(ptr);
            sb.appendInt(val);
        } else {
            if (strcmp(info.name, "bool") == 0) {
                local b: bool = *cast<*bool>(ptr);
                if (b) {
                    sb.append("true");
                } else {
                    sb.append("false");
                }
            } else {
                if (strcmp(info.name, "string") == 0) {
                    # string is a primitive in BPL (char*)
                    # cast ulong ptr to **char (pointer to char*) to avoid string cast restrictions
                    local s_addr: **char = cast<**char>(ptr);
                    local s: string = cast<string>(*s_addr);

                    sb.appendChar(cast<char>(34)); # "
                    if (s != nullptr) {
                        local len: int = strlen(s);
                        local k: int = 0;
                        loop (k < len) {
                            local ch: char = s[k];
                            # Escape special chars
                            if (ch == cast<char>(34)) {
                                # "
                                sb.append("\\\"");
                            } else {
                                if (ch == cast<char>(92)) {
                                    # \
                                    sb.append("\\\\");
                                } else {
                                    if (ch == cast<char>(10)) {
                                        # \n
                                        sb.append("\\n");
                                    } else {
                                        if (ch == cast<char>(13)) {
                                            # \r
                                            sb.append("\\r");
                                        } else {
                                            if (ch == cast<char>(9)) {
                                                # \t
                                                sb.append("\\t");
                                            } else if (ch == cast<char>(8)) {
                                                sb.append("\\b");
                                            } else if (ch == cast<char>(12)) {
                                                sb.append("\\f");
                                            } else if (cast<u8>(ch) < cast<u8>(32)) {
                                                local digits: string = "0123456789abcdef";
                                                local byte: int = cast<int>(cast<u8>(ch));
                                                sb.append("\\u00");
                                                sb.appendChar(digits[byte >> 4]);
                                                sb.appendChar(digits[byte & 15]);
                                            } else {
                                                sb.appendChar(ch);
                                            }
                                        }
                                    }
                                }
                            }
                            k = k + 1;
                        }
                    }
                    # "
                    sb.appendChar(cast<char>(34));
                } else {
                    if ((strcmp(info.name, "float") == 0) || (strcmp(info.name, "double") == 0) || (strcmp(info.name, "f64") == 0)) {
                        local f: float = *cast<*float>(ptr);
                        # JSON has no NaN/infinity literals. Match the null fallback
                        # used for values without a JSON representation.
                        local bits: ulong = *cast<*ulong>(&f);
                        local exponentMask: ulong = cast<ulong>(0x7ff0000000000000);
                        if ((bits & exponentMask) == exponentMask) {
                            sb.append("null");
                        } else {
                            # 17 significant digits round-trip binary64; scientific
                            # notation bounds even maximum finite values well below 64 bytes.
                            local bytes: char[64];
                            local buf: string = cast<string>(&bytes[0]);
                            local written: int = snprintf(buf, 64, "%.17g", f);
                            if ((written < 0) || (written >= 64)) { sb.append("null"); }
                            else { sb.append(buf); }
                        }
                    } else {
                        if ((strcmp(info.name, "long") == 0) || (strcmp(info.name, "i64") == 0)) {
                            local l: long = *cast<*long>(ptr);
                            local buf2: string = malloc(64);
                            sprintf(buf2, "%ld", l);
                            sb.append(buf2);
                            free(buf2);
                        } else {
                            if (strcmp(info.name, "bool") == 0) {
                                local b: bool = *cast<*bool>(ptr);
                                if (b) {
                                    sb.append("true");
                                } else {
                                    sb.append("false");
                                }
                            } else {
                                # Unknown primitive
                                sb.append("null");
                            }
                        }
                    }
                }
            }
        }
    }

    # Dynamic arrays must have the expected reflected storage fields.
    frame isDynamicArray(info: *TypeInfo) ret bool {
        if ((strcmp(info.name, "Array") != 0) && (strncmp(info.name, "Array_", 6) != 0)) {
            return false;
        }
        local hasData: bool = false;
        local hasLength: bool = false;
        local hasCapacity: bool = false;
        loop (local i: int = 0; i < info.num_fields; i = i + 1) {
            local f: FieldInfo = info.fields[i];
            if (strcmp(f.name, "data") == 0) {
                hasData = (f.type_info.kind == TYPE_KIND_POINTER) && (f.type_info.element_type != nullptr);
            }
            if (strcmp(f.name, "length") == 0) {
                hasLength = (strcmp(f.type_info.name, "int") == 0) || (strcmp(f.type_info.name, "i32") == 0);
            }
            if (strcmp(f.name, "capacity") == 0) {
                hasCapacity = (strcmp(f.type_info.name, "int") == 0) || (strcmp(f.type_info.name, "i32") == 0);
            }
        }
        return hasData && hasLength && hasCapacity;
    }

    frame serializeDynamicArray(sb: *StringBuilder, ptr: ulong, info: *TypeInfo) {
        sb.appendChar(cast<char>(91)); # [

        # Read fields: data, length
        local dataOffset: ulong = 0;
        local lenOffset: ulong = 0;
        local elemType: *TypeInfo = nullptr;

        local i: int = 0;
        loop (i < info.num_fields) {
            local f: FieldInfo = info.fields[i];
            if (strcmp(f.name, "data") == 0) {
                dataOffset = f.offset;
                elemType = f.type_info.element_type;
            }
            if (strcmp(f.name, "length") == 0) {
                lenOffset = f.offset;
            }
            i = i + 1;
        }

        if (elemType != nullptr) {
            # Get data pointer and length
            local dataPtr: ulong = *cast<*ulong>(ptr + dataOffset);
            local count: int = *cast<*int>(ptr + lenOffset);

            local k: int = 0;
            loop (k < count) {
                if (k > 0) {
                    sb.appendChar(cast<char>(44)); # ,
                    sb.appendChar(cast<char>(32)); # space
                }
                local elemAddr: ulong = dataPtr + (cast<ulong>(k) * elemType.size);
                JSON.serializeAny(sb, elemAddr, elemType);
                k = k + 1;
            }
        }
        # ]
        sb.appendChar(cast<char>(93));
    }

    frame serializeStruct(sb: *StringBuilder, ptr: ulong, info: *TypeInfo) {
        sb.appendChar(cast<char>(123)); # {
        local i: int = 0;
        loop (i < info.num_fields) {
            if (i > 0) {
                sb.appendChar(cast<char>(44)); # ,
                sb.appendChar(cast<char>(32)); # space
            }
            local f: FieldInfo = info.fields[i];

            sb.appendChar(cast<char>(34)); # "
            sb.append(f.name);
            sb.appendChar(cast<char>(34)); # "
            sb.appendChar(cast<char>(58)); # :
            sb.appendChar(cast<char>(32)); # space

            local fieldPtr: ulong = ptr + f.offset;
            JSON.serializeAny(sb, fieldPtr, f.type_info);

            i = i + 1;
        }
        sb.appendChar(cast<char>(125)); # }
    }

    frame serializePointer(sb: *StringBuilder, ptr: ulong, info: *TypeInfo) {
        # ptr is address of the pointer variable (e.g. &ptrToInt)
        # We need to load the value of the pointer (e.g. ptrToInt)
        local subPtr: ulong = *cast<*ulong>(ptr);

        if (subPtr == 0) {
            sb.append("null");
        } else {
            # Recurse: We pass the pointer value as the address of the object
            JSON.serializeAny(sb, subPtr, info.element_type);
        }
    }

    frame serializeArray(sb: *StringBuilder, ptr: ulong, info: *TypeInfo) {
        sb.appendChar(cast<char>(91)); # [

        # Determine array length.
        # For fixed arrays (e.g. int[3]), info.size is total bytes.
        local elemSize: ulong = info.element_type.size;
        local count: ulong = 0;
        if (elemSize > 0) {
            count = info.size / elemSize;
        }
        local k: int = 0;
        loop (cast<ulong>(k) < count) {
            if (k > 0) {
                sb.appendChar(cast<char>(44)); # ,
                sb.appendChar(cast<char>(32)); # space
            }
            # For arrays, elements are contiguous in memory.
            # ptr points to start of array.
            local elemAddr: ulong = ptr + (cast<ulong>(k) * elemSize);
            JSON.serializeAny(sb, elemAddr, info.element_type);
            k = k + 1;
        }
        sb.appendChar(cast<char>(93)); # ]
    }

    # Helper to parse (and allocate)
    frame parse<T>(s: string) ret *T {
        local p: JsonParser = JsonParser.new(s);
        local info: *TypeInfo = typeof<T>();

        # Safe allocation (zeroed)
        local ptr: ulong = cast<ulong>(malloc(info.size));
        memset(cast<string>(cast<*char>(ptr)), 0, info.size);

        JSON.parseAny(&p, ptr, info);

        p.skipWs();
        if ((!p.has_error) && (p.pos != p.len)) {
            p.fail("Unexpected trailing input");
        }
        if (p.has_error) {
            # Clean up partial allocation
            JSON.freeAny(ptr, info);
            free(cast<string>(cast<*char>(ptr)));

            # Calculate Line/Col
            local line: int = 1;
            local col: int = 1;
            local i: int = 0;
            loop ((i < p.pos) && (i < p.len)) {
                if (s[i] == cast<char>(10)) {
                    line = line + 1;
                    col = 1;
                } else {
                    col = col + 1;
                }
                i = i + 1;
            }

            printf("JSON Parse Error: %s at line %d, column %d\n", p.error_msg, line, col);
            return nullptr;
        }
        return cast<*T>(ptr);
    }

    # Generic free for objects created by JSON.parse
    frame free<T>(obj: *T) {
        if (obj == nullptr) {
            return;
        }
        local info: *TypeInfo = typeof<T>();
        local ptr: ulong = cast<ulong>(obj);

        JSON.freeAny(ptr, info);

        # Free the root object itself
        free(cast<string>(cast<*char>(ptr)));
    }

    frame freeAny(ptr: ulong, info: *TypeInfo) {
        if (ptr == 0) {
            return;
        }
        if (info.kind == TYPE_KIND_PRIMITIVE) {
            if (strcmp(info.name, "string") == 0) {
                # string is *char, so ptr is **char
                local sPtr: *string = cast<*string>(cast<*void>(ptr));
                if (*sPtr != nullptr) {
                    free(*sPtr);
                    *sPtr = nullptr;
                }
            }
            return;
        }
        if (info.kind == TYPE_KIND_STRUCT) {
            # Check for Array<T>
            if (JSON.isDynamicArray(info)) {
                JSON.freeDynamicArray(ptr, info);
                return;
            }
            local i: int = 0;
            loop (i < info.num_fields) {
                local f: FieldInfo = info.fields[i];
                JSON.freeAny(ptr + f.offset, f.type_info);
                i = i + 1;
            }
            return;
        }
        if (info.kind == TYPE_KIND_ARRAY) {
            # Fixed Array T[N]
            local elemSize: ulong = info.element_type.size;
            local count: ulong = 0;
            if (elemSize > 0) {
                count = info.size / elemSize;
            }
            local k: int = 0;
            loop (cast<ulong>(k) < count) {
                JSON.freeAny(ptr + (cast<ulong>(k) * elemSize), info.element_type);
                k = k + 1;
            }
            return;
        }
        if (info.kind == TYPE_KIND_POINTER) {
            # ptr is address of pointer field (*T)
            # Load the actual pointer value
            local subPtr: ulong = *cast<*ulong>(ptr);
            if (subPtr != 0) {
                # Free the content
                JSON.freeAny(subPtr, info.element_type);
                # Free the container
                free(cast<string>(cast<*char>(subPtr)));
                # Nullify
                *cast<*ulong>(ptr) = 0;
            }
            return;
        }
    }

    frame freeDynamicArray(ptr: ulong, info: *TypeInfo) {
        local dataOffset: ulong = 0;
        local lenOffset: ulong = 0;
        local elemType: *TypeInfo = nullptr;

        local i: int = 0;
        loop (i < info.num_fields) {
            local f: FieldInfo = info.fields[i];
            if (strcmp(f.name, "data") == 0) {
                # data is *T (primitive ptr) -> element_type is T
                elemType = f.type_info.element_type;
                dataOffset = f.offset;
            }
            if (strcmp(f.name, "length") == 0) {
                lenOffset = f.offset;
            }
            i = i + 1;
        }

        if (elemType == nullptr) {
            return;
        }
        local buffer: ulong = *cast<*ulong>(ptr + dataOffset);
        local count: int = *cast<*int>(ptr + lenOffset);

        if (buffer != 0) {
            local k: int = 0;
            loop (k < count) {
                JSON.freeAny(buffer + (cast<ulong>(k) * elemType.size), elemType);
                k = k + 1;
            }
            free(cast<string>(cast<*char>(buffer)));
        }
    }

    frame parseAny(p: *JsonParser, ptr: ulong, info: *TypeInfo) {
        if (p.has_error) {
            return;
        }
        # Check for user-defined fromJson
        if (info.kind == TYPE_KIND_STRUCT) {
            local i: int = 0;
            loop (i < info.num_methods) {
                local m: MethodInfo = info.methods[i];
                if ((strncmp(m.name, "fromJson", 8) == 0) && (strlen(m.name) == 8)) {
                    local funcPtr: *void = m.func_ptr;
                    if (funcPtr != nullptr) {
                        local rawJson: string = p.extractValue();
                        if (rawJson != nullptr) {
                            # Call static fromJson(json, dest)
                            local f: Func<JsonParseResult>(string, *void) = cast<Func<JsonParseResult>(string, *void)>(funcPtr);
                            local res: JsonParseResult = f(rawJson, cast<*void>(ptr));

                            local handled: bool = false;
                            match (res) {
                                JsonParseResult.Success => {
                                    free(rawJson);
                                    handled = true;
                                },
                                JsonParseResult.Ignore => {
                                    free(rawJson);
                                    handled = true;
                                },
                                JsonParseResult.Default => {
                                    # Parse the extracted string
                                    local subP: JsonParser = JsonParser.new(rawJson);
                                    JSON.parseDefault(&subP, ptr, info);
                                    if (subP.has_error) {
                                        p.fail(subP.error_msg);
                                    }
                                    free(rawJson);
                                    handled = true;
                                },
                            };
                            if (handled) {
                                return;
                            }
                        }
                    }
                }
                i = i + 1;
            }
        }
        JSON.parseDefault(p, ptr, info);
    }

    # Bypass only the current type's hook; nested values still use parseAny.
    frame parseDefault(p: *JsonParser, ptr: ulong, info: *TypeInfo) {
        if (p.has_error) {
            return;
        }
        if (info.kind == TYPE_KIND_PRIMITIVE) {
            JSON.parsePrimitive(p, ptr, info);
        } else {
            if (info.kind == TYPE_KIND_STRUCT) {
                # Duck Typing: Check if this struct is actually an "Array<T>"
                if (JSON.isDynamicArray(info)) {
                    JSON.parseDynamicArray(p, ptr, info);
                } else {
                    JSON.parseStruct(p, ptr, info);
                }
            } else {
                if (info.kind == TYPE_KIND_ARRAY) {
                    JSON.parseArray(p, ptr, info);
                } else {
                    if (info.kind == TYPE_KIND_ENUM) {
                        JSON.parseEnum(p, ptr, info);
                    } else {
                        if (info.kind == TYPE_KIND_POINTER) {
                            JSON.parsePointer(p, ptr, info);
                        } else {
                            p.fail("Unsupported JSON destination type");
                        }
                    }
                }
            }
        }
    }

    frame parsePrimitive(p: *JsonParser, ptr: ulong, info: *TypeInfo) {
        if ((strcmp(info.name, "int") == 0) || (strcmp(info.name, "i32") == 0)) {
            local val: int = p.parseInt();
            *cast<*int>(ptr) = val;
        } else {
            if (strcmp(info.name, "string") == 0) {
                local s: string = p.parseString();
                # cast ptr (ulong) to **char (pointer to string slot)
                *cast<**char>(ptr) = cast<*char>(s);
            } else {
                if (strcmp(info.name, "bool") == 0) {
                    local b: bool = p.parseBool();
                    *cast<*bool>(ptr) = b;
                } else {
                    p.fail("Unsupported JSON primitive type");
                }
            }
        }
    }

    frame parseStruct(p: *JsonParser, ptr: ulong, info: *TypeInfo) {
        if (p.expect(cast<char>(123)) == false) {
            return; # {
        }
        loop {
            p.skipWs();
            if (p.peek() == cast<char>(125)) {
                # }
                p.next();
                break;
            }
            local key: string = p.parseString();
            if (key == nullptr) {
                return;
            }
            if (p.expect(cast<char>(58)) == false) {
                free(key);
                return; # :
            }
            # Find field
            local found: bool = false;
            local i: int = 0;
            loop (i < info.num_fields) {
                local f: FieldInfo = info.fields[i];
                if (strcmp(key, f.name) == 0) {
                    JSON.parseAny(p, ptr + f.offset, f.type_info);
                    found = true;
                    break;
                }
                i = i + 1;
            }

            if (found == false) {
                # Skip unknown field
                p.skipValue();
            }
            free(key);

            if (!p.nextElement('}')) {
                return;
            }
        }
    }

    frame parseArray(p: *JsonParser, ptr: ulong, info: *TypeInfo) {
        if (!p.expect('[')) {
            return;
        }
        local elemSize: ulong = info.element_type.size;
        if (elemSize == 0) {
            p.fail("Unsupported zero-size array element");
            return;
        }
        local maxCount: ulong = info.size / elemSize;
        local count: ulong = 0;
        p.skipWs();
        if (p.peek() == ']') {
            p.next();
            return;
        }
        loop {
            if (count >= maxCount) {
                p.fail("Too many fixed-array elements");
                return;
            }
            local start: int = p.pos;
            JSON.parseAny(p, ptr + (count * elemSize), info.element_type);
            if (p.has_error) {
                return;
            }
            if (p.pos <= start) {
                p.fail("Array parser made no progress");
                return;
            }
            count = count + 1;
            if (!p.nextElement(']')) {
                return;
            }
        }
    }

    frame parseEnum(p: *JsonParser, ptr: ulong, info: *TypeInfo) {
        local valStr: string = p.parseString();
        if (valStr == nullptr) {
            return;
        }
        local i: int = 0;
        loop (i < info.num_fields) {
            local f: FieldInfo = info.fields[i];
            if (strcmp(valStr, f.name) == 0) {
                # Found enum variant
                # Assume standard int enum (offset hold tag)
                *cast<*int>(ptr) = cast<int>(f.offset);
                free(valStr);
                return;
            }
            i = i + 1;
        }
        p.fail("Invalid enum variant");
        free(valStr);
    }

    frame parsePointer(p: *JsonParser, ptr: ulong, info: *TypeInfo) {
        p.skipWs();
        if (p.peek() == cast<char>(110)) {
            # n (null)
            p.parseNull();
            *cast<*ulong>(ptr) = 0;
            return;
        }
        # Determine pointee type
        local pointeeInfo: *TypeInfo = info.element_type;

        # Allocate memory for pointee
        local pointeePtr: ulong = cast<ulong>(malloc(pointeeInfo.size));
        memset(cast<string>(cast<*char>(pointeePtr)), 0, pointeeInfo.size);

        # Parse into new memory
        JSON.parseAny(p, pointeePtr, pointeeInfo);

        # Store address in the pointer field
        *cast<*ulong>(ptr) = pointeePtr;
    }

    frame parseDynamicArray(p: *JsonParser, ptr: ulong, info: *TypeInfo) {
        if (p.expect(cast<char>(91)) == false) {
            return; # [
        }
        # 2-Pass: Count then Allocate
        local startPos: int = p.pos;
        local count: int = 0;

        # Validate/count values before allocating. Every iteration consumes a
        # value and separator or returns an error.
        p.skipWs();
        if (p.peek() != ']') {
            loop {
                local start: int = p.pos;
                p.skipValue();
                if (p.has_error) {
                    return;
                }
                if (p.pos <= start) {
                    p.fail("Array scanner made no progress");
                    return;
                }
                count = count + 1;
                if (!p.nextElement(']')) {
                    break;
                }
            }
            if (p.has_error) {
                return;
            }
        }
        # Pass 2: Reset and Parse
        p.pos = startPos;

        # Find element type from "data" field (ptr to T)
        local elemType: *TypeInfo = nullptr;
        local dataOffset: ulong = 0;
        local lenOffset: ulong = 0;
        local capOffset: ulong = 0;

        local i: int = 0;
        loop (i < info.num_fields) {
            local f: FieldInfo = info.fields[i];
            if (strcmp(f.name, "data") == 0) {
                # f.type_info is *int (ptr to T).
                # Its element_type is int (T).
                elemType = f.type_info.element_type;
                dataOffset = f.offset;
            }
            if (strcmp(f.name, "length") == 0) {
                lenOffset = f.offset;
            }
            if (strcmp(f.name, "capacity") == 0) {
                capOffset = f.offset;
            }
            i = i + 1;
        }

        if (elemType == nullptr) {
            p.fail("Could not determine Array<T> element type");
            return;
        }
        # Alloc buffer
        local totalSize: ulong = cast<ulong>(count) * elemType.size;
        local buffer: ulong = 0;
        if (count > 0) {
            buffer = cast<ulong>(malloc(cast<long>(totalSize)));
            memset(cast<string>(cast<*char>(buffer)), 0, totalSize);
        }
        # Set Struct Fields
        *cast<*ulong>(ptr + dataOffset) = buffer;
        *cast<*int>(ptr + lenOffset) = count;
        *cast<*int>(ptr + capOffset) = count;

        local idx: int = 0;
        if (count == 0) {
            p.expect(']');
            return;
        }
        loop (idx < count) {
            p.skipWs();
            local start: int = p.pos;
            local itemAddr: ulong = buffer + (cast<ulong>(idx) * elemType.size);
            JSON.parseAny(p, itemAddr, elemType);
            if (p.has_error) {
                return;
            }
            if (p.pos <= start) {
                p.fail("Array parser made no progress");
                return;
            }
            idx = idx + 1;
            if (!p.nextElement(']')) {
                return;
            }
        }
    }
}
