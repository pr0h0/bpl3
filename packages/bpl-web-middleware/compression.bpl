import [Request], [Response] from "bpl-express";
import [Negotiation] from "./negotiation.bpl";
import vary from "./cors.bpl";
import [HttpParser] from "bpl-http-parser";
import [Option] from "std/option.bpl";
import [StringBuilder] from "std/string_builder.bpl";
extern dlopen(path: string, flags: int) ret *void;
extern dlsym(handle: *void, name: string) ret *void;
extern dlclose(handle: *void) ret int;
extern malloc(size: ulong) ret string;
extern free(data: string);
extern memcpy(dest: *void, source: *void, size: ulong) ret *void;
extern strcmp(a: string, b: string) ret int;
extern strlen(text: string) ret ulong;
extern strncmp(a: string, b: string, size: ulong) ret int;
export [Compression];
export [CompressedBytes];
export compression;
struct CompressedBytes {
    data: string,
    size: long,
    frame destroy(this: *CompressedBytes) {
        free(this.data);
        this.data = nullptr;
        this.size = 0;
    }
}
frame compressionSymbol(handle: *void, name: string) ret *void {
    local value: *void = dlsym(handle, name);
    if (value == nullptr) {
        throw "zlib compression symbol unavailable";
    }
    return value;
}
struct Compression {
    # Deterministic gzip envelope over zlib's standard DEFLATE stream.
    frame gzip(data: string, size: long) ret CompressedBytes {
        if ((size < 0) || (size > 8388608) || ((data == nullptr) && (size > 0))) {
            throw "Compression requires a bounded buffer";
        }
        local lib: *void = dlopen("libz.so.1", 2);
        if (lib == nullptr) {
            throw "zlib compression runtime unavailable";
        }
        defer dlclose(lib);
        local bound: Func<ulong>(ulong) = cast<Func<ulong>(ulong)>(compressionSymbol(lib, "compressBound"));
        local compress: Func<int>(string, *ulong, string, ulong, int) = cast<Func<int>(string, *ulong, string, ulong, int)>(compressionSymbol(lib, "compress2"));
        local crc32: Func<ulong>(ulong, string, uint) = cast<Func<ulong>(ulong, string, uint)>(compressionSymbol(lib, "crc32"));
        local capacity: ulong = bound(cast<ulong>(size));
        local scratch: string = malloc(capacity);
        if (scratch == nullptr) {
            throw "Compression allocation failed";
        }
        defer free(scratch);
        local length: ulong = capacity;
        if ((compress(scratch, &length, data, cast<ulong>(size), 1) != 0) || (length < 6)) {
            throw "Compression failed";
        }
        local result: CompressedBytes;
        result.size = cast<long>(length) + 12;
        result.data = malloc(cast<ulong>(result.size));
        if (result.data == nullptr) {
            throw "Compression allocation failed";
        }
        local output: *u8 = cast<*u8>(result.data);
        loop (local i: int = 0; i < 10; i = i + 1) {
            output[i] = cast<u8>(0);
        }
        output[0] = cast<u8>(31);
        output[1] = cast<u8>(139);
        output[2] = cast<u8>(8);
        output[9] = cast<u8>(255);
        memcpy(cast<*void>(result.data + 10), cast<*void>(scratch + 2), length - 6);
        local crc: ulong = crc32(0, data, cast<uint>(size));
        loop (local i: int = 0; i < 4; i = i + 1) {
            output[(result.size - 8) + cast<long>(i)] = cast<u8>((crc >> (i * 8)) & cast<ulong>(255));
            output[(result.size - 4) + cast<long>(i)] = cast<u8>((cast<ulong>(size) >> (i * 8)) & cast<ulong>(255));
        }
        return result;
    }
    frame attach(req: *Request, res: *Response) {
        if (res.headers_sent) {
            throw "Compression must be attached before headers";
        }
        vary(res, "Accept-Encoding");
        res.send_transform = compressionSend;
        res.transform_context = cast<*void>(req);
    }
}
frame noTransform(value: string) ret bool {
    local size: long = cast<long>(strlen(value));
    local pos: long = 0;
    loop (pos < size) {
        local end: long = pos;
        loop ((end < size) && (value[end] != ',')) {
            end = end + 1;
        }
        local start: long = pos;
        loop ((start < end) && ((value[start] == ' ') || (value[start] == '\t'))) {
            start = start + 1;
        }
        local finish: long = end;
        loop ((finish > start) && ((value[finish - 1] == ' ') || (value[finish - 1] == '\t'))) {
            finish = finish - 1;
        }
        local token: string = HttpParser.copy(value, start, finish - start);
        local blocked: bool = Response.equalHeader(token, "no-transform");
        free(token);
        if (blocked) {
            return true;
        }
        pos = end + 1;
    }
    return false;
}
frame compressionSend(context: *void, res: *Response, data: string, size: long) ret bool {
    local req: *Request = cast<*Request>(context);
    if ((res.status_code == 204) || (res.status_code == 304)) {
        return false;
    }
    if (res.headers.has("content-encoding")) {
        return false;
    }
    vary(res, "Accept-Encoding");
    local identity: int = Negotiation.encoding(req, "identity");
    local gzip: int = Negotiation.encoding(req, "gzip");
    local cache: Option<string> = res.headers.get("cache-control");
    local blocked: bool = (res.status_code != 200) || res.headers.has("content-range") || (cache.isSome() && noTransform(cache.unwrap())) || (size > 8388608);
    if (blocked || (gzip == 0) || ((identity > 0) && ((gzip < identity) || (size < 256)))) {
        if (identity == 0) {
            res.headers.remove("content-range");
            res.status(406).json("{\"error\":\"encoding not acceptable\"}");
            return true;
        }
        return false;
    }
    local zipped: CompressedBytes;
    zipped.data = nullptr;
    zipped.size = 0;
    try {
        zipped = Compression.gzip(data, size);
    } catch {
        if (identity == 0) {
            res.status(406).json("{\"error\":\"encoding unavailable\"}");
            return true;
        }
        return false;
    }
    local owner: *CompressedBytes = &zipped;
    defer owner.destroy();
    if ((identity > 0) && (zipped.size >= size)) {
        return false;
    }
    res.setHeader("Content-Encoding", "gzip");
    local tag: Option<string> = res.headers.get("etag");
    if (tag.isSome() && (tag.unwrap()[0] == '"')) {
        local builder: StringBuilder = StringBuilder.new(64);
        local builderOwner: *StringBuilder = &builder;
        defer builderOwner.destroy();
        builder.append("W/");
        builder.append(tag.unwrap());
        res.setHeader("ETag", builder.toString());
    }
    res.sendBytes(zipped.data, zipped.size);
    return true;
}
frame compression(req: *Request, res: *Response) {
    Compression.attach(req, res);
}
