# bpl-http-client

A synchronous **Linux IPv4 HTTP/1.x** client. It has no TLS implementation:
`https://` URLs return a transport failure instead of sending plaintext. Use a
TLS-capable external integration when HTTPS is required. IPv6, redirects,
interim 1xx responses, pooling, and compression are not implemented.

```bpl
import [RequestBuilder], [HttpResponse] from "bpl-http-client";
frame main() {
    local request: RequestBuilder = RequestBuilder.new("http://127.0.0.1:3000/");
    request.header("Accept", "application/json");
    local response: *HttpResponse = request.send();
    # status == 0 means a transport/parsing failure; inspect response.error.
    # body_length counts bytes, including NUL; body has a trailing NUL for text.
    response.destroy();
    request.destroy();
}
```

`setMethod`, `methodCustom`, `header`, `text`, and `json` are chainable. `text` and
`json` set the body and media type but do not change the method. Request URL/body
strings are borrowed until send returns. Headers copy their strings and use
case-insensitive lookup. Host, length, transfer encoding, and connection headers
are managed internally; custom headers reject invalid names/control characters.
Headers are limited to 16 KiB, request/decoded response bodies to 1 MiB, and the
response wire buffer to approximately 2 MiB. Chunk extensions and complete
trailers are accepted; invalid/truncated chunks fail instead of copying beyond
input. Framing headers are parsed from the header section only.

Read/write/connect inactivity deadlines default to five seconds; set
`timeout_seconds` on the builder to change them. DNS resolution uses blocking
`gethostbyname` and is not covered by that deadline. The client requests
Connection: close and reads until close; a peer that keeps the connection open
can reach the read deadline even with a complete response body.

Destroy every heap response exactly once (`response.destroy()` frees the object
itself). Destroy each builder to free owned header strings. Response header/body
pointers expire when the response is destroyed. `Url.parse` returns owned host
and path strings; call its `destroy`. `Url.new` borrows its strings.
