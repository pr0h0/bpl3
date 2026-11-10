# bpl-jwt

JSON Web Tokens (RFC 7519) in compact JWS form, signed with HMAC-SHA256
(`HS256`) or HMAC-SHA512 (`HS512`). Claims are
[bpl-json](../bpl-json/README.md) objects.

```bpl
import [Jwt], [JwtOptions], [JwtResult] from "bpl-jwt";
import [JsonValue] from "bpl-json";
import [String] from "std/string.bpl";
import [Time] from "std/time.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    local secret: string = "replace-with-32-or-more-random-bytes!!";
    local claims: *JsonValue = JsonValue.newObject();
    claims.setString("sub", "user-42").setString("iss", "college-web").setInt("exp", Time.nowSeconds() + 3600);
    local token: String = Jwt.sign(claims, secret);
    claims.destroy();

    local options: JwtOptions = JwtOptions.defaults();
    options.issuer = "college-web";
    local result: JwtResult = Jwt.verifyWith(token.data, secret, &options);
    if (result.ok) {
        printf("hello %s\n", result.claims.getString("sub", "?"));
    } else {
        printf("rejected: %s\n", result.error);
    }
    result.destroy();
    token.destroy();
    return 0;
}
```

## Signing

`Jwt.sign(claims, secret)` signs with HS256 and
`Jwt.signWith(JwtAlgorithm.HS512, claims, secret)` with HS512. The header is
`{"alg":"...","typ":"JWT"}`; claims are serialized compactly in member order
and are borrowed, not consumed. The secret must be at least as long as the MAC
(32 bytes for HS256, 64 for HS512), as RFC 7518 requires; shorter secrets
throw. Generate secrets with `Entropy.hexToken` from `std/entropy.bpl` and keep
them out of source control.

## Verification

`Jwt.verify(token, secret)` uses `JwtOptions.defaults()`;
`Jwt.verifyWith(token, secret, &options)` takes explicit options:

| Option        | Default   | Meaning                                                           |
| ------------- | --------- | ----------------------------------------------------------------- |
| `algorithm`   | `HS256`   | The only algorithm accepted; the header must name it exactly      |
| `now`         | `0`       | Unix seconds treated as the current time; `0` reads the clock     |
| `leeway`      | `0`       | Allowed clock skew for `exp`, `nbf` and `iat` (0 to 3600 seconds) |
| `require_exp` | `true`    | Reject tokens without `exp`                                       |
| `issuer`      | `nullptr` | When set, `iss` must equal it                                     |
| `audience`    | `nullptr` | When set, `aud` (a string or array of strings) must contain it    |
| `max_length`  | `8192`    | Longer tokens are rejected before decoding                        |

The result's `ok` is true only when every check passed. Otherwise `error` is
one of `malformed`, `algorithm`, `signature`, `claims`, `expired`,
`not-yet-valid`, `issued-in-future`, `missing-exp`, `issuer` or `audience`.
`header` holds the decoded header when it parsed, and `claims` is set only
after the signature verified, so a forged token never exposes claims through
the result. Destroy every result.

Hardening built into verification:

- The algorithm is chosen by the verifier, never by the token. `none`,
  asymmetric names (`RS256`, `ES256`, ...) and any other HMAC size are
  rejected, which rules out algorithm-confusion attacks. Headers with `crit`
  or `cty` (nested tokens) are rejected too.
- Signatures are compared in constant time with `Hmac.equal`.
- Segments must be unpadded base64url in canonical form (unused bits zero),
  and header and claims must be JSON objects with at most 32 nesting levels.
- `exp` is exclusive: a token is expired at the second it names.

`Jwt.decodeUnverified(token)` returns the claims without checking anything.
Use it only for logging or to pick a key, never for authorization.

Not included: RSA/ECDSA signatures, JWE encryption, JWKS key sets and key
rotation helpers. With several active secrets, try each in turn (the
`signature` error is safe to retry), or put a key id in the claims and look
it up with `decodeUnverified` before verifying.
