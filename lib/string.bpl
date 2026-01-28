# String standard library

import [Comparable], [Equatable], [Destructible], [Cloneable], [Hashable] from "std/core_specs.bpl";
import [Array] from "std/array.bpl";

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

    # Operator overloading: String equality with == (string literal overload)
    frame __eq__(this: *String, other: string) ret bool {
        if ((this.data == nullptr) && (other == nullptr)) {
            return true;
        }
        if ((this.data == nullptr) || (other == nullptr)) {
            return false;
        }
        return strcmp(this.data, other) == 0;
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

    frame get(this: *String, index: int) ret char {
        if ((index < 0) || (index >= this.length)) {
            return cast<char>(0);
        }
        local ptr: *u8 = cast<*u8>(this.data);
        return cast<char>(ptr[index]);
    }

    frame substring(this: *String, start: int, len: int) ret String {
        local s: String;
        if ((start < 0) || (start >= this.length)) {
            return String.new("");
        }
        if (len <= 0) {
            return String.new("");
        }
        local realLen: int = len;
        if ((start + realLen) > this.length) {
            realLen = this.length - start;
        }
        local buf: string = malloc(cast<long>(realLen + 1));
        local ptr: *u8 = cast<*u8>(this.data);
        local dest: *u8 = cast<*u8>(buf);
        local i: int = 0;
        loop (i < realLen) {
            dest[i] = ptr[start + i];
            i = i + 1;
        }
        dest[realLen] = cast<u8>(0);

        s.data = cast<string>(dest);
        s.length = realLen;
        return s;
    }

    frame cstr(this: *String) ret string {
        return this.data;
    }

    frame split(this: *String, delimiter: char) ret Array<String> {
        local res: Array<String> = Array<String>.new(10);
        if (this.length == 0) {
            return res;
        }
        local start: int = 0;
        local i: int = 0;

        loop (i < this.length) {
            if (this.get(i) == delimiter) {
                local part: String = this.substring(start, i - start);
                res.push(part);
                start = i + 1;
            }
            i = i + 1;
        }

        # Add the last part
        if (start <= this.length) {
            local part: String = this.substring(start, this.length - start);
            res.push(part);
        }
        return res;
    }

    # ============ Additional String Methods ============

    # Trim whitespace from both ends
    frame trim(this: *String) ret String {
        if ((this.data == nullptr) || (this.length == 0)) {
            return String.new("");
        }
        local start: int = 0;
        local end: int = this.length - 1;

        # Find first non-whitespace
        loop (start < this.length) {
            local c: char = this.get(start);
            if ((c != 32) && (c != 9) && (c != 10) && (c != 13)) 
                break;
            start = start + 1;
        }

        # Find last non-whitespace
        loop (end >= start) {
            local c: char = this.get(end);
            if ((c != 32) && (c != 9) && (c != 10) && (c != 13)) 
                break;
            end = end - 1;
        }

        if (start > end) {
            return String.new("");
        }
        return this.substring(start, (end - start) + 1);
    }

    # Trim whitespace from left side only
    frame trimLeft(this: *String) ret String {
        if ((this.data == nullptr) || (this.length == 0)) {
            return String.new("");
        }
        local start: int = 0;
        loop (start < this.length) {
            local c: char = this.get(start);
            if ((c != 32) && (c != 9) && (c != 10) && (c != 13)) 
                break;
            start = start + 1;
        }

        return this.substring(start, this.length - start);
    }

    # Trim whitespace from right side only
    frame trimRight(this: *String) ret String {
        if ((this.data == nullptr) || (this.length == 0)) {
            return String.new("");
        }
        local end: int = this.length - 1;
        loop (end >= 0) {
            local c: char = this.get(end);
            if ((c != 32) && (c != 9) && (c != 10) && (c != 13)) 
                break;
            end = end - 1;
        }

        return this.substring(0, end + 1);
    }

    # Check if string starts with prefix
    frame startsWith(this: *String, prefix: string) ret bool {
        if ((this.data == nullptr) || (prefix == nullptr)) 
            return false;
        local prefixLen: int = strlen(prefix);
        if (prefixLen > this.length) 
            return false;
        if (prefixLen == 0) 
            return true;
        local i: int = 0;
        loop (i < prefixLen) {
            if (this.get(i) != prefix[i]) 
                return false;
            i = i + 1;
        }
        return true;
    }

    # Check if string ends with suffix
    frame endsWith(this: *String, suffix: string) ret bool {
        if ((this.data == nullptr) || (suffix == nullptr)) 
            return false;
        local suffixLen: int = strlen(suffix);
        if (suffixLen > this.length) 
            return false;
        if (suffixLen == 0) 
            return true;
        local offset: int = this.length - suffixLen;
        local i: int = 0;
        loop (i < suffixLen) {
            if (this.get(offset + i) != suffix[i]) 
                return false;
            i = i + 1;
        }
        return true;
    }

    # Convert to uppercase
    frame toUpper(this: *String) ret String {
        if ((this.data == nullptr) || (this.length == 0)) {
            return String.new("");
        }
        local buf: string = malloc(cast<long>(this.length + 1));
        local i: int = 0;
        loop (i < this.length) {
            local c: char = this.get(i);
            # Convert a-z to A-Z
            if ((c >= 97) && (c <= 122)) {
                buf[i] = cast<char>(cast<int>(c) - 32);
            } else {
                buf[i] = c;
            }
            i = i + 1;
        }
        buf[this.length] = cast<char>(0);

        local result: String;
        result.data = buf;
        result.length = this.length;
        return result;
    }

    # Convert to lowercase
    frame toLower(this: *String) ret String {
        if ((this.data == nullptr) || (this.length == 0)) {
            return String.new("");
        }
        local buf: string = malloc(cast<long>(this.length + 1));
        local i: int = 0;
        loop (i < this.length) {
            local c: char = this.get(i);
            # Convert A-Z to a-z
            if ((c >= 65) && (c <= 90)) {
                buf[i] = cast<char>(cast<int>(c) + 32);
            } else {
                buf[i] = c;
            }
            i = i + 1;
        }
        buf[this.length] = cast<char>(0);

        local result: String;
        result.data = buf;
        result.length = this.length;
        return result;
    }

    # Repeat string n times
    frame repeat(this: *String, count: int) ret String {
        if ((this.data == nullptr) || (this.length == 0) || (count <= 0)) {
            return String.new("");
        }
        local newLen: int = this.length * count;
        local buf: string = malloc(cast<long>(newLen + 1));

        local i: int = 0;
        loop (i < count) {
            local j: int = 0;
            loop (j < this.length) {
                buf[(i * this.length) + j] = this.get(j);
                j = j + 1;
            }
            i = i + 1;
        }
        buf[newLen] = cast<char>(0);

        local result: String;
        result.data = buf;
        result.length = newLen;
        return result;
    }

    # Pad string on the left to reach target length
    frame padLeft(this: *String, targetLen: int, padChar: char) ret String {
        if (this.length >= targetLen) {
            return this.clone();
        }
        local padCount: int = targetLen - this.length;
        local buf: string = malloc(cast<long>(targetLen + 1));

        local i: int = 0;
        loop (i < padCount) {
            buf[i] = padChar;
            i = i + 1;
        }

        local j: int = 0;
        loop (j < this.length) {
            buf[padCount + j] = this.get(j);
            j = j + 1;
        }
        buf[targetLen] = cast<char>(0);

        local result: String;
        result.data = buf;
        result.length = targetLen;
        return result;
    }

    # Pad string on the right to reach target length
    frame padRight(this: *String, targetLen: int, padChar: char) ret String {
        if (this.length >= targetLen) {
            return this.clone();
        }
        local buf: string = malloc(cast<long>(targetLen + 1));

        local i: int = 0;
        loop (i < this.length) {
            buf[i] = this.get(i);
            i = i + 1;
        }

        loop (i < targetLen) {
            buf[i] = padChar;
            i = i + 1;
        }
        buf[targetLen] = cast<char>(0);

        local result: String;
        result.data = buf;
        result.length = targetLen;
        return result;
    }

    # Reverse the string
    frame reverse(this: *String) ret String {
        if ((this.data == nullptr) || (this.length == 0)) {
            return String.new("");
        }
        local buf: string = malloc(cast<long>(this.length + 1));
        local i: int = 0;
        loop (i < this.length) {
            buf[i] = this.get(this.length - 1 - i);
            i = i + 1;
        }
        buf[this.length] = cast<char>(0);

        local result: String;
        result.data = buf;
        result.length = this.length;
        return result;
    }

    # Replace first occurrence of 'old' with 'new'
    frame replace(this: *String, old: string, newStr: string) ret String {
        if ((this.data == nullptr) || (old == nullptr)) {
            return this.clone();
        }
        local oldLen: int = strlen(old);
        local newLen: int = 0;
        if (newStr != nullptr) 
            newLen = strlen(newStr);
        if (oldLen == 0) 
            return this.clone();
        # Find first occurrence
        local pos: int = this.indexOf(old);
        if (pos < 0) 
            return this.clone();
        local resultLen: int = (this.length - oldLen) + newLen;
        local buf: string = malloc(cast<long>(resultLen + 1));

        # Copy before match
        local i: int = 0;
        loop (i < pos) {
            buf[i] = this.get(i);
            i = i + 1;
        }

        # Copy replacement
        local j: int = 0;
        loop (j < newLen) {
            buf[pos + j] = newStr[j];
            j = j + 1;
        }

        # Copy after match
        local k: int = pos + oldLen;
        loop (k < this.length) {
            buf[(pos + newLen) + (k - pos - oldLen)] = this.get(k);
            k = k + 1;
        }
        buf[resultLen] = cast<char>(0);

        local result: String;
        result.data = buf;
        result.length = resultLen;
        return result;
    }

    # Replace all occurrences of 'old' with 'new'
    frame replaceAll(this: *String, old: string, newStr: string) ret String {
        local current: String = this.clone();
        local oldLen: int = strlen(old);
        if (oldLen == 0) 
            return current;
        loop {
            local replaced: String = current.replace(old, newStr);
            if (replaced.__eq__(&current)) {
                replaced.destroy();
                break;
            }
            current.destroy();
            current = replaced;
        }
        return current;
    }

    # Find index of substring
    frame indexOf(this: *String, substr: string) ret int {
        if ((this.data == nullptr) || (substr == nullptr)) 
            return -1;
        local subLen: int = strlen(substr);
        if (subLen == 0) 
            return 0;
        if (subLen > this.length) 
            return -1;
        local i: int = 0;
        loop (i <= (this.length - subLen)) {
            local found: bool = true;
            local j: int = 0;
            loop (j < subLen) {
                if (this.get(i + j) != substr[j]) {
                    found = false;
                    break;
                }
                j = j + 1;
            }
            if (found) 
                return i;
            i = i + 1;
        }
        return -1;
    }

    # Find last index of substring
    frame lastIndexOf(this: *String, substr: string) ret int {
        if ((this.data == nullptr) || (substr == nullptr)) 
            return -1;
        local subLen: int = strlen(substr);
        if (subLen == 0) 
            return this.length;
        if (subLen > this.length) 
            return -1;
        local i: int = this.length - subLen;
        loop (i >= 0) {
            local found: bool = true;
            local j: int = 0;
            loop (j < subLen) {
                if (this.get(i + j) != substr[j]) {
                    found = false;
                    break;
                }
                j = j + 1;
            }
            if (found) 
                return i;
            i = i - 1;
        }
        return -1;
    }

    # Count occurrences of substring
    frame count(this: *String, substr: string) ret int {
        if ((this.data == nullptr) || (substr == nullptr)) 
            return 0;
        local subLen: int = strlen(substr);
        if (subLen == 0) 
            return 0;
        if (subLen > this.length) 
            return 0;
        local cnt: int = 0;
        local i: int = 0;
        loop (i <= (this.length - subLen)) {
            local found: bool = true;
            local j: int = 0;
            loop (j < subLen) {
                if (this.get(i + j) != substr[j]) {
                    found = false;
                    break;
                }
                j = j + 1;
            }
            if (found) {
                cnt = cnt + 1;
                i = i + subLen;
            } else {
                i = i + 1;
            }
        }
        return cnt;
    }

    # Check if string contains only digits
    frame isDigits(this: *String) ret bool {
        if ((this.data == nullptr) || (this.length == 0)) 
            return false;
        local i: int = 0;
        loop (i < this.length) {
            local c: char = this.get(i);
            if ((c < 48) || (c > 57)) 
                return false;
            i = i + 1;
        }
        return true;
    }

    # Check if string contains only alphabetic characters
    frame isAlpha(this: *String) ret bool {
        if ((this.data == nullptr) || (this.length == 0)) 
            return false;
        local i: int = 0;
        loop (i < this.length) {
            local c: char = this.get(i);
            local isLower: bool = (c >= 97) && (c <= 122);
            local isUpper: bool = (c >= 65) && (c <= 90);
            if (!isLower && !isUpper) 
                return false;
            i = i + 1;
        }
        return true;
    }

    # Check if string contains only alphanumeric characters
    frame isAlphanumeric(this: *String) ret bool {
        if ((this.data == nullptr) || (this.length == 0)) 
            return false;
        local i: int = 0;
        loop (i < this.length) {
            local c: char = this.get(i);
            local isDigit: bool = (c >= 48) && (c <= 57);
            local isLower: bool = (c >= 97) && (c <= 122);
            local isUpper: bool = (c >= 65) && (c <= 90);
            if (!isDigit && !isLower && !isUpper) 
                return false;
            i = i + 1;
        }
        return true;
    }
}
