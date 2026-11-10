# multipart/form-data request bodies (RFC 7578).

import [Request] from "bpl-express";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;
extern memcpy(dest: *void, src: *void, size: ulong) ret *void;

export [Multipart];
export [MultipartPart];

frame multipartCopy(text: string, start: long, end: long) ret string {
    local copy: string = cast<string>(malloc((end - start) + 1));
    if (copy == nullptr) {
        throw "Multipart allocation failed";
    }
    if (end > start) {
        memcpy(copy, text + start, cast<ulong>(end - start));
    }
    copy[end - start] = 0;
    return copy;
}

frame multipartLower(c: char) ret char {
    if ((c >= 'A') && (c <= 'Z')) {
        return c + cast<char>(32);
    }
    return c;
}

# Case-insensitive comparison of text[start..end) with a lowercase word.
frame multipartIs(text: string, start: long, end: long, word: string) ret bool {
    local length: long = strlen(word);
    if ((end - start) != length) {
        return false;
    }
    loop (local i: long = 0; i < length; i = i + 1) {
        if (multipartLower(text[start + i]) != word[i]) {
            return false;
        }
    }
    return true;
}

struct MultipartPart {
    # Field name from Content-Disposition (owned).
    name: string,
    # Client file name reduced to its last path component, or nullptr for
    # ordinary fields (owned). Never use it as a path without your own checks.
    filename: string,
    # Part Content-Type, "text/plain" when absent (owned).
    content_type: string,
    # Part content (owned, NUL-terminated after `size` bytes; may contain NULs).
    data: string,
    size: long,
}

struct Multipart {
    parts: Array<MultipartPart>,

    # The boundary parameter of a multipart/form-data media type, as an owned
    # string, or nullptr when the type is not multipart/form-data.
    frame boundary(contentType: string) ret string {
        if (contentType == nullptr) {
            return nullptr;
        }
        local length: long = strlen(contentType);
        local i: long = 0;
        loop ((i < length) && ((contentType[i] == ' ') || (contentType[i] == '\t'))) {
            i = i + 1;
        }
        local typeEnd: long = i;
        loop ((typeEnd < length) && (contentType[typeEnd] != ';') && (contentType[typeEnd] != ' ') && (contentType[typeEnd] != '\t')) {
            typeEnd = typeEnd + 1;
        }
        if (!multipartIs(contentType, i, typeEnd, "multipart/form-data")) {
            return nullptr;
        }
        i = typeEnd;
        loop (i < length) {
            loop ((i < length) && ((contentType[i] == ';') || (contentType[i] == ' ') || (contentType[i] == '\t'))) {
                i = i + 1;
            }
            local nameStart: long = i;
            loop ((i < length) && (contentType[i] != '=') && (contentType[i] != ';')) {
                i = i + 1;
            }
            local nameEnd: long = i;
            loop ((nameEnd > nameStart) && ((contentType[nameEnd - 1] == ' ') || (contentType[nameEnd - 1] == '\t'))) {
                nameEnd = nameEnd - 1;
            }
            if ((i >= length) || (contentType[i] != '=')) {
                continue;
            }
            i = i + 1;
            loop ((i < length) && ((contentType[i] == ' ') || (contentType[i] == '\t'))) {
                i = i + 1;
            }
            local valueStart: long = i;
            local valueEnd: long = i;
            if ((i < length) && (contentType[i] == '"')) {
                valueStart = i + 1;
                i = i + 1;
                loop ((i < length) && (contentType[i] != '"')) {
                    i = i + 1;
                }
                if (i >= length) {
                    return nullptr;
                }
                valueEnd = i;
                i = i + 1;
            } else {
                loop ((i < length) && (contentType[i] != ';') && (contentType[i] != ' ') && (contentType[i] != '\t')) {
                    i = i + 1;
                }
                valueEnd = i;
            }
            if (multipartIs(contentType, nameStart, nameEnd, "boundary")) {
                local size: long = valueEnd - valueStart;
                if ((size < 1) || (size > 70)) {
                    return nullptr;
                }
                # RFC 2046 bchars, so the delimiter cannot hide in CR/LF.
                loop (local k: long = valueStart; k < valueEnd; k = k + 1) {
                    local c: char = contentType[k];
                    local ok: bool = ((c >= '0') && (c <= '9')) || ((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z'));
                    local extra: string = "'()+_,-./:=? ";
                    loop (local e: int = 0; !ok && (extra[e] != 0); e = e + 1) {
                        ok = c == extra[e];
                    }
                    if (!ok || ((k == (valueEnd - 1)) && (c == ' '))) {
                        return nullptr;
                    }
                }
                return multipartCopy(contentType, valueStart, valueEnd);
            }
        }
        return nullptr;
    }

    # Position of "\r\n--boundary" at or after `from`, or -1.
    frame find(body: string, size: long, begin: long, boundary: string, boundaryLength: long) ret long {
        local i: long = begin;
        loop ((i + 4 + boundaryLength) <= size) {
            if ((body[i] == '\r') && (body[i + 1] == '\n') && (body[i + 2] == '-') && (body[i + 3] == '-')) {
                local same: bool = true;
                loop (local k: long = 0; k < boundaryLength; k = k + 1) {
                    if (body[i + 4 + k] != boundary[k]) {
                        same = false;
                        break;
                    }
                }
                if (same) {
                    return i;
                }
            }
            i = i + 1;
        }
        return -1;
    }

    # Parses a parameter value (quoted or token) of a Content-Disposition
    # header; returns an owned copy or nullptr when `parameter` is absent.
    frame parameter(header: string, start: long, end: long, parameter: string) ret string {
        local i: long = start;
        # Skip the disposition type.
        loop ((i < end) && (header[i] != ';')) {
            i = i + 1;
        }
        loop (i < end) {
            loop ((i < end) && ((header[i] == ';') || (header[i] == ' ') || (header[i] == '\t'))) {
                i = i + 1;
            }
            local nameStart: long = i;
            loop ((i < end) && (header[i] != '=') && (header[i] != ';')) {
                i = i + 1;
            }
            local nameEnd: long = i;
            loop ((nameEnd > nameStart) && ((header[nameEnd - 1] == ' ') || (header[nameEnd - 1] == '\t'))) {
                nameEnd = nameEnd - 1;
            }
            if ((i >= end) || (header[i] != '=')) {
                continue;
            }
            i = i + 1;
            loop ((i < end) && ((header[i] == ' ') || (header[i] == '\t'))) {
                i = i + 1;
            }
            local value: string = nullptr;
            if ((i < end) && (header[i] == '"')) {
                i = i + 1;
                local out: Array<char> = Array<char>.new(16);
                loop ((i < end) && (header[i] != '"')) {
                    if ((header[i] == '\\') && ((i + 1) < end)) {
                        i = i + 1;
                    }
                    out.push(header[i]);
                    i = i + 1;
                }
                if (i >= end) {
                    out.destroy();
                    throw "Unterminated quoted multipart parameter";
                }
                i = i + 1;
                out.push(cast<char>(0));
                value = multipartCopy(cast<string>(out.data), 0, cast<long>(out.len() - 1));
                out.destroy();
            } else {
                local valueStart: long = i;
                loop ((i < end) && (header[i] != ';') && (header[i] != ' ') && (header[i] != '\t')) {
                    i = i + 1;
                }
                value = multipartCopy(header, valueStart, i);
            }
            if (multipartIs(header, nameStart, nameEnd, parameter)) {
                return value;
            }
            free(value);
        }
        return nullptr;
    }

    # Parses `size` bytes of `body` delimited by `boundary`. Throws on any
    # framing error; at most `maxParts` parts (1 to 1000) are accepted.
    frame parse(boundary: string, body: string, size: long, maxParts: int) ret Multipart {
        if ((boundary == nullptr) || (body == nullptr) || (size < 0)) {
            throw "Multipart requires a boundary and body";
        }
        if ((maxParts < 1) || (maxParts > 1000)) {
            throw "Multipart part limit must be 1 to 1000";
        }
        local result: Multipart;
        result.parts = Array<MultipartPart>.new(4);
        local boundaryLength: long = strlen(boundary);
        # The first delimiter may start the body without a preceding CRLF.
        local position: long = -1;
        local dashed: bool = (size >= (2 + boundaryLength)) && (body[0] == '-') && (body[1] == '-');
        loop (local k: long = 0; dashed && (k < boundaryLength); k = k + 1) {
            dashed = body[2 + k] == boundary[k];
        }
        if (dashed) {
            position = 2 + boundaryLength;
        } else {
            local found: long = Multipart.find(body, size, 0, boundary, boundaryLength);
            if (found < 0) {
                result.destroy();
                throw "Multipart body has no boundary";
            }
            position = found + 4 + boundaryLength;
        }
        loop {
            # After a delimiter: "--" ends the body, otherwise CRLF (with
            # optional transport padding) starts a part.
            if (((position + 1) < size) && (body[position] == '-') && (body[position + 1] == '-')) {
                return result;
            }
            loop ((position < size) && ((body[position] == ' ') || (body[position] == '\t'))) {
                position = position + 1;
            }
            if (((position + 1) >= size) || (body[position] != '\r') || (body[position + 1] != '\n')) {
                result.destroy();
                throw "Malformed multipart delimiter";
            }
            position = position + 2;
            if (result.parts.len() >= maxParts) {
                result.destroy();
                throw "Too many multipart parts";
            }
            local part: MultipartPart;
            part.name = nullptr;
            part.filename = nullptr;
            part.content_type = nullptr;
            part.data = nullptr;
            part.size = 0;
            # Headers until an empty line, bounded to 8 KiB per part.
            local headerStart: long = position;
            loop {
                if ((position - headerStart) > 8192) {
                    Multipart.release(&part);
                    result.destroy();
                    throw "Multipart part headers too large";
                }
                local lineEnd: long = position;
                loop (((lineEnd + 1) < size) && !((body[lineEnd] == '\r') && (body[lineEnd + 1] == '\n'))) {
                    lineEnd = lineEnd + 1;
                }
                if ((lineEnd + 1) >= size) {
                    Multipart.release(&part);
                    result.destroy();
                    throw "Truncated multipart headers";
                }
                if (lineEnd == position) {
                    position = lineEnd + 2;
                    break;
                }
                local colon: long = position;
                loop ((colon < lineEnd) && (body[colon] != ':')) {
                    colon = colon + 1;
                }
                if ((colon == lineEnd) || (colon == position)) {
                    Multipart.release(&part);
                    result.destroy();
                    throw "Malformed multipart header";
                }
                local valueStart: long = colon + 1;
                loop ((valueStart < lineEnd) && ((body[valueStart] == ' ') || (body[valueStart] == '\t'))) {
                    valueStart = valueStart + 1;
                }
                local valueEnd: long = lineEnd;
                loop ((valueEnd > valueStart) && ((body[valueEnd - 1] == ' ') || (body[valueEnd - 1] == '\t'))) {
                    valueEnd = valueEnd - 1;
                }
                loop (local k: long = valueStart; k < valueEnd; k = k + 1) {
                    if ((cast<u8>(body[k]) < cast<u8>(32)) && (body[k] != '\t')) {
                        Multipart.release(&part);
                        result.destroy();
                        throw "Control character in multipart header";
                    }
                }
                if (multipartIs(body, position, colon, "content-disposition")) {
                    if (part.name != nullptr) {
                        Multipart.release(&part);
                        result.destroy();
                        throw "Duplicate multipart Content-Disposition";
                    }
                    local typeEnd: long = valueStart;
                    loop ((typeEnd < valueEnd) && (body[typeEnd] != ';') && (body[typeEnd] != ' ')) {
                        typeEnd = typeEnd + 1;
                    }
                    if (!multipartIs(body, valueStart, typeEnd, "form-data")) {
                        Multipart.release(&part);
                        result.destroy();
                        throw "Multipart part is not form-data";
                    }
                    try {
                        part.name = Multipart.parameter(body, valueStart, valueEnd, "name");
                        part.filename = Multipart.parameter(body, valueStart, valueEnd, "filename");
                    } catch {
                        Multipart.release(&part);
                        result.destroy();
                        throw "Malformed multipart Content-Disposition";
                    }
                    if (part.name == nullptr) {
                        Multipart.release(&part);
                        result.destroy();
                        throw "Multipart part has no name";
                    }
                    if (part.filename != nullptr) {
                        local base: string = Multipart.basename(part.filename);
                        free(part.filename);
                        part.filename = base;
                    }
                } else if (multipartIs(body, position, colon, "content-type")) {
                    free(part.content_type);
                    part.content_type = multipartCopy(body, valueStart, valueEnd);
                }
                position = lineEnd + 2;
            }
            if (part.name == nullptr) {
                Multipart.release(&part);
                result.destroy();
                throw "Multipart part has no Content-Disposition";
            }
            if (part.content_type == nullptr) {
                part.content_type = multipartCopy("text/plain", 0, 10);
            }
            local close: long = Multipart.find(body, size, position, boundary, boundaryLength);
            if (close < 0) {
                Multipart.release(&part);
                result.destroy();
                throw "Multipart body is not terminated";
            }
            part.data = multipartCopy(body, position, close);
            part.size = close - position;
            result.parts.push(part);
            position = close + 4 + boundaryLength;
        }
        return result;
    }
    # Last path component of a client-supplied file name (both separators),
    # so "C:\\Users\\me\\a.txt" and "../../a.txt" become "a.txt".
    frame basename(name: string) ret string {
        local start: long = 0;
        loop (local i: long = 0; name[i] != 0; i = i + 1) {
            if ((name[i] == '/') || (name[i] == '\\')) {
                start = i + 1;
            }
        }
        return multipartCopy(name, start, strlen(name));
    }
    # Parses a request whose Content-Type is multipart/form-data.
    frame fromRequest(req: *Request) ret Multipart {
        return Multipart.fromRequestLimited(req, 256);
    }
    frame fromRequestLimited(req: *Request, maxParts: int) ret Multipart {
        local media: Option<string> = req.header("content-type");
        local boundary: string = nullptr;
        if (media.isSome()) {
            boundary = Multipart.boundary(media.unwrap());
        }
        if (boundary == nullptr) {
            throw "Request is not multipart/form-data with a valid boundary";
        }
        local body: string = req.body;
        local size: long = req.body_length;
        if (body == nullptr) {
            body = "";
            size = 0;
        }
        local result: Multipart;
        local failure: bool = false;
        try {
            result = Multipart.parse(boundary, body, size, maxParts);
        } catch {
            failure = true;
        }
        free(boundary);
        if (failure) {
            throw "Invalid multipart body";
        }
        return result;
    }
    frame count(this: *Multipart) ret int {
        return this.parts.len();
    }
    frame get(this: *Multipart, index: int) ret *MultipartPart {
        return this.parts.getRef(index);
    }
    # First part with this field name that is not a file upload.
    frame field(this: *Multipart, name: string) ret Option<string> {
        loop (local i: int = 0; i < this.parts.len(); i = i + 1) {
            local part: *MultipartPart = this.parts.getRef(i);
            if ((part.filename == nullptr) && (strcmp(part.name, name) == 0)) {
                return Option<string>.Some(part.data);
            }
        }
        return Option<string>.None;
    }
    # First file part with this field name, or nullptr.
    frame file(this: *Multipart, name: string) ret *MultipartPart {
        loop (local i: int = 0; i < this.parts.len(); i = i + 1) {
            local part: *MultipartPart = this.parts.getRef(i);
            if ((part.filename != nullptr) && (strcmp(part.name, name) == 0)) {
                return part;
            }
        }
        return nullptr;
    }
    frame release(part: *MultipartPart) {
        free(part.name);
        free(part.filename);
        free(part.content_type);
        free(part.data);
        part.name = nullptr;
        part.filename = nullptr;
        part.content_type = nullptr;
        part.data = nullptr;
    }
    frame destroy(this: *Multipart) {
        loop (local i: int = 0; i < this.parts.len(); i = i + 1) {
            Multipart.release(this.parts.getRef(i));
        }
        this.parts.destroy();
    }
}
