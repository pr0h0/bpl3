# bpl-http-parser

`HttpParser.parse(raw)` parses a NUL-terminated request. Use
`HttpParser.parseBytes(raw, byteCount)` for bounded buffers and binary bodies.

Check `valid` before using fields. When false, `error_code == 0` means more
bytes are needed; nonzero values are HTTP rejection statuses. Header names
are lowercase. Query keys and values decode percent escapes and `+`; repeated
keys keep the last value, and a bare key has an empty value.

The parser requires an origin-form target and HTTP/1.0 or HTTP/1.1. HTTP/1.1
requires one nonempty Host header. Headers are limited to 16 KiB and bodies
to 1 MiB. Duplicate Content-Length, Cookie, Origin, Authorization, or X-CSRF-Token
headers, invalid lengths, malformed headers, and
invalid query escapes are rejected. Request transfer encodings return 501;
chunked request bodies are not supported. `message_length` marks the first
request boundary; extra bytes are not incorporated into the body.

All returned strings and maps belong to the result. Call `destroy()` on
success, failure, or incomplete input. Copying the result does not copy its
allocations; destroy the owner once. Borrowed fields expire at destruction.
