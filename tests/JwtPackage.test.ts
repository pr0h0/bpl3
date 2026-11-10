import { test } from "bun:test";
import { createHmac } from "node:crypto";
import { native } from "./helpers/webPackages";

const SECRET = "0123456789abcdef0123456789abcdef";
const LONG_SECRET = SECRET + SECRET;

function b64(text: string | Buffer): string {
  return Buffer.from(text).toString("base64url");
}

function token(
  header: object | string,
  claims: object | string,
  secret: string,
  hash = "sha256",
): string {
  const head = typeof header === "string" ? header : JSON.stringify(header);
  const body = typeof claims === "string" ? claims : JSON.stringify(claims);
  const input = `${b64(head)}.${b64(body)}`;
  return `${input}.${createHmac(hash, secret).update(input).digest("base64url")}`;
}

// BPL string literal for a token (tokens are base64url, so only the quotes matter).
const lit = (text: string) => JSON.stringify(text);

test("bpl-jwt signs tokens that other implementations verify", () => {
  const expected = token(
    { alg: "HS256", typ: "JWT" },
    { sub: "42", name: "Ada", admin: true, exp: 2000000000 },
    SECRET,
  );
  const expected512 = token(
    { alg: "HS512", typ: "JWT" },
    { sub: "42" },
    LONG_SECRET,
    "sha512",
  );
  native(String.raw`
    import [Jwt], [JwtAlgorithm] from "bpl-jwt";
    import [JsonValue] from "bpl-json";
    import [String] from "std/string.bpl";
    extern strcmp(a: string, b: string) ret int;
    frame main() ret int {
        local claims: *JsonValue = JsonValue.newObject();
        claims.setString("sub", "42").setString("name", "Ada").setBool("admin", true).setInt("exp", 2000000000);
        local signed: String = Jwt.sign(claims, "${SECRET}");
        if (strcmp(signed.data, ${lit(expected)}) != 0) { return 1; }
        signed.destroy();
        claims.destroy();
        claims = JsonValue.newObject();
        claims.setString("sub", "42");
        signed = Jwt.signWith(JwtAlgorithm.HS512, claims, "${LONG_SECRET}");
        if (strcmp(signed.data, ${lit(expected512)}) != 0) { return 2; }
        signed.destroy();
        local caught: int = 0;
        try { Jwt.sign(claims, "short secret"); } catch { caught = caught + 1; }
        try { Jwt.signWith(JwtAlgorithm.HS512, claims, "${SECRET}"); } catch { caught = caught + 1; }
        local list: *JsonValue = JsonValue.newArray();
        try { Jwt.sign(list, "${SECRET}"); } catch { caught = caught + 1; }
        list.destroy();
        claims.destroy();
        if (caught != 3) { return 3; }
        return 0;
    }
  `);
}, 90000);

test("bpl-jwt verification pins the algorithm and checks registered claims", () => {
  const now = 1700000000;
  const hs = { alg: "HS256", typ: "JWT" };
  const good = token(
    { typ: "JWT", alg: "HS256" },
    {
      sub: "u1",
      iss: "issuer",
      aud: ["other", "api"],
      exp: now + 60,
      nbf: now - 1,
      iat: now - 5,
    },
    SECRET,
  );
  const [h, p, s] = good.split(".");
  const flipped = `${h}.${p}.${s.slice(0, -2)}${s.slice(-2, -1) === "A" ? "B" : "A"}${s.slice(-1)}`;
  const cases: [string, string][] = [
    [good, ""],
    [flipped, "signature"],
    [token(hs, { exp: now + 60 }, SECRET + "x"), "signature"],
    [`${b64('{"alg":"none"}')}.${p}.`, "algorithm"],
    [`${b64('{"alg":"none"}')}.${p}`, "malformed"],
    [token({ alg: "HS512" }, { exp: now + 60 }, SECRET, "sha512"), "algorithm"],
    [token({ alg: "RS256" }, { exp: now + 60 }, SECRET), "algorithm"],
    [
      token({ alg: "HS256", crit: ["x"] }, { exp: now + 60 }, SECRET),
      "algorithm",
    ],
    [token(hs, { exp: now }, SECRET), "expired"],
    [token(hs, { sub: "x" }, SECRET), "missing-exp"],
    [token(hs, { exp: "soon" }, SECRET), "claims"],
    [token(hs, { exp: now + 60, nbf: now + 30 }, SECRET), "not-yet-valid"],
    [token(hs, { exp: now + 60, iat: now + 30 }, SECRET), "issued-in-future"],
    [token(hs, "[1,2]", SECRET), "claims"],
    [token(hs, '{"exp":', SECRET), "claims"],
    [`${good}.extra`, "malformed"],
    [`${h}=.${p}.${s}`, "malformed"],
    [`${h}.${p}.${s}=`, "malformed"],
    ["not-a-token", "malformed"],
    [`${b64("[]")}.${p}.${s}`, "malformed"],
  ];
  const checks = cases
    .map(
      ([t, err], i) =>
        `if (!expect(${lit(t)}, ${lit(err)}, &options)) { return ${10 + i}; }`,
    )
    .join("\n");
  // A 22-byte header leaves four unused bits in its last base64url character.
  // Setting one keeps the decoded bytes, so only the canonical-encoding check
  // can reject this otherwise correctly signed token.
  const head22 = b64('{"alg":"HS256","x":12}');
  const tweaked = head22.slice(0, -1) + "R";
  if (Buffer.from(tweaked, "base64url").toString() !== '{"alg":"HS256","x":12}')
    throw new Error("fixture no longer exercises unused bits");
  const body = b64(JSON.stringify({ sub: "u2", exp: now + 60 }));
  const nonCanonical = `${tweaked}.${body}.${createHmac("sha256", SECRET).update(`${tweaked}.${body}`).digest("base64url")}`;
  const canonical = `${head22}.${body}.${createHmac("sha256", SECRET).update(`${head22}.${body}`).digest("base64url")}`;
  native(String.raw`
    import [Jwt], [JwtOptions], [JwtResult] from "bpl-jwt";
    import [JsonValue] from "bpl-json";
    extern strcmp(a: string, b: string) ret int;
    frame expect(token: string, error: string, options: *JwtOptions) ret bool {
        local result: JwtResult = Jwt.verifyWith(token, "${SECRET}", options);
        local matched: bool = (strcmp(result.error, error) == 0) && (result.ok == (error[0] == 0));
        if (result.ok && (result.claims.getString("sub", "")[0] != 'u')) {
            matched = false;
        }
        if (!result.ok && (strcmp(error, "signature") == 0) && (result.claims != nullptr)) {
            matched = false;
        }
        result.destroy();
        return matched;
    }
    frame main() ret int {
        local options: JwtOptions = JwtOptions.defaults();
        options.now = ${now};
        options.issuer = "issuer";
        options.audience = "api";
        ${checks}
        options.audience = "web";
        if (!expect(${lit(good)}, "audience", &options)) { return 2; }
        options.audience = nullptr;
        options.issuer = "other";
        if (!expect(${lit(good)}, "issuer", &options)) { return 3; }
        options.issuer = nullptr;
        options.now = ${now + 60 + 5};
        if (!expect(${lit(good)}, "expired", &options)) { return 4; }
        options.leeway = 10;
        if (!expect(${lit(good)}, "", &options)) { return 5; }
        options.max_length = 40;
        if (!expect(${lit(good)}, "malformed", &options)) { return 6; }
        options.max_length = 8192;
        if (!expect(${lit(canonical)}, "", &options) || !expect(${lit(nonCanonical)}, "malformed", &options)) { return 7; }
        local peek: *JsonValue = Jwt.decodeUnverified(${lit(flipped)});
        if (peek == nullptr || strcmp(peek.getString("iss", ""), "issuer") != 0) { return 8; }
        peek.destroy();
        local caught: bool = false;
        options.leeway = -1;
        try { Jwt.verifyWith(${lit(good)}, "${SECRET}", &options); } catch { caught = true; }
        if (!caught) { return 9; }
        return 0;
    }
  `);
}, 90000);
