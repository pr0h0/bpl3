import [Request], [Response] from "bpl-express";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
import [HttpParser] from "bpl-http-parser";
import vary from "./cors.bpl";
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;
extern strncmp(a: string, b: string, count: ulong) ret int;
export [Negotiation];
frame negotiationSlice(text: string, start: long, end: long) ret String {
    if (start > end) {
        start = end;
    }
    loop ((start < end) && ((text[start] == ' ') || (text[start] == '\t'))) {
        start = start + 1;
    }
    loop ((end > start) && ((text[end - 1] == ' ') || (text[end - 1] == '\t'))) {
        end = end - 1;
    }
    local value: String;
    value.data = HttpParser.copy(text, start, end - start);
    value.length = cast<int>(end - start);
    return value;
}
struct Negotiation {
    frame prefix(a: string, b: string, size: int) ret bool {
        loop (local i: int = 0; i < size; i = i + 1) {
            local left: char = a[i];
            local right: char = b[i];
            if ((left >= 'A') && (left <= 'Z')) {
                left = left + cast<char>(32);
            }
            if ((right >= 'A') && (right <= 'Z')) {
                right = right + cast<char>(32);
            }
            if (left != right) {
                return false;
            }
        }
        return true;
    }
    frame weight(text: string) ret int {
        local size: long = strlen(text);
        if ((size == 0) || ((text[0] != '0') && (text[0] != '1'))) {
            return 0;
        }
        local value: int = cast<int>(text[0] - '0') * 1000;
        if (size == 1) {
            return value;
        }
        if ((size > 5) || (text[1] != '.')) {
            return 0;
        }
        local place: int = 100;
        loop (local i: long = 2; i < size; i = i + 1) {
            if ((text[i] < '0') || (text[i] > '9') || ((text[0] == '1') && (text[i] != '0'))) {
                return 0;
            }
            if (text[0] == '0') {
                value = value + (cast<int>(text[i] - '0') * place);
            }
            place = place / 10;
        }
        return value;
    }
    frame parameter(candidate: string, name: string, value: string) ret bool {
        local size: long = strlen(candidate);
        local pos: long = 0;
        loop ((pos < size) && (candidate[pos] != ';')) {
            pos = pos + 1;
        }
        loop (pos < size) {
            pos = pos + 1;
            local end: long = pos;
            local quoted: bool = false;
            loop (end < size) {
                if (candidate[end] == '"') {
                    quoted = !quoted;
                }
                if (!quoted && (candidate[end] == ';')) {
                    break;
                }
                end = end + 1;
            }
            local eq: long = pos;
            loop ((eq < end) && (candidate[eq] != '=')) {
                eq = eq + 1;
            }
            local key: String = negotiationSlice(candidate, pos, eq);
            local keyOwner: *String = &key;
            defer keyOwner.destroy();
            local val: String = negotiationSlice(candidate, eq + 1, end);
            local valOwner: *String = &val;
            defer valOwner.destroy();
            local matches: bool = Response.equalHeader(key.data, name) && ((Response.equalHeader(name, "charset") && Response.equalHeader(val.data, value)) || (strcmp(val.data, value) == 0));
            key.destroy();
            val.destroy();
            if (matches) {
                return true;
            }
            pos = end;
        }
        return false;
    }
    # Specificity overrides quality: an explicit q=0 beats a positive wildcard.
    frame quality(header: string, candidate: string, media: bool) ret int {
        if (header == nullptr) {
            return 1000;
        }
        local size: long = strlen(header);
        if (size == 0) {
            return 0;
        }
        local candidateEnd: long = 0;
        loop ((candidate[candidateEnd] != 0) && (candidate[candidateEnd] != ';')) {
            candidateEnd = candidateEnd + 1;
        }
        local offered: String = negotiationSlice(candidate, 0, candidateEnd);
        local offeredOwner: *String = &offered;
        defer offeredOwner.destroy();
        local best: int = -1;
        local specificity: int = -1;
        local pos: long = 0;
        loop (pos < size) {
            local end: long = pos;
            local quoted: bool = false;
            loop (end < size) {
                if ((header[end] == '\\') && quoted) {
                    end = end + 2;
                    continue;
                }
                if (header[end] == '"') {
                    quoted = !quoted;
                }
                if (!quoted && (header[end] == ',')) {
                    break;
                }
                end = end + 1;
            }
            if (end > size) {
                end = size;
            }
            local semicolon: long = pos;
            loop ((semicolon < end) && (header[semicolon] != ';')) {
                semicolon = semicolon + 1;
            }
            local range: String = negotiationSlice(header, pos, semicolon);
            local rangeOwner: *String = &range;
            defer rangeOwner.destroy();
            local score: int = -1;
            if (Response.equalHeader(range.data, offered.data)) {
                score = 20000;
            }
            if ((!media && (strcmp(range.data, "*") == 0)) || (media && (strcmp(range.data, "*/*") == 0))) {
                score = 0;
            }
            if (media && (range.length >= 2) && (range.data[range.length - 1] == '*') && (range.data[range.length - 2] == '/')) {
                local prefix: int = range.length - 1;
                if ((offered.length >= prefix) && Negotiation.prefix(range.data, offered.data, prefix)) {
                    score = 10000;
                }
            }
            local weight: int = 1000;
            local params: bool = true;
            local afterQ: bool = false;
            local cursor: long = semicolon;
            loop (cursor < end) {
                cursor = cursor + 1;
                local finish: long = cursor;
                local inQuotes: bool = false;
                loop (finish < end) {
                    if (header[finish] == '"') {
                        inQuotes = !inQuotes;
                    }
                    if (!inQuotes && (header[finish] == ';')) {
                        break;
                    }
                    finish = finish + 1;
                }
                local eq: long = cursor;
                loop ((eq < finish) && (header[eq] != '=')) {
                    eq = eq + 1;
                }
                local key: String = negotiationSlice(header, cursor, eq);
                local keyOwner: *String = &key;
                defer keyOwner.destroy();
                local value: String = negotiationSlice(header, eq + 1, finish);
                local valueOwner: *String = &value;
                defer valueOwner.destroy();
                if (Response.equalHeader(key.data, "q")) {
                    if (afterQ) {
                        weight = 0;
                    } else {
                        weight = Negotiation.weight(value.data);
                    }
                    afterQ = true;
                } else if (!afterQ) {
                    if (!media || !Negotiation.parameter(candidate, key.data, value.data)) {
                        params = false;
                    } else if (score >= 0) {
                        score = score + 1;
                    }
                }
                key.destroy();
                value.destroy();
                cursor = finish;
            }
            range.destroy();
            if (params && (score >= 0) && ((score > specificity) || ((score == specificity) && (weight > best)))) {
                specificity = score;
                best = weight;
            }
            pos = end + 1;
        }
        if (best < 0) {
            return 0;
        }
        return best;
    }
    frame accepts(req: *Request, media: string) ret bool {
        local header: Option<string> = req.header("accept");
        if (!header.isSome()) {
            return true;
        }
        return Negotiation.quality(header.unwrap(), media, true) > 0;
    }
    frame best(req: *Request, offers: *Array<string>) ret Option<string> {
        local quality: int = 0;
        local result: Option<string> = Option<string>.None;
        local header: Option<string> = req.header("accept");
        loop (local i: int = 0; i < offers.len(); i = i + 1) {
            local offer: string = offers.get(i);
            local score: int = 1000;
            if (header.isSome()) {
                score = Negotiation.quality(header.unwrap(), offer, true);
            }
            if (score > quality) {
                quality = score;
                result = Option<string>.Some(offer);
            }
        }
        return result;
    }
    frame require(req: *Request, res: *Response, media: string) ret bool {
        vary(res, "Accept");
        if (!Negotiation.accepts(req, media)) {
            res.status(406).json("{\"error\":\"representation not acceptable\"}");
            return false;
        }
        return true;
    }
    frame encoding(req: *Request, name: string) ret int {
        local header: Option<string> = req.header("accept-encoding");
        if (!header.isSome()) {
            if (strcmp(name, "identity") == 0) {
                return 1000;
            }
            return 0;
        }
        if (strcmp(name, "identity") == 0) {
            # Identity is implicitly acceptable unless explicitly excluded (or *=0).
            local raw: string = header.unwrap();
            local size: long = strlen(raw);
            local pos: long = 0;
            local explicit: bool = false;
            loop (pos < size) {
                local end: long = pos;
                loop ((end < size) && (raw[end] != ',') && (raw[end] != ';')) {
                    end = end + 1;
                }
                local item: String = negotiationSlice(raw, pos, end);
                explicit = explicit || Response.equalHeader(item.data, "identity");
                item.destroy();
                loop ((end < size) && (raw[end] != ',')) {
                    end = end + 1;
                }
                pos = end + 1;
            }
            if (explicit) {
                return Negotiation.quality(raw, name, false);
            }
            if (Negotiation.quality(raw, "*", false) == 0) {
                pos = 0;
                loop (pos < size) {
                    local end: long = pos;
                    loop ((end < size) && (raw[end] != ',') && (raw[end] != ';')) {
                        end = end + 1;
                    }
                    local item: String = negotiationSlice(raw, pos, end);
                    local wildcard: bool = strcmp(item.data, "*") == 0;
                    item.destroy();
                    if (wildcard) {
                        return 0;
                    }
                    loop ((end < size) && (raw[end] != ',')) {
                        end = end + 1;
                    }
                    pos = end + 1;
                }
            }
            return 1000;
        }
        return Negotiation.quality(header.unwrap(), name, false);
    }
}
