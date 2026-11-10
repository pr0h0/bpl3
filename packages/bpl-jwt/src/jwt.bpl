# Compact JWS / JWT (RFC 7515, RFC 7519) with HMAC algorithms.

import [Json], [JsonValue], [JsonError] from "bpl-json";
import [Base64] from "std/base64.bpl";
import [Hmac], [HmacSha512] from "std/hmac.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [Time] from "std/time.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;

export [Jwt];
export [JwtAlgorithm];
export [JwtOptions];
export [JwtResult];

enum JwtAlgorithm {
    HS256,
    HS512,
}

struct JwtOptions {
    # Algorithm the verifier accepts. The token header must name exactly
    # this algorithm; "none" and asymmetric names are always refused.
    algorithm: JwtAlgorithm,
    # Unix seconds used as "now"; 0 reads the system clock.
    now: long,
    # Allowed clock skew in seconds for exp/nbf/iat (0 to 3600).
    leeway: long,
    # Reject tokens without an "exp" claim.
    require_exp: bool,
    # When non-null, "iss" must equal this string.
    issuer: string,
    # When non-null, "aud" (string or array of strings) must contain it.
    audience: string,
    # Tokens longer than this many bytes are refused before decoding.
    max_length: long,
    frame defaults() ret JwtOptions {
        local options: JwtOptions;
        options.algorithm = JwtAlgorithm.HS256;
        options.now = 0;
        options.leeway = 0;
        options.require_exp = true;
        options.issuer = nullptr;
        options.audience = nullptr;
        options.max_length = 8192;
        return options;
    }
}

struct JwtResult {
    ok: bool,
    # Static reason when verification failed: "malformed", "algorithm",
    # "signature", "expired", "not-yet-valid", "issued-in-future",
    # "missing-exp", "issuer", "audience", "claims". Empty on success.
    error: string,
    # Decoded header and claims (owned). Claims are only set when the
    # signature verified; the header is set whenever it decoded.
    header: *JsonValue,
    claims: *JsonValue,
    frame failure(error: string) ret JwtResult {
        local result: JwtResult;
        result.ok = false;
        result.error = error;
        result.header = nullptr;
        result.claims = nullptr;
        return result;
    }
    frame destroy(this: *JwtResult) {
        if (this.header != nullptr) {
            this.header.destroy();
        }
        if (this.claims != nullptr) {
            this.claims.destroy();
        }
        this.header = nullptr;
        this.claims = nullptr;
    }
}

struct Jwt {
    frame name(algorithm: JwtAlgorithm) ret string {
        if (algorithm == JwtAlgorithm.HS512) {
            return "HS512";
        }
        return "HS256";
    }
    frame macLength(algorithm: JwtAlgorithm) ret int {
        if (algorithm == JwtAlgorithm.HS512) {
            return 64;
        }
        return 32;
    }
    frame mac(algorithm: JwtAlgorithm, secret: string, secretLength: long, data: string, length: long, out: *u8) {
        if (algorithm == JwtAlgorithm.HS512) {
            HmacSha512.digest(cast<*u8>(secret), secretLength, cast<*u8>(data), length, out);
        } else {
            Hmac.digest(cast<*u8>(secret), secretLength, cast<*u8>(data), length, out);
        }
    }
    frame checkSecret(algorithm: JwtAlgorithm, secret: string) ret long {
        if (secret == nullptr) {
            throw "JWT secret is required";
        }
        local length: long = strlen(secret);
        # RFC 7518 3.2: the key must be at least as long as the hash output.
        if (length < cast<long>(Jwt.macLength(algorithm))) {
            throw "JWT secret is shorter than the MAC (32 bytes for HS256, 64 for HS512)";
        }
        return length;
    }

    # Signs `claims` (any JSON object) with HS256. The claims are borrowed.
    frame sign(claims: *JsonValue, secret: string) ret String {
        return Jwt.signWith(JwtAlgorithm.HS256, claims, secret);
    }
    frame signWith(algorithm: JwtAlgorithm, claims: *JsonValue, secret: string) ret String {
        if ((claims == nullptr) || !claims.isObject()) {
            throw "JWT claims must be a JSON object";
        }
        local secretLength: long = Jwt.checkSecret(algorithm, secret);
        local header: *JsonValue = JsonValue.newObject();
        header.setString("alg", Jwt.name(algorithm)).setString("typ", "JWT");
        local headerText: String = header.stringify();
        header.destroy();
        local claimsText: String = claims.stringify();
        local out: StringBuilder = StringBuilder.new(256);
        local owner: *StringBuilder = &out;
        defer owner.destroy();
        local part: string = Base64.encodeStringUrl(headerText.data);
        out.append(part);
        free(part);
        out.appendChar('.');
        part = Base64.encodeStringUrl(claimsText.data);
        out.append(part);
        free(part);
        headerText.destroy();
        claimsText.destroy();
        local digest: u8[64];
        Jwt.mac(algorithm, secret, secretLength, out.toString(), cast<long>(out.len()), &digest[0]);
        part = Base64.encodeUrl(&digest[0], Jwt.macLength(algorithm));
        out.appendChar('.');
        out.append(part);
        free(part);
        return String.new(out.toString());
    }

    # Unpadded base64url with canonical trailing bits; returns an owned
    # buffer (NUL-terminated) and its length, or nullptr.
    frame decodeSegment(token: string, start: long, end: long, length: *int) ret string {
        local size: long = end - start;
        if ((size == 0) || ((size % 4) == 1)) {
            return nullptr;
        }
        local segment: string = cast<string>(malloc(size + 1));
        if (segment == nullptr) {
            throw "JWT allocation failed";
        }
        loop (local i: long = 0; i < size; i = i + 1) {
            local c: char = token[start + i];
            if (!(((c >= 'A') && (c <= 'Z')) || ((c >= 'a') && (c <= 'z')) || ((c >= '0') && (c <= '9')) || (c == '-') || (c == '_'))) {
                free(segment);
                return nullptr;
            }
            segment[i] = c;
        }
        segment[size] = 0;
        local buffer: *u8 = cast<*u8>(malloc(size + 1));
        if (buffer == nullptr) {
            free(segment);
            throw "JWT allocation failed";
        }
        local decoded: int = Base64.decodeUrl(segment, buffer);
        if (decoded < 0) {
            free(segment);
            free(cast<*void>(buffer));
            return nullptr;
        }
        # Reject non-canonical encodings (nonzero unused bits), so each
        # payload has exactly one valid token spelling.
        local again: string = Base64.encodeUrl(buffer, decoded);
        local canonical: bool = strcmp(again, segment) == 0;
        free(again);
        free(segment);
        if (!canonical) {
            free(cast<*void>(buffer));
            return nullptr;
        }
        buffer[decoded] = cast<u8>(0);
        length[0] = decoded;
        return cast<string>(buffer);
    }
    frame decodeJson(token: string, start: long, end: long) ret *JsonValue {
        local length: int = 0;
        local text: string = Jwt.decodeSegment(token, start, end, &length);
        if (text == nullptr) {
            return nullptr;
        }
        local error: JsonError = JsonError.none();
        local value: *JsonValue = Json.parseBytes(text, cast<long>(length), 32, &error);
        free(text);
        if ((value != nullptr) && !value.isObject()) {
            value.destroy();
            return nullptr;
        }
        return value;
    }

    # Verifies an HS256 token with default options (exp required, no skew).
    frame verify(token: string, secret: string) ret JwtResult {
        local options: JwtOptions = JwtOptions.defaults();
        return Jwt.verifyWith(token, secret, &options);
    }
    frame verifyWith(token: string, secret: string, options: *JwtOptions) ret JwtResult {
        if ((options.leeway < 0) || (options.leeway > 3600)) {
            throw "JWT leeway must be 0 to 3600 seconds";
        }
        local secretLength: long = Jwt.checkSecret(options.algorithm, secret);
        if (token == nullptr) {
            return JwtResult.failure("malformed");
        }
        local length: long = strlen(token);
        if (length > options.max_length) {
            return JwtResult.failure("malformed");
        }
        local firstDot: long = -1;
        local secondDot: long = -1;
        loop (local i: long = 0; i < length; i = i + 1) {
            if (token[i] == '.') {
                if (firstDot < 0) {
                    firstDot = i;
                } else if (secondDot < 0) {
                    secondDot = i;
                } else {
                    return JwtResult.failure("malformed");
                }
            }
        }
        if (secondDot < 0) {
            return JwtResult.failure("malformed");
        }
        local result: JwtResult = JwtResult.failure("malformed");
        result.header = Jwt.decodeJson(token, 0, firstDot);
        if (result.header == nullptr) {
            return result;
        }
        local alg: *JsonValue = result.header.get("alg");
        if ((alg == nullptr) || !alg.isString() || (strcmp(alg.text, Jwt.name(options.algorithm)) != 0)) {
            result.error = "algorithm";
            return result;
        }
        # Nested or encrypted tokens and critical extensions are not handled.
        local contentType: *JsonValue = result.header.get("cty");
        if ((contentType != nullptr) || result.header.has("crit")) {
            result.error = "algorithm";
            return result;
        }
        local signatureLength: int = 0;
        local signature: string = Jwt.decodeSegment(token, secondDot + 1, length, &signatureLength);
        if (signature == nullptr) {
            return result;
        }
        local expected: u8[64];
        Jwt.mac(options.algorithm, secret, secretLength, token, secondDot, &expected[0]);
        local valid: bool = (signatureLength == Jwt.macLength(options.algorithm)) && Hmac.equal(cast<*u8>(signature), &expected[0], cast<long>(signatureLength));
        free(signature);
        if (!valid) {
            result.error = "signature";
            return result;
        }
        local claims: *JsonValue = Jwt.decodeJson(token, firstDot + 1, secondDot);
        if (claims == nullptr) {
            result.error = "claims";
            return result;
        }
        result.claims = claims;
        local now: long = options.now;
        if (now == 0) {
            now = Time.nowSeconds();
        }
        local exp: *JsonValue = claims.get("exp");
        if (exp == nullptr) {
            if (options.require_exp) {
                result.error = "missing-exp";
                return result;
            }
        } else if (!exp.isNumber()) {
            result.error = "claims";
            return result;
        } else if ((cast<double>(now - options.leeway)) >= exp.number) {
            result.error = "expired";
            return result;
        }
        local nbf: *JsonValue = claims.get("nbf");
        if (nbf != nullptr) {
            if (!nbf.isNumber()) {
                result.error = "claims";
                return result;
            }
            if (cast<double>(now + options.leeway) < nbf.number) {
                result.error = "not-yet-valid";
                return result;
            }
        }
        local iat: *JsonValue = claims.get("iat");
        if (iat != nullptr) {
            if (!iat.isNumber()) {
                result.error = "claims";
                return result;
            }
            if (cast<double>(now + options.leeway) < iat.number) {
                result.error = "issued-in-future";
                return result;
            }
        }
        if (options.issuer != nullptr) {
            local iss: *JsonValue = claims.get("iss");
            if ((iss == nullptr) || !iss.isString() || (strcmp(iss.text, options.issuer) != 0)) {
                result.error = "issuer";
                return result;
            }
        }
        if (options.audience != nullptr) {
            local aud: *JsonValue = claims.get("aud");
            local matched: bool = false;
            if ((aud != nullptr) && aud.isString()) {
                matched = strcmp(aud.text, options.audience) == 0;
            } else if ((aud != nullptr) && aud.isArray()) {
                loop (local i: int = 0; i < aud.len(); i = i + 1) {
                    local entry: *JsonValue = aud.at(i);
                    if (entry.isString() && (strcmp(entry.text, options.audience) == 0)) {
                        matched = true;
                    }
                }
            }
            if (!matched) {
                result.error = "audience";
                return result;
            }
        }
        result.ok = true;
        result.error = "";
        return result;
    }

    # Decodes the claims WITHOUT verifying the signature, for logging or
    # choosing a key. Never trust the result. Caller destroys it.
    frame decodeUnverified(token: string) ret *JsonValue {
        if (token == nullptr) {
            return nullptr;
        }
        local length: long = strlen(token);
        local firstDot: long = -1;
        local secondDot: long = -1;
        loop (local i: long = 0; i < length; i = i + 1) {
            if (token[i] == '.') {
                if (firstDot < 0) {
                    firstDot = i;
                } else if (secondDot < 0) {
                    secondDot = i;
                } else {
                    return nullptr;
                }
            }
        }
        if (secondDot < 0) {
            return nullptr;
        }
        return Jwt.decodeJson(token, firstDot + 1, secondDot);
    }
}
