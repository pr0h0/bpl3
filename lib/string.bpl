# String standard library

import [Comparable], [Equatable], [Destructible], [Cloneable], [Hashable] from "std/core_specs.bpl";

export [String];

extern sprintf(str: string, format: string, ...) ret int;
extern strlen(s: string) ret int;
extern strcpy(dst: string, src: string) ret string;
extern strcmp(s1: string, s2: string) ret int;
extern strcat(dst: string, src: string) ret string;
extern malloc(size: long) ret string;
extern free(ptr: string) ret void;

struct String: Comparable<String>, Cloneable<String>, Destructible, Hashable<String> {
    data: string,
    length: int,
    frame new(text: string) ret String {
        local s: String;
        if (text == nullptr) {
            s.data = nullptr;
            s.length = 0;
            return s;
        }
        local len: int = strlen(text);
        s.length = len;
        s.data = malloc(cast<long>(len + 1));
        strcpy(s.data, text);
        return s;
    }

    frame new(this: *String) ret *String {
        this.data = nullptr;
        this.length = 0;
        return this;
    }

    frame hash(this: *String) ret u64 {
        local h: u64 = 0xcbf29ce484222325;
        local p: u64 = 0x100000001b3;
        local ptr: *u8 = cast<*u8>(this.data);
        local i: int = 0;
        loop (i < this.length) {
            local c: u8 = ptr[i];
            h = h ^ cast<u64>(c);
            h = h * p;
            i = i + 1;
        }
        return h;
    }

    frame destroy(this: *String) {
        if (this.data != nullptr) {
            free(this.data);
            this.data = nullptr;
        }
        this.length = 0;
    }

    frame toString(this: *String) ret string {
        return this.data;
    }

    frame assign(this: *String, text: string) {
        this.destroy();
        local newStr: String = String.new(text);
        this.data = newStr.data;
        this.length = newStr.length;
    }

    # Returns true when the string has no characters.
    frame isEmpty(this: String) ret bool {
        return this.length == 0;
    }

    # Create a deep copy of this string.
    frame clone(this: *String) ret String {
        if (this.data == nullptr) {
            return String.new(nullptr);
        }
        return String.new(this.data);
    }

    frame includes(this: *String, substr: string) ret bool {
        if ((this.data == nullptr) || (substr == nullptr)) {
            return false;
        }
        local substrLen: int = strlen(substr);
        if ((substrLen == 0) || (substrLen > this.length)) {
            return false;
        }
        local i: int = 0;
        loop (i <= (this.length - substrLen)) {
            local found: bool = true;
            local j: int = 0;
            loop (j < substrLen) {
                if (*(this.data + cast<long>(i + j)) != *(substr + cast<long>(j))) {
                    found = false;
                    break;
                }
                j = j + 1;
            }
            if (found) {
                return true;
            }
            i = i + 1;
        }
        return false;
    }

    # Comparable implementation
    frame __eq__(this: *String, other: *String) ret bool {
        if (this.data == other.data) {
            return true;
        }
        if ((this.data == nullptr) || (other.data == nullptr)) {
            return false;
        }
        return strcmp(this.data, other.data) == 0;
    }

    frame __ne__(this: *String, other: *String) ret bool {
        return !this.__eq__(other);
    }

    frame __lt__(this: *String, other: *String) ret bool {
        if (this.data == nullptr) {
            return other.data != nullptr; # null is less than anything else
        }
        if (other.data == nullptr) {
            return false;
        }
        return strcmp(this.data, other.data) < 0;
    }

    frame __gt__(this: *String, other: *String) ret bool {
        if (this.data == nullptr) {
            return false;
        }
        if (other.data == nullptr) {
            return true;
        }
        return strcmp(this.data, other.data) > 0;
    }

    frame __le__(this: *String, other: *String) ret bool {
        return !this.__gt__(other);
    }

    frame __ge__(this: *String, other: *String) ret bool {
        return !this.__lt__(other);
    }

    # Operator overloading: String concatenation with +
    frame __add__(this: *String, other: String) ret String {
        if (this.data == nullptr) {
            return other.clone();
        }
        if (other.data == nullptr) {
            return this.clone();
        }
        local newLen: int = this.length + other.length;
        local newData: string = malloc(cast<long>(newLen + 1));
        strcpy(newData, this.data);
        strcat(newData, other.data);
        local result: String;
        result.data = newData;
        result.length = newLen;
        return result;
    }

    # Operator overloading: String concatenation with + (string literal overload)
    # Allows: str + "literal" without needing String.new()
    frame __add__(this: *String, other: string) ret String {
        local otherStr: String = String.new(other);
        local result: String = this.__add__(otherStr);
        otherStr.destroy();
        return result;
    }

    # Operator overloading: String equality with ==
    frame __eq__(this: *String, other: String) ret bool {
        if ((this.data == nullptr) && (other.data == nullptr)) {
            return true;
        }
        if ((this.data == nullptr) || (other.data == nullptr)) {
            return false;
        }
        if (this.length != other.length) {
            return false;
        }
        return strcmp(this.data, other.data) == 0;
    }

    # Operator overloading: String inequality with !=
    frame __ne__(this: *String, other: String) ret bool {
        return !this.__eq__(other);
    }

    # Operator overloading: String less than with <
    frame __lt__(this: *String, other: String) ret bool {
        if ((this.data == nullptr) || (other.data == nullptr)) {
            return false;
        }
        return strcmp(this.data, other.data) < 0;
    }

    # Operator overloading: String less than or equal with <=
    frame __le__(this: *String, other: String) ret bool {
        if ((this.data == nullptr) || (other.data == nullptr)) {
            return false;
        }
        return strcmp(this.data, other.data) <= 0;
    }

    # Operator overloading: String greater than with >
    frame __gt__(this: *String, other: String) ret bool {
        if ((this.data == nullptr) || (other.data == nullptr)) {
            return false;
        }
        return strcmp(this.data, other.data) > 0;
    }

    # Operator overloading: String greater than or equal with >=
    frame __ge__(this: *String, other: String) ret bool {
        if ((this.data == nullptr) || (other.data == nullptr)) {
            return false;
        }
        return strcmp(this.data, other.data) >= 0;
    }

    # Operator overloading: In-place concatenation with <<
    # Usage: str << "text" modifies str in place and returns it
    frame __lshift__(this: *String, other: String) ret String {
        if (other.data == nullptr) {
            return *this;
        }
        if (this.data == nullptr) {
            local newStr: String = other.clone();
            this.data = newStr.data;
            this.length = newStr.length;
            return *this;
        }
        local newLen: int = this.length + other.length;
        local newData: string = malloc(cast<long>(newLen + 1));
        strcpy(newData, this.data);
        strcat(newData, other.data);
        free(this.data);
        this.data = newData;
        this.length = newLen;
        return *this;
    }

    # Operator overloading: In-place concatenation with << (string literal overload)
    # Allows: str << "literal" without needing String.new()
    frame __lshift__(this: *String, other: string) ret String {
        local otherStr: String = String.new(other);
        local result: String = this.__lshift__(otherStr);
        otherStr.destroy();
        return result;
    }

    frame fromInt(val: long) ret String {
        local buf: string = malloc(32); # Enough for 64-bit int
        sprintf(buf, "%ld", val);
        local s: String;
        s.data = buf;
        s.length = strlen(buf);
        return s;
    }

    frame fromAddress(addr: long) ret String {
        local buf: string = malloc(32); # Enough for 64-bit hex
        sprintf(buf, "%#lx", addr);
        local s: String;
        s.data = buf;
        s.length = strlen(buf);
        return s;
    }
}
