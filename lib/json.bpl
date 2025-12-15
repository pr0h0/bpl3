# JSON (minimal)

export [JSON];

import [String] from "std/string.bpl";
extern malloc(size: i64) ret *char;
extern free(ptr: *char) ret void;

struct JSON {
    frame stringifyInt(n: int) ret String {
        # Convert integer to decimal string
        local neg: bool = false;
        local x: int = n;
        if (x < 0) {
            neg = true;
            x = -x;
        }
        # max 12 digits plus sign
        local tmp: char[16];
        local idx: int = 0;
        if (x == 0) {
            tmp[0] = cast<char>(48);
            idx = 1;
        }
        loop (x > 0) {
            local d: int = x % 10;
            tmp[idx] = cast<char>(48 + d);
            idx = idx + 1;
            x = x / 10;
        }
        local total: int = idx + (neg ? 1 : 0);
        local buf: *char = malloc(cast<i64>(total + 1));
        local i: int = 0;
        if (neg) {
            buf[0] = cast<char>(45);
            i = 1;
        }
        # reverse digits
        local k: int = 0;
        loop (k < idx) {
            buf[i + k] = tmp[idx - 1 - k];
            k = k + 1;
        }
        buf[total] = cast<char>(0);
        local s: String = String.new(buf);
        free(buf);
        return s;
    }

    frame parse(s: string) ret int {
        # Parse decimal int (optional leading '-')
        local ps: *char = cast<*char>(s);
        local i: int = 0;
        local sign: int = 1;
        if (ps[0] == cast<char>(45)) {
            sign = -1;
            i = 1;
        }
        local val: int = 0;
        loop (ps[i] != cast<char>(0)) {
            local c: char = ps[i];
            if ((c < cast<char>(48)) || (c > cast<char>(57))) {
                break;
            }
            val = (val * 10) + (cast<int>(c) - 48);
            i = i + 1;
        }
        return val * sign;
    }
}
