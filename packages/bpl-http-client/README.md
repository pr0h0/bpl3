# bpl-http-client

A synchronous **Linux IPv4 HTTP/1.x** client supporting HTTP and native HTTPS.
HTTP and HTTPS scheme names are case-insensitive; host and request-target text
retain their original spelling. HTTPS uses the optional `bpl-tls` transport and requires OpenSSL 3's runtime
(`libssl.so.3`); plain HTTP does not load OpenSSL. No additional linker flags are
needed with glibc 2.34 or newer. IPv6, redirects, interim 1xx responses, pooling,
and compression are not implemented.

```bpl
import [RequestBuilder], [HttpResponse] from "bpl-http-client";
frame main() {
    local request: RequestBuilder = RequestBuilder.new("https://example.com/");
    request.header("Accept", "application/json");
    local response: *HttpResponse = request.send();
    # status == 0 means a transport/parsing failure; inspect response.error.
    # body_length counts bytes, including NUL; body has a trailing NUL for text.
    response.destroy();
    request.destroy();
}
```

`setMethod`, `methodCustom`, `header`, `text`, and `json` are chainable. `text` and
`json` set the body and media type but do not change the method. `HEAD` responses
have no body whether selected through `setMethod(HttpMethod.HEAD)` or
`methodCustom("HEAD")`; method names are case-sensitive. Request URL/body
strings are borrowed until send returns. Headers copy their strings and use
case-insensitive lookup. Host, length, transfer encoding, and connection headers
are managed internally; custom headers reject invalid names/control characters.
Headers are limited to 16 KiB, request/decoded response bodies to 1 MiB, and the
response wire buffer to approximately 2 MiB. Chunk extensions and complete
trailers are accepted; invalid/truncated chunks fail instead of copying beyond
input. Framing headers are parsed from the header section only. Response status lines
require CRLF endings; reason phrases accept tabs, printable bytes and high octets,
and reject other control bytes and DEL.

The post-DNS request budget defaults to five seconds; set `timeout_seconds`
to an integer from 1 to 300. It covers connecting, TLS negotiation, writing the
request, and receiving the response. DNS resolution uses blocking `gethostbyname`
and is outside that budget. The client requests Connection: close and reads until
close; a peer that keeps the connection open can reach the deadline even with a
complete response body. Plain HTTP retries interrupted socket reads/writes within
the same request deadline and preserves offsets across partial writes.

HTTPS verifies the certificate chain and the URL's DNS hostname or IPv4 subject
alternative name. DNS hosts also send SNI. System CA paths are used by default;
`request.caBundle("private-ca.pem")` selects a PEM CA bundle for private services.
The CA path is borrowed until send returns. Verification cannot be disabled.
TLS 1.2 is the minimum; TLS 1.3 is supported. Missing OpenSSL, trust-store errors,
certificate failures, handshake failures, and deadlines return status 0 with an
error message. HTTPS never falls back to plaintext. An unauthenticated TCP EOF
without TLS close_notify is rejected, even if HTTP bytes were received.

Destroy every heap response exactly once (`response.destroy()` frees the object
itself). Destroy each builder to free owned header strings. Response header/body
pointers expire when the response is destroyed. `Url.parse` returns owned host
and path strings; call its `destroy`. `Url.new` borrows its strings.

Response headers preserve individual field lines. `response.headers.getAll("Set-Cookie")`
returns all cookies without splitting commas in Expires. Destroy the returned
array; its values borrow the response. Ordinary `get` combines repeated list
values; Set-Cookie get returns only the first cookie. The same owning HttpHeaders
API is exported by bpl-http-parser and used across the web stack.

Chunked response decoding shares the incremental bounded decoder with the server.
Trailers are validated and exposed in `response.trailers`, separately from
headers; they cannot introduce framing/authentication/representation metadata.
Chunk extensions accept token and quoted-string values; malformed extensions,
control characters and excessive metadata are rejected.
