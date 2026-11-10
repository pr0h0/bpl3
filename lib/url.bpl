# URL percent-encoding (RFC 3986) and HTML form encoding

export [Url];
export [ParsedUrl];
export [QueryParam];

import [Option] from "std/option.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(str: string) ret long;

frame _urlSlice(text: string, start: long, end: long) ret String {
    local builder: StringBuilder = StringBuilder.new(cast<int>(end - start));
    loop (local i: long = start; i < end; i = i + 1) {
        builder.appendChar(text[i]);
    }
    local result: String;
    result.data = builder.buffer;
    result.length = builder.length;
    return result;
}

frame _urlLower(text: String) ret String {
    loop (local i: int = 0; i < text.length; i = i + 1) {
        local c: char = text.data[i];
        if ((c >= 'A') && (c <= 'Z')) {
            text.data[i] = cast<char>(cast<int>(c) + 32);
        }
    }
    return text;
}

# One decoded `key=value` pair of a query string.
struct QueryParam {
    key: String,
    value: String,
    # Whether the pair had an `=` (so "flag" and "flag=" can be told apart).
    hasValue: bool,
}

/#
    ParsedUrl
    The components of a URI (RFC 3986): `scheme://userinfo@host:port/path?query#fragment`.
    Every part is an owned String (empty when absent); `port` is -1 when no
    port is given. The scheme and host are lower-cased; IPv6 hosts keep their
    brackets off (`[::1]` gives host `::1`). Components are not
    percent-decoded. Release with `destroy`.
#/
struct ParsedUrl {
    scheme: String,
    userinfo: String,
    host: String,
    port: int,
    path: String,
    query: String,
    fragment: String,
    hasAuthority: bool,
    frame destroy(this: *ParsedUrl) {
        this.scheme.destroy();
        this.userinfo.destroy();
        this.host.destroy();
        this.path.destroy();
        this.query.destroy();
        this.fragment.destroy();
    }

    # Releases the parts set so far while parsing.
    frame destroyPartial(this: *ParsedUrl) {
        this.scheme.destroy();
        this.userinfo.destroy();
        this.host.destroy();
    }

    # The port, or the default for http (80), https (443), ws (80), wss
    # (443) and ftp (21); -1 when unknown.
    frame effectivePort(this: *ParsedUrl) ret int {
        if (this.port >= 0) {
            return this.port;
        }
        local scheme: string = this.scheme.data;
        if ((strcmpUrl(scheme, "http") == 0) || (strcmpUrl(scheme, "ws") == 0)) {
            return 80;
        }
        if ((strcmpUrl(scheme, "https") == 0) || (strcmpUrl(scheme, "wss") == 0)) {
            return 443;
        }
        if (strcmpUrl(scheme, "ftp") == 0) {
            return 21;
        }
        return -1;
    }

    # Reassembles the URL. Returns a new String.
    frame toString(this: *ParsedUrl) ret String {
        local out: StringBuilder = StringBuilder.new(64);
        if (this.scheme.length > 0) {
            out.append(this.scheme.data);
            out.appendChar(':');
        }
        if (this.hasAuthority) {
            out.append("//");
            if (this.userinfo.length > 0) {
                out.append(this.userinfo.data);
                out.appendChar('@');
            }
            local ipv6: bool = false;
            loop (local i: int = 0; i < this.host.length; i = i + 1) {
                if (this.host.data[i] == ':') {
                    ipv6 = true;
                }
            }
            if (ipv6) {
                out.appendChar('[');
            }
            out.append(this.host.data);
            if (ipv6) {
                out.appendChar(']');
            }
            if (this.port >= 0) {
                out.appendChar(':');
                out.appendInt(this.port);
            }
        }
        out.append(this.path.data);
        if (this.query.length > 0) {
            out.appendChar('?');
            out.append(this.query.data);
        }
        if (this.fragment.length > 0) {
            out.appendChar('#');
            out.append(this.fragment.data);
        }
        local result: String;
        result.data = out.buffer;
        result.length = out.length;
        return result;
    }
}

frame strcmpUrl(a: string, b: string) ret int {
    local i: long = 0;
    loop ((a[i] != cast<char>(0)) && (a[i] == b[i])) {
        i = i + 1;
    }
    return cast<int>(cast<u8>(a[i])) - cast<int>(cast<u8>(b[i]));
}

# Every result is a newly allocated string the caller must free, or nullptr
# when allocation fails or, for the decoders, when the input is malformed.
struct Url {
    # `text` with every byte except the RFC 3986 unreserved characters
    # (`A`-`Z`, `a`-`z`, `0`-`9`, `-`, `_`, `.`, `~`) written as `%XX`, as for
    # a path segment or query value.
    frame encodeComponent(text: string) ret string {
        return Url.encode(text, false);
    }

    # Like `encodeComponent`, but a space becomes `+`, as in
    # `application/x-www-form-urlencoded` bodies and query strings.
    frame encodeForm(text: string) ret string {
        return Url.encode(text, true);
    }

    # Decodes `%XX` escapes (either case). Returns nullptr for a `%` without
    # two hex digits after it and for `%00`, which would end the string early.
    frame decode(text: string) ret string {
        return Url.decodeWith(text, false);
    }

    # Like `decode`, but `+` also becomes a space.
    frame decodeForm(text: string) ret string {
        return Url.decodeWith(text, true);
    }

    frame isUnreserved(c: int) ret bool {
        return ((c >= 65) && (c <= 90)) || ((c >= 97) && (c <= 122)) || ((c >= 48) && (c <= 57)) || (c == 45) || (c == 95) || (c == 46) || (c == 126);
    }

    frame hexValue(c: int) ret int {
        if ((c >= 48) && (c <= 57)) {
            return c - 48;
        }
        if ((c >= 65) && (c <= 70)) {
            return c - 55;
        }
        if ((c >= 97) && (c <= 102)) {
            return c - 87;
        }
        return -1;
    }

    frame encode(text: string, spaceAsPlus: bool) ret string {
        local length: long = 0;
        if (text != nullptr) {
            length = strlen(text);
        }
        # At most three output bytes per input byte.
        local output: *u8 = cast<*u8>(malloc((length * 3) + 1));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        local hexChars: *u8 = cast<*u8>("0123456789ABCDEF");
        local used: long = 0;
        local i: long = 0;
        loop (i < length) {
            local c: int = cast<int>(cast<u8>(text[i]));
            if (Url.isUnreserved(c)) {
                *(output + used) = cast<u8>(c);
                used = used + 1;
            } else if (spaceAsPlus && (c == 32)) {
                *(output + used) = cast<u8>(43);
                used = used + 1;
            } else {
                *(output + used) = cast<u8>(37);
                *(output + used + 1) = *(hexChars + (c >> 4));
                *(output + used + 2) = *(hexChars + (c & 15));
                used = used + 3;
            }
            i = i + 1;
        }
        *(output + used) = cast<u8>(0);
        return cast<string>(output);
    }

    frame decodeWith(text: string, plusAsSpace: bool) ret string {
        if (text == nullptr) {
            return cast<string>(nullptr);
        }
        local length: long = strlen(text);
        local output: *u8 = cast<*u8>(malloc(length + 1));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        local used: long = 0;
        local i: long = 0;
        loop (i < length) {
            local c: int = cast<int>(cast<u8>(text[i]));
            if (plusAsSpace && (c == 43)) {
                c = 32;
            } else if (c == 37) {
                local high: int = -1;
                local low: int = -1;
                if ((i + 2) < length) {
                    high = Url.hexValue(cast<int>(cast<u8>(text[i + 1])));
                    low = Url.hexValue(cast<int>(cast<u8>(text[i + 2])));
                }
                if ((high < 0) || (low < 0) || ((high == 0) && (low == 0))) {
                    free(cast<*void>(output));
                    return cast<string>(nullptr);
                }
                c = (high * 16) + low;
                i = i + 2;
            }
            *(output + used) = cast<u8>(c);
            used = used + 1;
            i = i + 1;
        }
        *(output + used) = cast<u8>(0);
        return cast<string>(output);
    }
    /#
        Splits a URI into its components. Returns None for an empty text, a
        scheme with invalid characters, an unterminated IPv6 literal, or a
        port that is not a number in 0-65535.
    #/
    frame parse(text: string) ret Option<ParsedUrl> {
        if ((text == nullptr) || (text[0] == cast<char>(0))) {
            return Option<ParsedUrl>.None;
        }
        local n: long = strlen(text);
        local i: long = 0;
        # Scheme: letter followed by letters, digits, '+', '-', '.', then ':'.
        local schemeEnd: long = -1;
        local c0: int = cast<int>(cast<u8>(text[0]));
        if (((c0 >= 65) && (c0 <= 90)) || ((c0 >= 97) && (c0 <= 122))) {
            local j: long = 1;
            loop (j < n) {
                local c: int = cast<int>(cast<u8>(text[j]));
                if (c == 58) {
                    schemeEnd = j;
                    break;
                }
                local ok: bool = ((c >= 65) && (c <= 90)) || ((c >= 97) && (c <= 122)) || ((c >= 48) && (c <= 57)) || (c == 43) || (c == 45) || (c == 46);
                if (!ok) {
                    break;
                }
                j = j + 1;
            }
        }
        local url: ParsedUrl;
        url.port = -1;
        url.hasAuthority = false;
        if (schemeEnd > cast<long>(0)) {
            url.scheme = _urlLower(_urlSlice(text, 0, schemeEnd));
            i = schemeEnd + 1;
        } else {
            url.scheme = String.new("");
        }
        url.userinfo = String.new("");
        url.host = String.new("");
        if (((i + 1) < n) && (text[i] == '/') && (text[i + 1] == '/')) {
            url.hasAuthority = true;
            i = i + 2;
            local authorityEnd: long = i;
            loop ((authorityEnd < n) && (text[authorityEnd] != '/') && (text[authorityEnd] != '?') && (text[authorityEnd] != '#')) {
                authorityEnd = authorityEnd + 1;
            }
            local at: long = -1;
            loop (local k: long = i; k < authorityEnd; k = k + 1) {
                if (text[k] == '@') {
                    at = k;
                }
            }
            local hostStart: long = i;
            if (at >= cast<long>(0)) {
                url.userinfo.destroy();
                url.userinfo = _urlSlice(text, i, at);
                hostStart = at + 1;
            }
            local hostEnd: long = authorityEnd;
            local portStart: long = -1;
            if ((hostStart < authorityEnd) && (text[hostStart] == '[')) {
                local close: long = hostStart + 1;
                loop ((close < authorityEnd) && (text[close] != ']')) {
                    close = close + 1;
                }
                if (close >= authorityEnd) {
                    url.destroyPartial();
                    return Option<ParsedUrl>.None;
                }
                url.host.destroy();
                url.host = _urlLower(_urlSlice(text, hostStart + 1, close));
                if (((close + 1) < authorityEnd) && (text[close + 1] == ':')) {
                    portStart = close + 2;
                } else if ((close + 1) != authorityEnd) {
                    url.destroyPartial();
                    return Option<ParsedUrl>.None;
                }
            } else {
                loop (local k: long = hostStart; k < authorityEnd; k = k + 1) {
                    if (text[k] == ':') {
                        hostEnd = k;
                        portStart = k + 1;
                        break;
                    }
                }
                url.host.destroy();
                url.host = _urlLower(_urlSlice(text, hostStart, hostEnd));
            }
            if (portStart >= cast<long>(0)) {
                if (portStart < authorityEnd) {
                    local port: long = 0;
                    loop (local k: long = portStart; k < authorityEnd; k = k + 1) {
                        local d: int = cast<int>(cast<u8>(text[k]));
                        if ((d < 48) || (d > 57) || (port > cast<long>(65535))) {
                            url.destroyPartial();
                            return Option<ParsedUrl>.None;
                        }
                        port = (port * 10) + cast<long>(d - 48);
                    }
                    if (port > cast<long>(65535)) {
                        url.destroyPartial();
                        return Option<ParsedUrl>.None;
                    }
                    url.port = cast<int>(port);
                }
            }
            i = authorityEnd;
        }
        local pathEnd: long = i;
        loop ((pathEnd < n) && (text[pathEnd] != '?') && (text[pathEnd] != '#')) {
            pathEnd = pathEnd + 1;
        }
        url.path = _urlSlice(text, i, pathEnd);
        i = pathEnd;
        local queryEnd: long = i;
        if ((i < n) && (text[i] == '?')) {
            queryEnd = i + 1;
            loop ((queryEnd < n) && (text[queryEnd] != '#')) {
                queryEnd = queryEnd + 1;
            }
            url.query = _urlSlice(text, i + 1, queryEnd);
        } else {
            url.query = String.new("");
        }
        i = queryEnd;
        if ((i < n) && (text[i] == '#')) {
            url.fragment = _urlSlice(text, i + 1, n);
        } else {
            url.fragment = String.new("");
        }
        return Option<ParsedUrl>.Some(url);
    }

    /#
        Splits a query string ("a=1&b=two+words&flag") into decoded pairs,
        treating '+' as a space; ';' is not a separator. Pairs whose escapes
        are malformed are skipped. Release with `destroyParams`.
    #/
    frame parseQuery(query: string) ret Array<QueryParam> {
        local params: Array<QueryParam> = Array<QueryParam>.new(4);
        if (query == nullptr) {
            return params;
        }
        local n: long = strlen(query);
        local start: long = 0;
        if ((n > cast<long>(0)) && (query[0] == '?')) {
            start = 1;
        }
        loop (start <= n) {
            local end: long = start;
            loop ((end < n) && (query[end] != '&')) {
                end = end + 1;
            }
            if (end > start) {
                local equals: long = end;
                loop (local k: long = start; k < end; k = k + 1) {
                    if (query[k] == '=') {
                        equals = k;
                        break;
                    }
                }
                local rawKey: String = _urlSlice(query, start, equals);
                local rawValue: String = String.new("");
                if (equals < end) {
                    rawValue.destroy();
                    rawValue = _urlSlice(query, equals + 1, end);
                }
                local key: string = Url.decodeForm(rawKey.data);
                local value: string = Url.decodeForm(rawValue.data);
                if ((key != nullptr) && (value != nullptr)) {
                    params.push(QueryParam { key: String.new(key), value: String.new(value), hasValue: equals < end });
                }
                free(cast<*void>(key));
                free(cast<*void>(value));
                rawKey.destroy();
                rawValue.destroy();
            }
            start = end + 1;
        }
        return params;
    }

    # The decoded value of the first `key` in `query` (a new String).
    frame queryValue(query: string, key: string) ret Option<String> {
        local params: Array<QueryParam> = Url.parseQuery(query);
        local found: Option<String> = Option<String>.None;
        loop (local i: int = 0; i < params.length; i = i + 1) {
            if (found.isNone() && (strcmpUrl(params.data[i].key.data, key) == 0)) {
                found = Option<String>.Some(String.new(params.data[i].value.data));
            }
        }
        Url.destroyParams(&params);
        return found;
    }

    # Encodes pairs as "k=v&k2=v2" with form encoding. Returns a new String.
    frame buildQuery(params: *Array<QueryParam>) ret String {
        local out: StringBuilder = StringBuilder.new(32);
        loop (local i: int = 0; i < params.length; i = i + 1) {
            if (i > 0) {
                out.appendChar('&');
            }
            local key: string = Url.encodeForm(params.data[i].key.data);
            out.append(key);
            free(cast<*void>(key));
            if (params.data[i].hasValue) {
                out.appendChar('=');
                local value: string = Url.encodeForm(params.data[i].value.data);
                out.append(value);
                free(cast<*void>(value));
            }
        }
        local result: String;
        result.data = out.buffer;
        result.length = out.length;
        return result;
    }

    frame destroyParams(params: *Array<QueryParam>) {
        loop (local i: int = 0; i < params.length; i = i + 1) {
            local param: QueryParam = params.data[i];
            param.key.destroy();
            param.value.destroy();
        }
        params.destroy();
    }
}
