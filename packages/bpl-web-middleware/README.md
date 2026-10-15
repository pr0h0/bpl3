# bpl-web-middleware

Optional middleware and form decoding for bpl-express.

```bpl
import [App] from "bpl-express";
import securityHeaders from "bpl-web-middleware";
frame main() {
    local app: App = App.new();
    app.use(securityHeaders);
    app.listen(3000);
}
```

`securityHeaders` adds nosniff, frame denial, and a same-origin referrer policy.
It does not add a Content Security Policy: configure one appropriate to your app.
Router middleware does not apply to `App.useStatic`, which serves public assets
before routing. Register `requireJson` on a JSON-only subrouter: it rejects
requests whose content type is not application/json (case-insensitive, with
optional parameters). It checks the media type, not the JSON syntax; parse and
validate the body in the handler.

Wrap `cors(req, res, "https://your-frontend.example")` in a normal RouteHandler
for a single explicit origin policy. Matching preflights return 204 with the
listed methods and Content-Type/Authorization/X-CSRF-Token headers; mismatches return 403.
The function appends Origin to Vary and does not permit wildcard origins or
cross-origin cookie credentials. CORS is a browser policy, not authentication
or authorization. Same-origin applications usually need no CORS middleware.

`Form.parse(body, byteCount)` decodes application/x-www-form-urlencoded text.
It rejects embedded NULs, malformed escapes, decoded NUL, and bodies over 1 MiB.
Use `form.get(key)` (Option<string>); repeated keys keep the last value and a
bare key has an empty value. The form owns its strings; `destroy()` releases
all fields. Verify the request content type yourself. Multipart uploads are
not supported. Forms and cookie-authenticated mutations need an application
CSRF policy; this package does not implement sessions or authentication.

## Request IDs and completion logs

```bpl
import requestId, accessLog from "bpl-web-middleware";
app.beforeRequest(requestId);
app.afterRequest(accessLog);
```

Before-request middleware runs on every successfully parsed request, including
static assets, and short-circuits when a response is sent. Completion observers
run after the response attempt, before request/response destruction. Observer
exceptions are contained and produce a generic diagnostic. App.use and router
middleware keep their routing behavior.

requestId generates a process/monotonic-time/sequence ID, stores request.id in
private request state, and sets X-Request-ID. Incoming IDs are not trusted. The
ID is for correlation, not a secret or an authentication token. accessLog writes
one bounded JSON line with that ID, method, registered route pattern (relative
inside mounted routers), status, duration, timestamp, and handler/I/O failure
flags. Static routes use [static], and unmatched routes use [unmatched]. Actual
URL parameter values, query strings, headers, bodies, and exception messages are
omitted. Duration includes TLS/request assembly and response writes after accept.
Malformed HTTP and failed TLS handshakes do not have parsed-request middleware
records. Startup/observer diagnostics are separate plain-text messages.

AccessLog.write(req,res,fd) selects a caller-owned log descriptor and returns
false on failed/partial writes. Records are at most Linux PIPE_BUF bytes and use
one write so worker JSON records are not interleaved on a shared pipe. A blocking
log sink can delay a worker; use a dedicated nonblocking pipe if the consumer can
stall, and monitor dropped records. Log collection and retention are deployment
choices, not services loaded into the framework.

## Configurable CORS

`Cors.new("https://frontend.example")` creates an owning policy. Add explicit
origins with allowOrigin, methods with allowMethod, header names with allowHeader
and response headers with exposeHeader. Defaults allow GET/HEAD/POST/PUT/PATCH/
DELETE/OPTIONS and Content-Type, Authorization, X-CSRF-Token. Set credentials=true
for Access-Control-Allow-Credentials, and max_age to 0–86400 seconds. Call
policy.apply(req,res) from a middleware wrapper; destroy the policy after its
last request. Origin strings are copied. Wildcard and opaque/null origins are
unsupported. A preflight is OPTIONS with Access-Control-Request-Method; ordinary
OPTIONS requests remain available to routing. Requested methods and all requested
headers must be allowed; denied preflights return 403 without allow-origin.
Vary includes Origin and both preflight request fields. The exported vary helper
preserves existing Vary tokens and avoids duplicates.

Credentialed CORS does not change Auth's exact Origin/CSRF policy or a cookie's
SameSite attributes. Configure those application policies deliberately; enabling
CORS alone does not make cross-site Auth login available.

## Media negotiation and optional gzip

`Negotiation.best(req,&offers)` selects a borrowed string from an Array<string>
of offered media types using Accept quality values, specificity and matching
media parameters. Parameters refine an already matching media range; they cannot
make a different type or subtype acceptable. Server offer order breaks ties. Missing Accept allows every
offer; no acceptable candidate returns None. `accepts(req,media)` tests one
candidate; `require(req,res,media)` adds Vary: Accept and returns false after a
JSON 406 on rejection. Offers can include parameters, such as
`application/json;profile=one`. Explicit q=0 overrides a matching wildcard.
`encoding(req,name)` returns 0–1000 for an Accept-Encoding candidate and accounts
for identity's implicit acceptance and explicit exclusions. Helpers do not pick
an application handler or transform a representation automatically.

`compression(req,res)` or `Compression.attach(req,res)` installs a transform for
buffered send/sendBytes/json/text/html responses. It negotiates gzip versus
identity, adds Vary: Accept-Encoding, honors no-transform case-insensitively,
and keeps the uncompressed body when gzip is larger or identity is preferred.
The gzip envelope is deterministic; zlib provides DEFLATE and CRC32. libz.so.1
loads dynamically only when encoding a body; no extra linker flag is needed.
If the library is unavailable, identity remains the fallback when acceptable,
otherwise the response is 406. Encoding rejects buffers over 8 MiB; middleware
falls back to acceptable identity. CompressedBytes owns the returned buffer from
Compression.gzip and must be destroyed.

Compression skips existing Content-Encoding, non-200 and Content-Range responses.
It does not compress write/end streaming, decode request bodies, or decompress
HTTP client responses. HEAD calculates the same encoding/length metadata without
sending body bytes. Strong ETags are weakened after transformation; 204/304 have
no body to transform. Attach before headers start and keep the borrowed request
alive through sending. The response transform prevents recursive invocation and
resets its guard when a transform throws.

Opt in on public/static routes or selected responses. Avoid indiscriminately
compressing responses containing secrets alongside attacker-controlled text;
the college app enables compression only for public assets, behind an explicit
configuration flag. Caching validators belong to the selected representation.
