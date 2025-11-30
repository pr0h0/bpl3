import malloc, free, printf from "./libc.x";

frame strlen(s: *u8) ret u64 {
    local len: u64 = 0;
    loop {
        if *s == 0 {
            break;
        }
        len = len + 1;
        s = s + 1;
    }
    return len;
}

frame strcpy(dest: *u8, src: *u8) ret *u8 {
    local d: *u8 = dest;
    loop {
        if *src == 0 {
            break;
        }
        *d = *src;
        d = d + 1;
        src = src + 1;
    }
    *d = 0;
    return dest;
}

frame strcat(dest: *u8, src: *u8) ret *u8 {
    local d: *u8 = dest;
    loop {
        if *d == 0 {
            break;
        }
        d = d + 1;
    }
    loop {
        if *src == 0 {
            break;
        }
        *d = *src;
        d = d + 1;
        src = src + 1;
    }
    *d = 0;
    return dest;
}

frame strcmp(s1: *u8, s2: *u8) ret i32 {
    loop {
        if *s1 == 0 {
            break;
        }
        if *s1 != *s2 {
            local v1: i32 = *s1;
            local v2: i32 = *s2;
            return v1 - v2;
        }
        s1 = s1 + 1;
        s2 = s2 + 1;
    }
    local v1_end: i32 = *s1;
    local v2_end: i32 = *s2;
    return v1_end - v2_end;
}

frame strdup(s: *u8) ret *u8 {
    local len: u64 = call strlen(s);
    local new_s: *u8 = call malloc(len + 1);
    call strcpy(new_s, s);
    return new_s;
}

# String builder struct
struct StringBuilder {
    buffer: *u8,
    length: u64,
    capacity: u64,
}

frame sb_create() ret *StringBuilder {
    local sb: *StringBuilder = call malloc(24); # 8 + 8 + 8
    sb.capacity = 16;
    sb.length = 0;
    sb.buffer = call malloc(sb.capacity);
    *sb.buffer = 0;
    return sb;
}

frame sb_append(sb: *StringBuilder, s: *u8) {
    local len: u64 = call strlen(s);
    if sb.length + len >= sb.capacity {
        local new_cap: u64 = (sb.capacity + len) * 2;
        local new_buf: *u8 = call malloc(new_cap);
        call strcpy(new_buf, sb.buffer);
        call free(sb.buffer);
        sb.buffer = new_buf;
        sb.capacity = new_cap;
    }
    call strcat(sb.buffer, s);
    sb.length = sb.length + len;
}

frame sb_to_string(sb: *StringBuilder) ret *u8 {
    return call strdup(sb.buffer);
}

frame sb_destroy(sb: *StringBuilder) {
    call free(sb.buffer);
    call free(sb);
}

export strlen;
export strcpy;
export strcat;
export strcmp;
export strdup;
export [StringBuilder];
export sb_create;
export sb_append;
export sb_to_string;
export sb_destroy;
