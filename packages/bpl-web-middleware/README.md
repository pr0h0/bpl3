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
listed methods and Content-Type/Authorization headers; mismatches return 403.
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
