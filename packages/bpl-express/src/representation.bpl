import [Request], [Response], [HttpMethod] from "./http.bpl";
import [HttpHeaders] from "bpl-http-parser";
import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
import [Date], [DateTime] from "std/date.bpl";
import sprintf, strlen, strcmp, strncmp from "./libc.bpl";
export [Representation];
export [HttpDate];
export [ByteRange];
extern strncasecmp(a: string, b: string, size: ulong) ret int;
struct ByteRange {
    valid: bool,
    satisfiable: bool,
    start: long,
    length: long,
}
struct HttpDate {
    frame number(text: string, start: int, count: int) ret int {
        local value: int = 0;
        loop (local i: int = 0; i < count; i = i + 1) {
            local c: char = text[start + i];
            if ((c < '0') || (c > '9')) {
                return -1;
            }
            value = (value * 10) + cast<int>(c - '0');
        }
        return value;
    }
    frame month(text: string) ret int {
        local names: string = "JanFebMarAprMayJunJulAugSepOctNovDec";
        loop (local i: int = 0; i < 12; i = i + 1) {
            if (strncmp(text, names + (i * 3), 3) == 0) {
                return i + 1;
            }
        }
        return 0;
    }
    frame parse(text: string) ret Option<long> {
        if (text == nullptr) {
            return Option<long>.None;
        }
        local size: long = cast<long>(strlen(text));
        local date: DateTime = DateTime.new(0, 0, 0, 0, 0, 0);
        local weekday: int = -1;
        local shortDays: string = "SunMonTueWedThuFriSat";
        local longDays: string[7] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        if ((size == 29) && (text[3] == ',') && (text[4] == ' ') && (text[7] == ' ') && (text[11] == ' ') && (text[16] == ' ') && (text[19] == ':') && (text[22] == ':') && (strcmp(text + 25, " GMT") == 0)) {
            loop (local i: int = 0; i < 7; i = i + 1) {
                if (strncmp(text, shortDays + (i * 3), 3) == 0) {
                    weekday = i;
                }
            }
            date = DateTime.new(HttpDate.number(text, 12, 4), HttpDate.month(text + 8), HttpDate.number(text, 5, 2), HttpDate.number(text, 17, 2), HttpDate.number(text, 20, 2), HttpDate.number(text, 23, 2));
        } else if ((size == 24) && (text[3] == ' ') && (text[7] == ' ') && (text[10] == ' ') && (text[13] == ':') && (text[16] == ':') && (text[19] == ' ')) {
            loop (local i: int = 0; i < 7; i = i + 1) {
                if (strncmp(text, shortDays + (i * 3), 3) == 0) {
                    weekday = i;
                }
            }
            local day: int = HttpDate.number(text, 8, 2);
            if (text[8] == ' ') {
                day = HttpDate.number(text, 9, 1);
            }
            date = DateTime.new(HttpDate.number(text, 20, 4), HttpDate.month(text + 4), day, HttpDate.number(text, 11, 2), HttpDate.number(text, 14, 2), HttpDate.number(text, 17, 2));
        } else {
            local comma: int = 0;
            loop ((cast<long>(comma) < size) && (text[comma] != ',')) {
                comma = comma + 1;
            }
            if ((cast<long>(comma + 24) != size) || (text[comma + 1] != ' ')) {
                return Option<long>.None;
            }
            loop (local i: int = 0; i < 7; i = i + 1) {
                if ((cast<long>(strlen(longDays[i])) == cast<long>(comma)) && (strncmp(text, longDays[i], cast<ulong>(comma)) == 0)) {
                    weekday = i;
                }
            }
            local start: int = comma + 2;
            if ((text[start + 2] != '-') || (text[start + 6] != '-') || (text[start + 9] != ' ') || (text[start + 12] != ':') || (text[start + 15] != ':') || (strcmp(text + start + 18, " GMT") != 0)) {
                return Option<long>.None;
            }
            local now: DateTime = DateTime.now();
            local year: int = HttpDate.number(text, start + 7, 2);
            if (year < 0) {
                return Option<long>.None;
            }
            year = ((now.year / 100) * 100) + year;
            if (year > (now.year + 50)) {
                year = year - 100;
            }
            date = DateTime.new(year, HttpDate.month(text + start + 3), HttpDate.number(text, start, 2), HttpDate.number(text, start + 10, 2), HttpDate.number(text, start + 13, 2), HttpDate.number(text, start + 16, 2));
        }
        if ((weekday < 0) || !date.isValid()) {
            return Option<long>.None;
        }
        return Option<long>.Some(date.toTimestamp());
    }
    frame format(timestamp: long) ret String {
        local date: DateTime = DateTime.fromTimestamp(timestamp);
        if ((date.year < 0) || (date.year > 9999)) {
            throw "HTTP date year out of range";
        }
        local weekdays: string = "SunMonTueWedThuFriSat";
        local months: string = "JanFebMarAprMayJunJulAugSepOctNovDec";
        local day: long = timestamp / 86400;
        if ((timestamp % 86400) < 0) {
            day = day - 1;
        }
        local weekday: int = cast<int>((day + 4) % 7);
        if (weekday < 0) {
            weekday = weekday + 7;
        }
        local bytes: char[64];
        sprintf(cast<string>(&bytes[0]), "%.3s, %02d %.3s %04d %02d:%02d:%02d GMT", weekdays + (weekday * 3), date.day, months + ((date.month - 1) * 3), date.year, date.hour, date.minute, date.second);
        return String.new(cast<string>(&bytes[0]));
    }
}
struct Representation {
    # Weak content validator: non-cryptographic, never an authorization primitive.
    frame tag(data: string, size: long) ret String {
        local hash: ulong = 14695981039346656037;
        loop (local i: long = 0; i < size; i = i + 1) {
            hash = (hash ^ cast<ulong>(cast<u8>(data[i]))) * 1099511628211;
        }
        local bytes: char[64];
        sprintf(cast<string>(&bytes[0]), "W/\"%016lx-%ld\"", hash, size);
        return String.new(cast<string>(&bytes[0]));
    }
    frame tagMatches(list: string, tag: string, strong: bool) ret bool {
        if (list == nullptr) {
            return false;
        }
        local size: long = cast<long>(strlen(list));
        local pos: long = 0;
        local matched: bool = false;
        local seen: bool = false;
        loop (pos < size) {
            loop ((pos < size) && ((list[pos] == ' ') || (list[pos] == '\t') || (list[pos] == ','))) {
                pos = pos + 1;
            }
            if ((pos < size) && (list[pos] == '*')) {
                pos = pos + 1;
                loop ((pos < size) && ((list[pos] == ' ') || (list[pos] == '\t'))) {
                    pos = pos + 1;
                }
                return !seen && (pos == size);
            }
            if (tag == nullptr) {
                return false;
            }
            local start: long = pos;
            local weak: bool = false;
            if (((pos + 2) < size) && (list[pos] == 'W') && (list[pos + 1] == '/')) {
                weak = true;
                pos = pos + 2;
            }
            if ((pos >= size) || (list[pos] != '"')) {
                return false;
            }
            pos = pos + 1;
            loop ((pos < size) && (list[pos] != '"')) {
                local octet: uint = cast<uint>(cast<u8>(list[pos]));
                if ((octet < 33) || (octet == 127)) {
                    return false;
                }
                pos = pos + 1;
            }
            if (pos == size) {
                return false;
            }
            pos = pos + 1;
            local tagWeak: bool = strncmp(tag, "W/", 2) == 0;
            local candidate: string = list + start;
            local length: long = pos - start;
            local target: string = tag;
            if (!strong) {
                if (weak) {
                    candidate = candidate + 2;
                    length = length - 2;
                }
                if (tagWeak) {
                    target = target + 2;
                }
            }
            if ((!strong || (!weak && !tagWeak)) && (cast<long>(strlen(target)) == length) && (strncmp(candidate, target, cast<ulong>(length)) == 0)) {
                matched = true;
            }
            seen = true;
            loop ((pos < size) && ((list[pos] == ' ') || (list[pos] == '\t'))) {
                pos = pos + 1;
            }
            if ((pos < size) && (list[pos] != ',')) {
                return false;
            }
        }
        return matched;
    }
    frame digits(text: string, start: long, end: long) ret long {
        if (start == end) {
            return -1;
        }
        local value: long = 0;
        loop (local i: long = start; i < end; i = i + 1) {
            if ((text[i] < '0') || (text[i] > '9')) {
                return -1;
            }
            local digit: long = cast<long>(text[i] - '0');
            if (value > ((9223372036854775807 - digit) / 10)) {
                return -1;
            }
            value = (value * 10) + digit;
        }
        return value;
    }
    # Single byte range. Invalid/multiple ranges are ignored with a full response.
    frame range(value: string, size: long) ret ByteRange {
        local result: ByteRange;
        result.valid = false;
        result.satisfiable = false;
        result.start = 0;
        result.length = 0;
        if ((value == nullptr) || (size < 0) || (strncasecmp(value, "bytes=", 6) != 0)) {
            return result;
        }
        local end: long = cast<long>(strlen(value));
        local dash: long = 6;
        loop ((dash < end) && (value[dash] != '-')) {
            dash = dash + 1;
        }
        if (dash == end) {
            return result;
        }
        local first: long = Representation.digits(value, 6, dash);
        local last: long = Representation.digits(value, dash + 1, end);
        if (dash == 6) {
            if (last < 0) {
                return result;
            }
            result.valid = true;
            if ((last == 0) || (size == 0)) {
                return result;
            }
            if (last > size) {
                last = size;
            }
            result.start = size - last;
            result.length = last;
            result.satisfiable = true;
            return result;
        }
        if ((first < 0) || (((dash + 1) < end) && (last < 0))) {
            return result;
        }
        if ((dash + 1) == end) {
            last = size - 1;
        }
        if ((last < first) && ((dash + 1) < end)) {
            return result;
        }
        result.valid = true;
        if ((first >= size) || (size == 0)) {
            return result;
        }
        if (last >= size) {
            last = size - 1;
        }
        result.start = first;
        result.length = (last - first) + 1;
        result.satisfiable = true;
        return result;
    }
    frame send(req: *Request, res: *Response, data: string, size: long, etag: string, modified: long) {
        if ((size < 0) || ((size > 0) && (data == nullptr))) {
            throw "Invalid representation buffer";
        }
        res.head_only = req.method == HttpMethod.HEAD;
        if (etag != nullptr) {
            res.setHeader("ETag", etag);
        }
        if (modified >= 0) {
            local date: String = HttpDate.format(modified);
            local owner: *String = &date;
            defer owner.destroy();
            res.setHeader("Last-Modified", date.data);
        }
        local get: bool = (req.method == HttpMethod.GET) || (req.method == HttpMethod.HEAD);
        local matchTag: Option<string> = req.header("if-match");
        if (matchTag.isSome() && !Representation.tagMatches(matchTag.unwrap(), etag, true)) {
            res.status(412).end();
            return;
        }
        local unchanged: Option<string> = req.header("if-unmodified-since");
        if (!matchTag.isSome() && unchanged.isSome() && (modified >= 0)) {
            local date: Option<long> = HttpDate.parse(unchanged.unwrap());
            if (date.isSome() && (modified > date.unwrap())) {
                res.status(412).end();
                return;
            }
        }
        local none: Option<string> = req.header("if-none-match");
        if (none.isSome() && Representation.tagMatches(none.unwrap(), etag, false)) {
            if (get) {
                res.status(304).end();
            } else {
                res.status(412).end();
            }
            return;
        }
        local since: Option<string> = req.header("if-modified-since");
        if (get && !none.isSome() && since.isSome() && (modified >= 0)) {
            local date: Option<long> = HttpDate.parse(since.unwrap());
            if (date.isSome() && (modified <= date.unwrap())) {
                res.status(304).end();
                return;
            }
        }
        res.setHeader("Accept-Ranges", "bytes");
        local range: Option<string> = req.header("range");
        if ((req.method == HttpMethod.GET) && range.isSome()) {
            local useRange: bool = true;
            local condition: Option<string> = req.header("if-range");
            if (condition.isSome()) {
                local value: string = condition.unwrap();
                if ((value[0] == '"') || (strncmp(value, "W/", 2) == 0)) {
                    useRange = (etag != nullptr) && (strncmp(etag, "W/", 2) != 0) && (value[0] == '"') && (strcmp(value, etag) == 0);
                } else {
                    local date: Option<long> = HttpDate.parse(value);
                    useRange = date.isSome() && (modified >= 0) && (modified <= date.unwrap());
                }
            }
            if (useRange) {
                local part: ByteRange = Representation.range(range.unwrap(), size);
                if (part.valid) {
                    local bytes: char[128];
                    if (!part.satisfiable) {
                        sprintf(cast<string>(&bytes[0]), "bytes */%ld", size);
                        res.status(416).setHeader("Content-Range", cast<string>(&bytes[0])).end();
                        return;
                    }
                    sprintf(cast<string>(&bytes[0]), "bytes %ld-%ld/%ld", part.start, (part.start + part.length) - 1, size);
                    res.status(206).setHeader("Content-Range", cast<string>(&bytes[0])).sendBytes(data + part.start, part.length);
                    return;
                }
            }
        }
        res.sendBytes(data, size);
    }
}
