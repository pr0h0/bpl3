# bpl-passport-local

Optional username/password strategy for [bpl-passport](../bpl-passport/README.md).
It accepts JSON `{ "username": "student", "password": "..." }`; both fields
are required strings of 1–256 bytes. The body is limited to 2 KiB, embedded raw
NUL bytes are rejected. Malformed JSON and incompatible field types return 400;
missing, empty, or oversized credential strings return 422.
Apply your JSON media-type middleware before the handler. Form bodies, custom
field names, and JavaScript Passport plugins are not supported.

```bpl
import [Passport] from "bpl-passport";
import [LocalStrategy] from "bpl-passport-local";
import [Request], [Response] from "bpl-express";

# Implement using your password-hash library and user store.
# Never compare plaintext stored passwords; also verify a dummy hash for unknown users.
frame verify(context: *void, req: *Request, res: *Response,
             username: string, password: string) ret long {
    # Return a positive user ID after verification, or zero on failure.
    return 0;
}

# In your route handler (or initialize these owners once per worker):
frame login(req: *Request, res: *Response) {
    local passport: Passport = Passport.new();
    local owner: *Passport = &passport;
    defer owner.destroy();
    local strategy: LocalStrategy = LocalStrategy.new(nullptr, verify);
    strategy.install(&passport, "local");
    local user: long = passport.authenticate("local", req, res);
    if (user == 0) { return; }
    # Establish your session here. bpl-auth provides a working implementation.
}
```

`LocalVerifier` is `Func<long>(*void, *Request, *Response, string, string)`.
The callback borrows decoded credentials only for that call. It can send a
policy rejection such as 429, or throw; Passport preserves that behavior.
The strategy borrows your context. `install` borrows the strategy itself: both
must stay at stable addresses until all authentications finish. A LocalStrategy
has no owned resources and needs no destroy call.

Decoded password and raw request body buffers are overwritten before release,
including when verification throws. Credentials are consumed: later middleware
must not expect to parse that body again. This does not guarantee erasure of all
allocator/compiler copies. Linux/glibc `explicit_bzero` prevents these explicit
wipes from being optimized away; no SQLite or libsodium dependency is introduced.

`LocalCredentials.parse(req,res)` and `credentials.destroy(req)` are available
for registration handlers. After a successful parse, the caller owns the result
and must destroy it; always defer `LocalCredentials.wipe(req)` around parsing to
also erase rejected request bodies.

The strategy does not hash passwords, limit attempts, enforce Origin/CSRF,
create sessions, or authorize resources. Your verifier/application supplies those
policies. [bpl-auth](../bpl-auth/README.md) integrates Argon2id, shared throttling,
Origin checks and revocable cookie sessions with this strategy.
