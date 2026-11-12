# Cookie parsing (RFC 6265 Cookie header) and Set-Cookie generation.

import [Request], [Response] from "./http.bpl";
import [HttpParser], releaseStrings from "bpl-http-parser";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [Base64] from "std/base64.bpl";
import [Hmac] from "std/hmac.bpl";
import strlen, strcmp, strncmp, free from "./libc.bpl";

export [Cookies];
export [CookieJar];
export [CookieOptions];

struct CookieOptions {
    # Path attribute; nullptr omits it. Defaults to "/".
    path: string,
    # Domain attribute; nullptr (the default) makes a host-only cookie.
    domain: string,
    # Max-Age in seconds; negative (the default) makes a session cookie.
    max_age: long,
    secure: bool,
    # Defaults to true: scripts cannot read the cookie.
    http_only: bool,
    # "Strict", "Lax" (the default), "None" (requires secure), or nullptr.
    same_site: string,
    frame defaults() ret CookieOptions {
        local options: CookieOptions;
        options.path = "/";
        options.domain = nullptr;
        options.max_age = -1;
        options.secure = false;
        options.http_only = true;
        options.same_site = "Lax";
        return options;
    }
}

# Cookies sent by the client. Names and values are owned copies.
struct CookieJar {
    values: Map<string, string>,
    frame get(this: *CookieJar, name: string) ret Option<string> {
        return this.values.get(name);
    }
    frame has(this: *CookieJar, name: string) ret bool {
        return this.values.has(name);
    }
    frame count(this: *CookieJar) ret int {
        return this.values.size();
    }
    frame destroy(this: *CookieJar) {
        releaseStrings(&this.values);
    }
}

struct Cookies {
    # RFC 6265 cookie-octet: printable ASCII except space, '"', ',', ';'
    # and '\'.
    frame valueChar(c: char) ret bool {
        local code: int = cast<int>(cast<u8>(c));
        return (code == 0x21) || ((code >= 0x23) && (code <= 0x2B)) || ((code >= 0x2D) && (code <= 0x3A)) || ((code >= 0x3C) && (code <= 0x5B)) || ((code >= 0x5D) && (code <= 0x7E));
    }
    frame validName(name: string) ret bool {
        if ((name == nullptr) || (name[0] == 0)) {
            return false;
        }
        loop (local i: int = 0; name[i] != 0; i = i + 1) {
            if (!HttpParser.token(name[i])) {
                return false;
            }
        }
        return true;
    }
    frame validValue(value: string) ret bool {
        if (value == nullptr) {
            return false;
        }
        loop (local i: int = 0; value[i] != 0; i = i + 1) {
            if (!Cookies.valueChar(value[i])) {
                return false;
            }
        }
        return true;
    }
    # Attribute values (Path, Domain) cannot contain controls or ';'.
    frame validAttribute(value: string) ret bool {
        if ((value == nullptr) || (value[0] == 0)) {
            return false;
        }
        loop (local i: int = 0; value[i] != 0; i = i + 1) {
            local code: int = cast<int>(cast<u8>(value[i]));
            if ((code < 0x20) || (code == 0x7F) || (value[i] == ';')) {
                return false;
            }
        }
        return true;
    }

    # Parses a Cookie header value. Malformed pairs are skipped; when a name
    # repeats, the first occurrence (the most specific path) wins. Values in
    # double quotes are unquoted; no percent-decoding is applied.
    frame parse(header: string) ret CookieJar {
        local jar: CookieJar;
        jar.values = Map<string, string>.new();
        if (header == nullptr) {
            return jar;
        }
        local size: long = cast<long>(strlen(header));
        local pos: long = 0;
        loop (pos < size) {
            loop ((pos < size) && ((header[pos] == ' ') || (header[pos] == '\t') || (header[pos] == ';'))) {
                pos = pos + 1;
            }
            local end: long = pos;
            loop ((end < size) && (header[end] != ';')) {
                end = end + 1;
            }
            local equals: long = pos;
            loop ((equals < end) && (header[equals] != '=')) {
                equals = equals + 1;
            }
            local nameEnd: long = equals;
            loop ((nameEnd > pos) && ((header[nameEnd - 1] == ' ') || (header[nameEnd - 1] == '\t'))) {
                nameEnd = nameEnd - 1;
            }
            local valueStart: long = equals + 1;
            loop ((valueStart < end) && ((header[valueStart] == ' ') || (header[valueStart] == '\t'))) {
                valueStart = valueStart + 1;
            }
            local valueEnd: long = end;
            loop ((valueEnd > valueStart) && ((header[valueEnd - 1] == ' ') || (header[valueEnd - 1] == '\t'))) {
                valueEnd = valueEnd - 1;
            }
            if (((valueEnd - valueStart) >= 2) && (header[valueStart] == '"') && (header[valueEnd - 1] == '"')) {
                valueStart = valueStart + 1;
                valueEnd = valueEnd - 1;
            }
            local valid: bool = (equals < end) && (nameEnd > pos);
            loop (local i: long = pos; valid && (i < nameEnd); i = i + 1) {
                valid = HttpParser.token(header[i]);
            }
            loop (local i: long = valueStart; valid && (i < valueEnd); i = i + 1) {
                valid = Cookies.valueChar(header[i]);
            }
            if (valid) {
                local name: string = HttpParser.copy(header, pos, nameEnd - pos);
                if (jar.values.has(name)) {
                    free(name);
                } else {
                    jar.values.set(name, HttpParser.copy(header, valueStart, valueEnd - valueStart));
                }
            }
            pos = end + 1;
        }
        return jar;
    }
    # All cookies of a request. The parser rejects requests with more than
    # one Cookie header, so there is a single header to read.
    frame of(req: *Request) ret CookieJar {
        local header: Option<string> = req.header("cookie");
        if (!header.isSome()) {
            return Cookies.parse(nullptr);
        }
        return Cookies.parse(header.unwrap());
    }
    # One cookie value as an owned String, or None.
    frame get(req: *Request, name: string) ret Option<String> {
        local jar: CookieJar = Cookies.of(req);
        local found: Option<string> = jar.get(name);
        local result: Option<String> = Option<String>.None;
        if (found.isSome()) {
            result = Option<String>.Some(String.new(found.unwrap()));
        }
        jar.destroy();
        return result;
    }

    # Builds a Set-Cookie value. Throws on invalid names, values or
    # attribute combinations instead of emitting a header browsers would
    # misread.
    frame serialize(name: string, value: string, options: *CookieOptions) ret String {
        if (!Cookies.validName(name)) {
            throw "Invalid cookie name";
        }
        if (!Cookies.validValue(value)) {
            throw "Invalid cookie value (encode it, e.g. with base64url)";
        }
        if ((options.path != nullptr) && (!Cookies.validAttribute(options.path) || (options.path[0] != '/'))) {
            throw "Cookie path must start with /";
        }
        if ((options.domain != nullptr) && !Cookies.validAttribute(options.domain)) {
            throw "Invalid cookie domain";
        }
        local sameSite: string = options.same_site;
        if ((sameSite != nullptr) && (strcmp(sameSite, "Strict") != 0) && (strcmp(sameSite, "Lax") != 0) && (strcmp(sameSite, "None") != 0)) {
            throw "SameSite must be Strict, Lax or None";
        }
        if ((sameSite != nullptr) && (strcmp(sameSite, "None") == 0) && !options.secure) {
            throw "SameSite=None requires a Secure cookie";
        }
        # Cookie prefixes (RFC 6265bis): browsers drop violating cookies.
        if ((strncmp(name, "__Secure-", 9) == 0) && !options.secure) {
            throw "__Secure- cookies must be Secure";
        }
        if ((strncmp(name, "__Host-", 7) == 0) && (!options.secure || (options.domain != nullptr) || (options.path == nullptr) || (strcmp(options.path, "/") != 0))) {
            throw "__Host- cookies must be Secure with Path=/ and no Domain";
        }
        local out: StringBuilder = StringBuilder.new(64);
        local owner: *StringBuilder = &out;
        defer owner.destroy();
        out.append(name);
        out.appendChar('=');
        out.append(value);
        if (options.path != nullptr) {
            out.append("; Path=");
            out.append(options.path);
        }
        if (options.domain != nullptr) {
            out.append("; Domain=");
            out.append(options.domain);
        }
        if (options.max_age >= 0) {
            out.append("; Max-Age=");
            out.appendLong(options.max_age);
        }
        if (options.secure) {
            out.append("; Secure");
        }
        if (options.http_only) {
            out.append("; HttpOnly");
        }
        if (sameSite != nullptr) {
            out.append("; SameSite=");
            out.append(sameSite);
        }
        return String.new(out.toString());
    }
    # Adds a Set-Cookie header (several cookies may be set per response).
    frame set(res: *Response, name: string, value: string, options: *CookieOptions) {
        local header: String = Cookies.serialize(name, value, options);
        res.appendHeader("Set-Cookie", header.data);
        header.destroy();
    }
    # Expires a cookie. Path and Domain must match those used to set it.
    frame clear(res: *Response, name: string, options: *CookieOptions) {
        local expired: CookieOptions = *options;
        expired.max_age = 0;
        Cookies.set(res, name, "", &expired);
    }

    # value + "." + base64url(HMAC-SHA256(secret, name "=" value)). Binding
    # the name stops a signed value from being replayed under another cookie.
    frame sign(name: string, value: string, secret: string) ret String {
        if ((secret == nullptr) || (strlen(secret) < 32)) {
            throw "Cookie signing secret must be at least 32 bytes";
        }
        if (!Cookies.validValue(value)) {
            throw "Invalid cookie value (encode it, e.g. with base64url)";
        }
        local mac: u8[32];
        Cookies.mac(name, value, cast<long>(strlen(value)), secret, &mac[0]);
        local signature: string = Base64.encodeUrl(&mac[0], 32);
        local out: StringBuilder = StringBuilder.new(64);
        out.append(value);
        out.appendChar('.');
        out.append(signature);
        free(signature);
        local result: String = String.new(out.toString());
        out.destroy();
        return result;
    }
    frame mac(name: string, value: string, length: long, secret: string, out: *u8) {
        local context: Hmac = Hmac.sha256(cast<*u8>(secret), cast<long>(strlen(secret)));
        context.update(cast<*u8>(name), cast<long>(strlen(name)));
        context.update(cast<*u8>("="), 1);
        context.update(cast<*u8>(value), length);
        context.finish(out);
    }
    # The original value when the signature matches, else None.
    frame unsign(name: string, signed: string, secret: string) ret Option<String> {
        if ((signed == nullptr) || (secret == nullptr) || (strlen(secret) < 32)) {
            return Option<String>.None;
        }
        local length: long = cast<long>(strlen(signed));
        # 43 base64url characters encode the 32-byte MAC.
        if ((length < 44) || (signed[length - 44] != '.')) {
            return Option<String>.None;
        }
        local valueLength: long = length - 44;
        local expected: u8[32];
        Cookies.mac(name, signed, valueLength, secret, &expected[0]);
        local encoded: string = Base64.encodeUrl(&expected[0], 32);
        local same: bool = Hmac.equal(cast<*u8>(encoded), cast<*u8>(signed + valueLength + 1), 43);
        free(encoded);
        if (!same) {
            return Option<String>.None;
        }
        local value: string = HttpParser.copy(signed, 0, valueLength);
        local result: String = String.new(value);
        free(value);
        return Option<String>.Some(result);
    }
}
