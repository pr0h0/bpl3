frame strlen(str: *u8) ret u64 {
    local len: u64 = 0;
    loop {
        if str[len] == 0 {
            break;
        }
        len = len + 1;
    }
    return len;
}

frame strcpy(dest: *u8, src: *u8) {
    local i: u64 = 0;
    loop {
        dest[i] = src[i];
        if src[i] == 0 {
            break;
        }
        i = i + 1;
    }
}

frame strcat(dest: *u8, src: *u8) {
    local dest_len: u64 = call strlen(dest);
    local i: u64 = 0;
    loop {
        dest[dest_len + i] = src[i];
        if src[i] == 0 {
            break;
        }
        i = i + 1;
    }
}

frame strcmp(s1: *u8, s2: *u8) ret i32 {
    local i: u64 = 0;
    loop {
        if s1[i] != s2[i] {
            return s1[i] - s2[i];
        }
        if s1[i] == 0 {
            return 0;
        }
        i = i + 1;
    }
    return 0;
}

frame streq(s1: *u8, s2: *u8) ret u8 {
    local res: i32 = call strcmp(s1, s2);
    if res == 0 {
        return 1;
    }
    return 0;
}

frame is_digit(c: u8) ret u8 {
    if c >= '0' && c <= '9' {
        return 1;
    }
    return 0;
}

frame is_alpha(c: u8) ret u8 {
    if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') {
        return 1;
    }
    return 0;
}

frame is_space(c: u8) ret u8 {
    if c == 32 || c == 9 || c == 10 || c == 13 {
        return 1;
    }
    return 0;
}

frame to_upper(str: *u8) {
    local i: u64 = 0;
    loop {
        if str[i] == 0 {
            break;
        }
        if str[i] >= 'a' && str[i] <= 'z' {
            str[i] = str[i] - 32;
        }
        i = i + 1;
    }
}

frame to_lower(str: *u8) {
    local i: u64 = 0;
    loop {
        if str[i] == 0 {
            break;
        }
        if str[i] >= 'A' && str[i] <= 'Z' {
            str[i] = str[i] + 32;
        }
        i = i + 1;
    }
}

frame atoi(str: *u8) ret i64 {
    local res: i64 = 0;
    local sign: i64 = 1;
    local i: u64 = 0;

    # Skip whitespace
    loop {
        if call is_space(str[i]) == 0 {
            break;
        }
        i = i + 1;
    }

    if str[i] == '-' {
        sign = -1;
        i = i + 1;
    } else if str[i] == '+' {
        i = i + 1;
    }

    loop {
        if str[i] == 0 {
            break;
        }
        if call is_digit(str[i]) == 0 {
            break;
        }
        res = res * 10 + (str[i] - '0');
        i = i + 1;
    }
    return res * sign;
}

export strlen;
export strcpy;
export strcat;
export strcmp;
export streq;
export is_digit;
export is_alpha;
export is_space;
export to_upper;
export to_lower;
export atoi;


# String struct with methods
struct String {
    data: u8[128],
    length: u64,

    frame len() ret u64 {
        return this.length;
    }

    frame concat(other: *String) {
        local i: u64 = 0;
        loop {
            if i >= other.length {
                break;
            }
            this.data[this.length + i] = other.data[i];
            i = i + 1;
        }
        this.length = this.length + other.length;
        this.data[this.length] = 0;
    }

    frame slice(start: u64, end: u64, dest: *String) {
        local i: u64 = start;
        local j: u64 = 0;
        loop {
            if i >= end {
                break;
            }
            dest.data[j] = this.data[i];
            i = i + 1;
            j = j + 1;
        }
        dest.length = j;
        dest.data[j] = 0;
    }

    frame charAt(index: u64) ret u8 {
        return this.data[index];
    }

    frame setChar(index: u64, c: u8) {
        this.data[index] = c;
    }

    frame equals(other: *String) ret u8 {
        if this.length != other.length {
            return 0;
        }
        local i: u64 = 0;
        loop {
            if i >= this.length {
                break;
            }
            if this.data[i] != other.data[i] {
                return 0;
            }
            i = i + 1;
        }
        return 1;
    }

    frame indexOf(c: u8) ret i64 {
        local i: u64 = 0;
        loop {
            if i >= this.length {
                break;
            }
            if this.data[i] == c {
                return i;
            }
            i = i + 1;
        }
        return -1;
    }
}

export [String];
