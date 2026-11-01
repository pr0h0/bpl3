# Standard Library API Reference

This guide describes selected APIs and their current limitations. The generated
[declaration reference](stdlib-reference.md) covers every BPL module under `lib/`,
including exports, overloads, fields, and low-level modules. Regenerate it with
`bun run docs:stdlib`; a regression test checks it for drift.

Prefer importing a specific module when you only need its APIs. `std` re-exports
many modules but not every symbol. Check its export list in the declaration
reference. Resource ownership is explicit: most library `destroy` methods are
ordinary methods, and containers generally do not destroy element-owned resources.

## Core Modules

### Math (`std/math.bpl`)

Mathematical functions and constants. See [Math Documentation](32-stdlib-math.md).

### Algorithm (`std/algorithm.bpl`)

Array algorithms (sorting, searching, etc.). See [Algorithm Documentation](34-stdlib-algorithms.md).

### Array (`std/array.bpl`)

Dynamic array implementation with generics.

### Deque (`std/deque.bpl`)

Generic double-ended queue with checked indexed access, front/back insertion
and removal, reserve, cloning, and iteration. See the
[collections reference](30-stdlib-collections.md#deque).

### String (`std/string.bpl`)

String manipulation utilities. See [String Documentation](29-stdlib-string.md).

### IO (`std/io.bpl`)

Input/output operations. See [IO Documentation](28-stdlib-io.md).

### FS (`std/fs.bpl`)

File system operations. See [FS Documentation](31-stdlib-fs.md).

### Time (`std/time.bpl`)

Time and duration utilities. See [Time Documentation](33-stdlib-time.md).

### CLI Args (`std/args.bpl`, `std/arg_parser.bpl`)

Command-line argument helpers are available directly through `std`:

```bpl
import [Args], [ArgParser], [Command], [Flag], [ParsedArgs] from "std";
```

`Args.new(argc, argv)` wraps process arguments. `Command`, `Flag`, and
`ArgParser` provide a small command parser for flags, aliases, arguments, help
text, and parsed flag lookup.

`parse()` applies flag defaults, checks required positional arguments for each
selected command, and invokes the final command's `setAction` handler once if
there are no parsing errors. `ParsedArgs.errorCount` counts parsing errors;
`exitCode` is 1 on a parsing error or the handler's return value on success
(0 when no handler is set). The caller owns and must destroy the returned
`ParsedArgs` even when parsing fails. Diagnostics go to stderr.

Flags accept `--name=value` or a separate value. A following option is not
consumed as a missing value; use `--name=-filename` for a value beginning with
an option prefix. Negative decimal numbers and a lone `-` are operands.
`--` stops both option and subcommand recognition for the remaining tokens.

### JSON (`std/json.bpl`)

JSON helpers are available directly through `std`:

```bpl
import [JSON], [Jsonable], [JsonToResult], [JsonParseResult] from "std";
```

`JSON.stringify<T>(&value)` serializes primitive and reflected values into a
`String`. `JSON.parse<T>(json)` parses into an allocated `*T`; callers own the
returned value and any nested resources and must release them with `JSON.free<T>`.
Serialization and parsing support different primitive types, enum payloads are
not a general round trip, and malformed/unsupported input still has parser
limitations. See [Reflection and JSON](55-reflection-and-json.md) for exact
ownership, hooks, supported types, and known failures.

### Logging (`std/log.bpl`)

`Log.debug`, `Log.info`, `Log.warn`, and `Log.error` write one line each;
`Log.write(level, msg)` takes the level as a `LogLevel` (`Debug`, `Info`,
`Warn`, `Error`, `Off`). Both types are also exported by `std`.

- `Log.setLevel(LogLevel.Warn)` drops less severe messages, and
  `LogLevel.Off` drops all of them. `Log.enabled(level)` tells whether a
  message at `level` would be written, so expensive messages can be skipped.
- `Log.levelFromEnv()` sets the level from `BPL_LOG_LEVEL` (`debug`, `info`,
  `warn`, `error` or `off`, lower or upper case) and returns false, leaving
  the level unchanged, when the variable is unset or unrecognized.
- `Log.setPrefix(true)` starts each line with `[DEBUG] `, `[INFO] `,
  `[WARN] ` or `[ERROR] `.
- `Log.setTimestamps(true)` starts each line with the current UTC time in
  ISO 8601 with milliseconds, such as `2026-11-01T12:34:56.789Z `, before any
  level prefix.
- `Log.useStderr(true)` writes to standard error instead of standard output.

By default every level is written to standard output without a prefix. The
settings are process-wide.

```bpl
import [Log], [LogLevel] from "std/log.bpl";

frame main() ret int {
    Log.setPrefix(true);
    Log.setLevel(LogLevel.Info);
    Log.levelFromEnv();
    Log.debug("hidden unless BPL_LOG_LEVEL=debug");
    Log.info("started");
    return 0;
}
```

---

## Numeric Types

### Range (`std/range.bpl`)

Ranges include their start and exclude their end; `betweenInclusive` includes
both endpoints. `get(index)` and `range[index]` use zero-based indices and throw
`"Range index out of bounds"` for negative indices, empty ranges, entries past
the endpoint, or values outside the `int` range. Zero steps and steps pointing
away from the endpoint describe empty sequences.

Valid indexing does not require the total length to fit `int`. Calling `len()`
on a longer sequence still throws `"Range length exceeds int"`.

### Stats (`std/stats.bpl`)

Statistical functions for numerical analysis.

**Functions (overloaded for int/float arrays):**

- `Stats.mean(data: *int, length: int) ret float` - Calculate mean
- `Stats.mean(data: *float, length: int) ret float`
- `Stats.sum(data: *int, length: int) ret long` - Sum of elements
- `Stats.sum(data: *float, length: int) ret float`
- `Stats.min(data: *int, length: int) ret int` - Minimum value
- `Stats.min(data: *float, length: int) ret float`
- `Stats.max(data: *int, length: int) ret int` - Maximum value
- `Stats.max(data: *float, length: int) ret float`
- `Stats.range(data: *int, length: int) ret int` - Max - Min; throws `"Stats.range result exceeds int"` if the difference exceeds 2,147,483,647
- `Stats.range(data: *float, length: int) ret float`
- `Stats.variance(data: *int, length: int) ret float` - Population variance
- `Stats.variance(data: *float, length: int) ret float`
- `Stats.sampleVariance(data: *int, length: int) ret float` - Sample variance
- `Stats.sampleVariance(data: *float, length: int) ret float`
- `Stats.stddev(data: *int, length: int) ret float` - Population std deviation
- `Stats.stddev(data: *float, length: int) ret float`
- `Stats.sampleStddev(data: *int, length: int) ret float` - Sample std deviation
- `Stats.sampleStddev(data: *float, length: int) ret float`
- `Stats.covariance(dataX: *float, dataY: *float, length: int) ret float` - Population covariance
- `Stats.correlation(dataX: *float, dataY: *float, length: int) ret float` - Pearson correlation
- `Stats.median(data: *int, length: int) ret float` - Median value
- `Stats.median(data: *float, length: int) ret float`
- `Stats.geometricMean(data: *float, length: int) ret float` - Geometric mean of positive samples
- `Stats.harmonicMean(data: *float, length: int) ret float` - Harmonic mean of positive samples

Floating `Stats.mean` uses compensated summation to limit cancellation error.
When the unscaled sum may overflow, it divides samples by the final count before
accumulation. A bounded normalized fallback handles sums that still overflow
because of rounding near the finite limit. Null or empty input returns zero;
nonfinite inputs retain ordinary sum semantics.

`Stats.geometricMean` uses compensated logarithm accumulation and keeps finite
positive results within the input bounds. Identical positive samples return that
sample exactly. Null or empty input returns zero. Any nonpositive sample returns
zero, including when a NaN is also present. Otherwise NaNs propagate, and positive
infinity produces an infinite mean.

`Stats.harmonicMean` scales reciprocal terms by the smallest sample. For finite
positive samples, its result stays between their minimum and maximum. Null or
empty input returns zero. Validation runs in input order: a nonpositive value
returns zero, while a NaN encountered earlier returns NaN. An all-positive-infinity
group returns positive infinity.

Floating variance calculations center samples before updating the mean, preserving
small spreads around large offsets. The scaled path also centers differences
before division when they are finite, retaining close-value gaps.

Floating `Stats.variance` and `Stats.sampleVariance` use a scaled fallback when
intermediate arithmetic overflows or rounds to zero. This also recovers
representable subnormal results; variance exceeding the floating range returns
positive infinity.
Floating standard-deviation methods take a scaled square root when intermediate
variance overflows or becomes subnormal (including zero), retaining representable
roots.

`Stats.covariance` centers and scales both axes independently to preserve finite
results across large offsets and magnitudes. Centered products are recomputed
with compensated accumulation and a rounded-mean correction before rescaling,
limiting cancellation errors. If subtraction loses mixed-magnitude contributions,
a compensated raw-moment fallback retains them while keeping close-offset axes
centered. `Stats.correlation` uses normalized
joint moments directly, keeping finite coefficients within [-1, 1] without an
overflowing or underflowing product of dimensional standard deviations. Existing
zero results for empty or constant-axis inputs are preserved.

`Stats.skewness` and `Stats.kurtosis` compute standardized third/fourth moments
in centered, normalized units, avoiding raw subtraction overflow and preserving
small represented spreads. Kurtosis subtracts three for excess kurtosis; both
methods retain zero for constant samples and their existing minimum lengths.

`Stats.harmonicMean(data: *float, length: int)` returns positive infinity when
all samples are positive infinity. In a mixture with finite positive samples,
infinite samples contribute zero reciprocals.

`Stats.percentile(data: *float, length: int, p: float)` sorts the samples and
interpolates at percentile `p`, clamping it to 0–100. A NaN percentile returns
NaN before sorting nonempty input. Null or empty input returns zero.

### Complex (`std/complex.bpl`)

Complex number arithmetic.

**Creation:**

- `Complex.new(real: float, imag: float) ret Complex`
- `Complex.fromReal(real: float) ret Complex`
- `Complex.fromImag(imag: float) ret Complex`
- `Complex.fromPolar(magnitude: float, angle: float) ret Complex`
- `Complex.zero() ret Complex`
- `Complex.one() ret Complex`
- `Complex.i() ret Complex` - Returns imaginary unit

**Operations:**

- `c.add(other: Complex) ret Complex`
- `c.sub(other: Complex) ret Complex`
- `c.mul(other: Complex) ret Complex`
- `c.div(other: Complex) ret Complex`
- `c.scale(scalar: float) ret Complex`
- `c.negate() ret Complex`
- `c.conjugate() ret Complex`
- `c.reciprocal() ret Complex`

**Properties:**

- `c.abs() ret float` - Magnitude
- `c.absSquared() ret float` - Magnitude squared
- `c.phase() ret float` - Angle in radians

**Advanced:**

- `c.pow(n: int) ret Complex` - Integer power
- `c.pow(exponent: Complex) ret Complex` - Complex power
- `c.sqrt() ret Complex`
- `c.exp() ret Complex`
- `c.log() ret Complex`
- `c.sin() ret Complex`
- `c.cos() ret Complex`

`Complex.exp()` preserves representable components when the intermediate real
exponential overflows, and avoids prematurely rounding underflow-tail components.
Zero imaginary axes preserve their sign, including nonfinite real inputs.

`Complex.sin()` and `Complex.cos()` use a small-input hyperbolic series to retain
tiny imaginary components, and scale large exponential products before multiplying their
trigonometric factors. These calculations use the existing exponential, sine,
and cosine providers.

`Complex.sqrt()` computes the principal root in scaled Cartesian coordinates,
avoiding an overflowing intermediate magnitude. It preserves signed-zero
branch-cut directions and derives the smaller output from the original imaginary
component so mixed scales do not erase a representable result. Infinities and
NaNs are handled explicitly.

`Complex.log()` computes its real part without materializing the magnitude,
avoiding intermediate overflow for large finite components and preserving
small logarithmic corrections near unit magnitude. Its imaginary part is the
phase returned by `atan2`.

### Rational (`std/rational.bpl`)

Rational number (fraction) arithmetic.

**Creation:**

- `Rational.new(numerator: long, denominator: long) ret Rational`

- `Rational.fromInt(value: int) ret Rational`
- `Rational.fromLong(value: long) ret Rational`
- `Rational.zero() ret Rational`
- `Rational.one() ret Rational`

The constructor reduces common factors before normalizing signs. It returns the
invalid `0/0` sentinel for a zero denominator or when the reduced fraction cannot
have a positive `long` denominator and a representable `long` numerator. For
example, `new(1, LONG_MIN)` and `new(LONG_MIN, -1)` are invalid, while
`new(LONG_MIN, -2)` reduces to `4611686018427387904/1`. Check `isValid()` before
using a result. Addition, subtraction, multiplication and division reduce exact
intermediates before checking the result. If the reduced numerator or positive
denominator does not fit `long`, arithmetic returns `0/0` rather than wrapping.
Negating or taking the absolute value of `LONG_MIN/1` also returns `0/0`.

**Operations:**

- `r.add(other: Rational) ret Rational`
- `r.sub(other: Rational) ret Rational`
- `r.mul(other: Rational) ret Rational`
- `r.div(other: Rational) ret Rational`
- `r.negate() ret Rational`
- `r.reciprocal() ret Rational`
- `r.abs() ret Rational`
- `r.pow(n: int) ret Rational`

**Conversion:**

- `r.toFloat() ret float`
- `r.toInt() ret int`
- `r.toLong() ret long`
- `r.floor() ret long`
- `r.ceil() ret long`
- `r.round() ret long`

**Properties:**

- `r.numerator() ret long`
- `r.denominator() ret long`
- `r.isValid() ret bool`
- `r.isZero() ret bool`
- `r.isPositive() ret bool`
- `r.isNegative() ret bool`
- `r.isInteger() ret bool`
- `r.sign() ret int`

---

## Encoding/Decoding

### Binary (`std/binary.bpl`)

`ByteReader` and `ByteWriter` provide checked, non-owning byte-buffer cursors,
unsigned integer access in either byte order, and failure without partial writes
or cursor movement. See the [binary data reference](61-stdlib-binary.md).

### Url (`std/url.bpl`)

URL percent-encoding (RFC 3986) and HTML form encoding. `encodeComponent`
keeps only the unreserved characters `A`-`Z`, `a`-`z`, `0`-`9`, `-`, `_`, `.`
and `~` and writes every other byte as uppercase `%XX`, as for a path segment
or query value; `encodeForm` also turns a space into `+`, as in
`application/x-www-form-urlencoded` data. `decode` turns `%XX` escapes (either
case) back into bytes and `decodeForm` also turns `+` into a space. The
decoders return `nullptr` for a `%` without two hex digits after it and for
`%00`, which would cut the string short. Results are caller-owned
(`free(cast<*void>(result))`), or `nullptr` if allocation fails.

- `Url.encodeComponent(text: string) ret string`
- `Url.encodeForm(text: string) ret string`
- `Url.decode(text: string) ret string`
- `Url.decodeForm(text: string) ret string`

### Parse (`std/parse.bpl`)

Checked parsing of numbers and booleans, for arguments, environment variables
and configuration where `atoi` would silently return 0. Each function parses
the whole text, with no surrounding whitespace, and on success stores the
value and returns `true`; empty or null text, a stray character or an
out-of-range value returns `false` and leaves the destination unchanged.

- `Parse.int(text: string, output: *int) ret bool` — decimal, optional sign
- `Parse.long(text: string, output: *long) ret bool` — decimal, optional sign
- `Parse.radix(text: string, base: int, output: *long) ret bool` — base 2 to
  36, letters in either case; base 16, 8 and 2 also accept a `0x`, `0o` or
  `0b` prefix after the sign
- `Parse.float(text: string, output: *float) ret bool` — anything `strtod`
  reads, including exponents, hexadecimal floats, `inf` and `nan`
- `Parse.bool(text: string, output: *bool) ret bool` — `true` or `false`

### Base64 (`std/base64.bpl`)

Base64 encoding and decoding.

Encoding helpers return caller-owned allocations, including empty results and
null-input results. Release them with `free(cast<*void>(result))`.

A string is accepted exactly when it decodes: whitespace anywhere, the
remaining characters in groups of four, and `=` only in the last one or two
places of the final group with nothing but whitespace after it. A partial
group, misplaced padding, or a character outside the alphabet is refused
rather than skipped. Both the standard and URL-safe alphabets decode.

`isValid`, `decodedLength` and `decode` all run the same scan, so they always
agree. `decode` and `decodedLength` return `-1` for input that is not valid
Base64, `decode` also for a null output pointer, and `decodeToString` returns
`nullptr` in those cases; `decodedLength` is exact, not an upper bound.

Encoded input longer than 2,147,483,647 bytes is rejected before scanning:
`decodedLength` and `decode` return `-1`, `isValid` returns `false`, and
`decodeToString` returns `nullptr`.

- `Base64.encode(data: *u8, length: int) ret string`
- `Base64.encodeString(str: string) ret string`
- `Base64.decode(input: string, output: *u8) ret int` — bytes written, or `-1`
- `Base64.decodeToString(input: string) ret string` — owned, or `nullptr`
- `Base64.encodedLength(inputLength: int) ret int` — zero for nonpositive lengths; throws `"Base64 encoded length exceeds int"` above 1,610,612,733 input bytes
- `Base64.decodedLength(input: string) ret int` — exact, or `-1`
- `Base64.isValid(input: string) ret bool`

Base64 encoding uses the same checked length calculation before allocating its
output. `encodeString` checks the byte length before converting it to `int`.
An allocation failure returns `nullptr`.

URL-safe Base64 (RFC 4648 section 5) uses `-` and `_` and leaves out the `=`
padding, as in JWTs and URLs. `encodeUrl` and `encodeStringUrl` produce it;
`decodeUrl` and `decodeUrlToString` accept it with or without padding and
return `-1` or `nullptr` for input of a length of 1 mod 4 or with characters
outside the alphabets.

- `Base64.encodeUrl(data: *u8, length: int) ret string`
- `Base64.encodeStringUrl(str: string) ret string`
- `Base64.decodeUrl(input: string, output: *u8) ret int`
- `Base64.decodeUrlToString(input: string) ret string`

### Base32 (`std/base32.bpl`)

Base32 (RFC 4648 section 6), as used for TOTP secrets and case-insensitive
identifiers. Encoding uses `A`-`Z` and `2`-`7` and pads with `=` to a multiple
of eight characters; the result is caller-owned (`free(cast<*void>(result))`)
or `nullptr` if allocation fails. Decoding accepts upper or lower case, with
or without the padding, and refuses any other character, padding before the
end, or a length that cannot come from whole bytes (a final group of 1, 3 or
6 characters). `decode`, `decodedLength` and `isValid` run the same scan, so
they agree; invalid input gives `-1`, `false` or `nullptr`.

- `Base32.encode(data: *u8, length: long) ret string`
- `Base32.encodeString(text: string) ret string`
- `Base32.decode(input: string, output: *u8) ret long` — bytes written, or `-1`
- `Base32.decodeToString(input: string) ret string` — owned, or `nullptr`
- `Base32.decodedLength(input: string) ret long` — exact, or `-1`
- `Base32.isValid(input: string) ret bool`

### Hex (`std/hex.bpl`)

Hexadecimal encoding and decoding.

Encoding helpers return caller-owned allocations, including empty results and
null-input results. Release them with `free(cast<*void>(result))`.

Hex encoding returns `nullptr` on allocation failure. `encode` and `encodeUpper`
throw `"Hex encoded length exceeds int"` for non-null input longer than
1,073,741,823 bytes. `encodeString` checks this limit before narrowing the string
length to `int`. Null input or a nonpositive byte count still produces an empty
result when allocation succeeds.

A string is accepted exactly when it decodes: an optional `0x` or `0X` prefix,
then pairs of hex digits. Whitespace separates pairs but may not split one, so
`"41 42"` is two bytes and `"4 142"` is refused, matching Python's
`bytes.fromhex`. An unpaired digit or a character outside the alphabet is
refused rather than ending the decode early.

`isValid`, `decodedLength` and `decode` all run the same scan, so they always
agree. `decode` and `decodedLength` return `-1` for input that is not valid
hex, `decode` also for a null output pointer, and `decodeToString` returns
`nullptr` in those cases; `decodedLength` discounts whitespace and the prefix.

Encoded input longer than 2,147,483,647 bytes is rejected before scanning:
`decodedLength` and `decode` return `-1`, `isValid` returns `false`, and
`decodeToString` returns `nullptr`.

- `Hex.encode(data: *u8, length: int) ret string`
- `Hex.encodeUpper(data: *u8, length: int) ret string`
- `Hex.encodeString(str: string) ret string`
- `Hex.decode(input: string, output: *u8) ret int` — bytes written, or `-1`
- `Hex.decodeToString(input: string) ret string` — owned, or `nullptr`
- `Hex.decodedLength(input: string) ret int` — exact, or `-1`
- `Hex.isValid(input: string) ret bool`

### Hash (`std/hash.bpl`)

Stable non-cryptographic hashing helpers and checksums. `crc32` is the
IEEE 802.3 CRC used by zlib, gzip, ZIP and PNG (`crc32String("123456789")` is
`0xcbf43926`); `crc32Update(crc, data, length)` continues a CRC over more
data, starting from 0. `adler32` is the zlib stream checksum (RFC 1950). Null
data counts as empty.

- `Hash.fnv1a32(input: string) ret uint`
- `Hash.fnv1a64(input: string) ret ulong`
- `Hash.checksum32(input: string) ret uint`
- `Hash.combine32(left: uint, right: uint) ret uint`
- `Hash.crc32(data: *u8, length: long) ret uint`
- `Hash.crc32Update(crc: uint, data: *u8, length: long) ret uint`
- `Hash.crc32String(input: string) ret uint`
- `Hash.adler32(data: *u8, length: long) ret uint`

### Assert (`std/assert.bpl`)

Checks for tests run with `bpl test` and for runtime invariants. A failed
check prints a message (with the expected and actual values for the
comparison helpers) and throws `1`, which fails the test or, outside a `try`
block, ends the program.

- `Assert.that(condition: bool, message: string)`, `Assert.isTrue`,
  `Assert.isFalse`
- `Assert.fail(message: string)` — for code that should not be reached
- `Assert.equalInt(actual: int, expected: int, message: string)`,
  `Assert.equalLong` — print `message: expected 5, got 4`
- `Assert.equalString(actual: string, expected: string, message: string)` —
  compares bytes; `nullptr` equals only `nullptr`
- `Assert.near(actual: double, expected: double, tolerance: double, message: string)`

### BigInt (`std/bigint.bpl`)

Signed integers of any size, stored as base-10^9 limbs. Every operation returns
a new `BigInt` the caller owns and must `destroy`; operands are never changed.
Copying a `BigInt` with `=` shares its limbs, so destroy only one copy, or use
`clone`. `toString` returns a caller-owned string (release it with
`free(cast<*void>(text))`).

- `BigInt.fromLong(number: long) ret BigInt`
- `BigInt.parse(text: string) ret BigInt` — optional `+`/`-`, decimal digits;
  throws otherwise
- `value.add(other: *BigInt) ret BigInt`, `subtract`, `multiply`, `negate()`
- `value.divide(divisor: *BigInt, remainder: *BigInt) ret BigInt` — truncates
  toward zero; when `remainder` is not null it receives the remainder (with the
  dividend's sign), which the caller destroys; throws for a zero divisor
- `value.divideSmall(divisor: int, remainder: *int) ret BigInt` — the same for
  an `int` divisor, without allocating a remainder
- `value.compare(other: *BigInt) ret int` (-1, 0, 1), `equals`, `isZero()`,
  `isNegative()`
- `value.abs()`, `value.pow(exponent: int)` (throws for a negative exponent;
  `0^0` is 1), `value.gcd(other: *BigInt)` (of the magnitudes; `gcd(0, 0)` is 0)
- `value.toLong(out: *long) ret bool` — false when the value does not fit
- `value.clone() ret BigInt`, `value.toString() ret string`, `value.destroy()`

```bpl
import printf, free from "std/c.bpl";
import [BigInt] from "std/bigint.bpl";

frame main() ret int {
    local base: BigInt = BigInt.parse("123456789012345678901234567890");
    local square: BigInt = base.multiply(&base);
    local text: string = square.toString();
    printf("%s\n", text);
    free(cast<*void>(text));
    square.destroy();
    base.destroy();
    return 0;
}
```

### Regex (`std/regex.bpl`)

Regular expressions over bytes. A pattern is compiled to a Thompson NFA and
matched by following every state at once, so matching never backtracks and
takes linear time in the text for each start position. Syntax: literal bytes;
`.` (any byte except newline); `[abc]`, `[a-z]`, negated `[^...]` (a `]` first
in a class is literal); `\d \w \s` and their negations `\D \W \S`; `\`
escaping any other character, plus `\n \t \r`; groups `( )`; alternation
`|`; greedy `*`, `+` and `?`; counted repetition `{m}`, `{m,}`, `{m,n}` and
`{,n}` (counts up to 1000; a `{` that does not start a count is a literal
brace); and the anchors `^` and `$` for the start and end of the text.
Captures and backreferences are not supported. `find` returns the leftmost match, extended as far as it goes.

- `Regex.compile(pattern: string) ret Regex` — throws a string describing a
  syntax error
- `regex.matches(text: string) ret bool` — the whole text matches
- `regex.find(text: string, begin: long, matchStart: *long, matchEnd: *long)
ret bool` — byte offsets of the match, end exclusive
- `regex.contains(text: string) ret bool`
- `regex.countMatches(text: string) ret long` — non-overlapping matches
- `regex.replaceAll(text: string, replacement: string) ret string`
- `regex.replaceFirst(text: string, replacement: string) ret string`
- `regex.split(text: string) ret Array<string>` — the pieces between matches
- `regex.destroy()`

`replaceAll` and `replaceFirst` copy `replacement` literally and return a
caller-owned string, or `nullptr` if allocation fails. Matches do not overlap.
After an empty match the search moves on one byte, and an empty match right
after a non-empty one still counts, as in Perl and Python: replacing `a*`
with `-` in `baaac` gives `-b--c-`. `split` uses the same matches and keeps empty pieces
before, between and after them, as Python's `re.split` does: splitting
`a,b,,c` on `,` gives `a`, `b`, an empty piece and `c`. The caller frees each
piece and destroys the array.

```bpl
import printf from "std/c.bpl";
import [Regex] from "std/regex.bpl";

frame main() ret int {
    local digits: Regex = Regex.compile("\\d+");
    local start: long = 0;
    local end: long = 0;
    if (digits.find("order 66 shipped", 0, &start, &end)) {
        printf("%ld %ld\n", start, end);
    }
    digits.destroy();
    return 0;
}
```

### Sha1 (`std/sha1.bpl`)

SHA-1 digests (FIPS 180-4), with the same interface as `Sha256` and 20-byte
digests; `hexBytes` and `hex` return a caller-owned 40-character string. SHA-1
is broken for collision resistance, so do not use it for signatures or new
designs; it is here for protocols that require it, such as the WebSocket
handshake (`Sec-WebSocket-Accept` is the Base64 of the SHA-1 of the client key
followed by `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`), TOTP's default HMAC and
git object ids.

- `Sha1.new() ret Sha1`
- `context.init()`
- `context.update(data: *u8, length: long)`
- `context.finish(digest: *u8)` — writes 20 bytes
- `Sha1.digest(data: *u8, length: long, digest: *u8)`
- `Sha1.hexBytes(data: *u8, length: long) ret string`
- `Sha1.hex(text: string) ret string`

### Sha256 (`std/sha256.bpl`)

SHA-256 digests (FIPS 180-4), implemented in BPL with no external library.
Create a streaming context with `Sha256.new()`, feed it with `update`, and call
`finish` to write the 32-byte digest; `init` resets a context for reuse. The
static helpers hash a whole buffer at once. `hexBytes` and `hex` return a
caller-owned 64-character lowercase string (release it with
`free(cast<*void>(result))`), or `nullptr` if allocation fails. Null or empty
input hashes the empty message.

- `Sha256.new() ret Sha256`
- `context.init()`
- `context.update(data: *u8, length: long)`
- `context.finish(digest: *u8)` — writes 32 bytes
- `Sha256.digest(data: *u8, length: long, digest: *u8)`
- `Sha256.hexBytes(data: *u8, length: long) ret string`
- `Sha256.hex(text: string) ret string`

```bpl
import printf, free from "std/c.bpl";
import [Sha256] from "std/sha256.bpl";

frame main() ret int {
    local digest: string = Sha256.hex("abc");
    printf("%s\n", digest);
    free(cast<*void>(digest));
    return 0;
}
```

### Sha512 (`std/sha512.bpl`)

SHA-512 digests (FIPS 180-4), with the same interface as `Sha256`: a streaming
context from `Sha512.new()` with `init`, `update` and `finish`, and the
one-call helpers. Digests are 64 bytes, and `hexBytes` and `hex` return a
caller-owned 128-character lowercase string, or `nullptr` if allocation
fails. Messages are processed in 128-byte blocks with a 128-bit length.

- `Sha512.new() ret Sha512`
- `context.init()`
- `context.update(data: *u8, length: long)`
- `context.finish(digest: *u8)` — writes 64 bytes
- `Sha512.digest(data: *u8, length: long, digest: *u8)`
- `Sha512.hexBytes(data: *u8, length: long) ret string`
- `Sha512.hex(text: string) ret string`

### Sha384 (`std/sha384.bpl`)

SHA-384 digests (FIPS 180-4): SHA-512 with its own initial state, cut to 48
bytes. It is the usual hash for Subresource Integrity and HS384/ES384 tokens.
The interface matches `Sha512`; `hexBytes` and `hex` return a caller-owned
96-character string, or `nullptr` if allocation fails.

- `Sha384.new() ret Sha384`
- `context.init()`
- `context.update(data: *u8, length: long)`
- `context.finish(digest: *u8)` — writes 48 bytes
- `Sha384.digest(data: *u8, length: long, digest: *u8)`
- `Sha384.hexBytes(data: *u8, length: long) ret string`
- `Sha384.hex(text: string) ret string`

### Hmac (`std/hmac.bpl`)

HMAC-SHA256 message authentication codes (RFC 2104), built on `Sha256`. Keys
longer than the 64-byte block are hashed first. Create a keyed context with
`Hmac.sha256(key, keyLength)`, feed it with `update`, and call `finish` to
write the 32-byte MAC; a context cannot be reused after `finish`. `hex` returns
a caller-owned 64-character lowercase string, or `nullptr` if allocation
fails. Compare MACs with `Hmac.equal`, which looks at every byte so its timing
does not reveal where two MACs differ.

- `Hmac.sha256(key: *u8, keyLength: long) ret Hmac`
- `context.update(data: *u8, length: long)`
- `context.finish(mac: *u8)` — writes 32 bytes
- `Hmac.digest(key: *u8, keyLength: long, data: *u8, length: long, mac: *u8)`
- `Hmac.hex(key: string, message: string) ret string`
- `Hmac.equal(a: *u8, b: *u8, length: long) ret bool`

```bpl
import printf, free from "std/c.bpl";
import [Hmac] from "std/hmac.bpl";

frame main() ret int {
    local mac: string = Hmac.hex("Jefe", "what do ya want for nothing?");
    printf("%s\n", mac);
    free(cast<*void>(mac));
    return 0;
}
```

`HmacSha512` is the same construction over `Sha512`: keys longer than its
128-byte block are hashed first, MACs are 64 bytes, and `hex` returns a
128-character string. Compare its MACs with `Hmac.equal(a, b, 64)`.

- `HmacSha512.new(key: *u8, keyLength: long) ret HmacSha512`
- `context.update(data: *u8, length: long)`
- `context.finish(mac: *u8)` — writes 64 bytes
- `HmacSha512.digest(key: *u8, keyLength: long, data: *u8, length: long, mac: *u8)`
- `HmacSha512.hex(key: string, message: string) ret string`

### Entropy (`std/entropy.bpl`)

Cryptographically secure random bytes from the operating system
(`getentropy`), for keys, tokens and nonces. `std/rand.bpl` remains the fast,
seedable generator for simulations. `fill` returns false when the system
cannot supply entropy; `bytes`, `nextULong` and `below` throw instead of
falling back to weaker randomness. `below` draws without modulo bias.

- `Entropy.fill(buffer: *u8, length: long) ret bool`
- `Entropy.bytes(buffer: *u8, length: long)`
- `Entropy.nextULong() ret ulong`
- `Entropy.below(bound: ulong) ret ulong` — in `[0, bound)`; throws for 0
- `Entropy.hexToken(byteCount: int) ret string` — `byteCount` random bytes as
  lowercase hex, for session ids, CSRF tokens and nonces (16 bytes give 128
  bits); caller frees

---

## Data Structures

### BitSet (`std/bitset.bpl`)

Fixed-size bit array for efficient flag/set operations.

**Creation:**

- `BitSet.new(numBits: int) ret BitSet`

**Basic Operations:**

- `bs.set(index: int)` - Set bit to 1
- `bs.clear(index: int)` - Set bit to 0
- `bs.test(index: int) ret bool` - Test if bit is set
- `bs.flip(index: int)` - Toggle bit
- `bs.flipAll()` - Toggle all bits
- `bs.setAll()` - Set all bits to 1
- `bs.clearAll()` - Set all bits to 0

**Queries:**

- `bs.count() ret int` - Count set bits
- `bs.any() ret bool` - Any bit set?
- `bs.none() ret bool` - No bits set?
- `bs.all() ret bool` - All bits set?
- `bs.size() ret int` - Total number of bits

**Set Operations:**

- `bs.andWith(other: *BitSet)` - In-place intersection
- `bs.orWith(other: *BitSet)` - In-place union
- `bs.xorWith(other: *BitSet)` - In-place symmetric difference
- `bs.flipAll()` - In-place complement
- `bs.clone() ret BitSet` - Allocate independent storage
- `bs.firstSet() ret int`, `bs.lastSet() ret int` - Index, or -1
- `bs.equals(other: *BitSet) ret bool`

**Cleanup:**

- `bs.destroy()` - Free memory and reset to an empty set; repeated cleanup is safe

---

## UUID

### UUID (`std/uuid.bpl`)

UUID formatting, parsing, and v4 (random) and v7 (time-ordered) generation
using native OS entropy. `v4()` throws
a string error if entropy is unavailable; `tryV4(output)` returns false and leaves
the destination unchanged. There is no time-seeded fallback. Generation requires
native `getentropy` support (Linux glibc 2.25+ or macOS 10.12+); see the
[portability notes](https://www.gnu.org/software/gnulib/manual/html_node/getentropy.html)
and [entropy API contract](https://www.gnu.org/software/libc/manual/2.26/html_node/Unpredictable-Bytes.html).
Random UUIDs do not provide a mathematical uniqueness guarantee or replace a
purpose-built authentication-token protocol.
A v7 UUID (RFC 9562) starts with the Unix time in milliseconds, so v7 UUIDs
sort by creation time, which suits database keys. Within one process each v7
UUID sorts after the previous one: in the same millisecond, or if the clock
steps back, its 12-bit counter is incremented. `timestampMs()` returns that
time for a v7 UUID and `-1` for other versions.
`fromString` accepts exactly 32 hexadecimal digits or the standard 36-character
hyphenated form; hexadecimal letters may be upper- or lowercase. Invalid input
returns nil. `tryFromString(text, output)` distinguishes invalid input from a valid
nil UUID, returns false for a null destination, and leaves the destination
unchanged on failure. `toString()` returns allocated storage that the caller must free,
or `nullptr` if allocation fails.

**Creation:**

- `UUID.v4() ret UUID` - Generate random v4 UUID; throws on entropy failure
- `UUID.tryV4(output: *UUID) ret bool` - Checked generation; null output returns false
- `UUID.v7() ret UUID` - Generate time-ordered v7 UUID; throws on entropy failure
- `UUID.tryV7(output: *UUID) ret bool` - Checked v7 generation
- `UUID.fromBytes(data: *u8) ret UUID`
- `UUID.fromString(str: string) ret UUID`
- `UUID.tryFromString(str: string, output: *UUID) ret bool`
- `UUID.nil() ret UUID` - All-zero UUID

**Conversion:**

- `uuid.toString() ret string` - Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- `uuid.timestampMs() ret long` - Unix milliseconds of a v7 UUID, or `-1`

**Properties:**

- `uuid.isNil() ret bool`
- `uuid.version() ret int`
- `uuid.variant() ret int`
- `uuid.equals(other: *UUID) ret bool`

---

## Environment

### Env (`std/env.bpl`)

Environment variable utilities using POSIX `getenv`/`setenv`/`unsetenv`.
Null names are treated as missing by queries: getters return their supplied
default, and `has`/`hasValue` return `false`. Mutations return `false` for null names.
Getters return borrowed environment pointers or supplied/default literals;
do not free them. Mutating the environment can invalidate borrowed pointers.
These APIs are not a portable Windows environment abstraction.

**Get/Set:**

- `Env.get(name: string) ret string` - Get variable (nullptr if not found)
- `Env.getOr(name: string, defaultValue: string) ret string`
- `Env.set(name: string, value: string) ret bool`
- `Env.setIfAbsent(name: string, value: string) ret bool`
- `Env.unset(name: string) ret bool`

**Query:**

- `Env.has(name: string) ret bool`
- `Env.hasValue(name: string) ret bool` - Exists and non-empty

**Common Variables:**

- `Env.getPath() ret string`
- `Env.getHome() ret string`
- `Env.getUser() ret string`
- `Env.getShell() ret string`
- `Env.getTmpDir() ret string`
- `Env.getPwd() ret string` - Reads PWD; does not query the working directory

**Type Conversion:**

- `Env.getInt(name: string, defaultValue: int) ret int` — optional sign followed by decimal digits; missing, empty, malformed, or out-of-range values return the default
- `Env.getBool(name: string, defaultValue: bool) ret bool` — accepts exactly `1`/`0`, `true`/`false`, `yes`/`no`, or `on`/`off` (words ignore case); otherwise returns the default

---

## Date/Time

### Date (`std/date.bpl`)

Calendar helpers use UTC Unix seconds and the proleptic Gregorian calendar,
including year zero and negative years. Constructors store fields without
validation; use `isValid()`. `toTimestamp()` throws a string for invalid date/time
fields. `fromTimestamp()` handles negative timestamps and throws a string if the
resulting year does not fit `int` (-2147483648 through 2147483647). Conversion
runs in constant time. Formatting allocates strings that callers must free.
This is not a timezone/DST library and does not model leap seconds.

Formatting prints stored fields without validating them. Year width is a minimum
of four characters; larger and negative years expand to fit. `formatISO()` uses
a `T` separator but does not add a timezone suffix or normalize expanded years
to an interchange standard. All formatting buffers accommodate every stored
`int` value. `formatSep(0)` omits separators. Allocation failure throws a string.

`Date.tryParse(text, &date)` reads exactly `YYYY-MM-DD`.
`DateTime.tryParse(text, &dateTime)` reads `YYYY-MM-DD`, a `T`, `t` or space,
`HH:MM:SS`, optional fractional seconds (ignored), and an optional `Z` or
`+HH:MM`, `-HH:MM` or `+HHMM` offset; with an offset the result is converted
to UTC, and without one the fields are kept as written. Both return false and
leave the destination unchanged for other text or an impossible date or time
(`2026-02-30`, `24:00:00`).

`dayOfYear()`, `dayOfWeek()`, and `weekOfYear()` reject invalid dates with string
exceptions. Weekdays use Sunday = 0 through Saturday = 6. ISO week numbers range
from 1 to 53; an early-January or late-December date can belong to the adjacent
ISO week-year, so `date.year` is not necessarily the year of that ISO week.

Date arithmetic validates its inputs and throws a string if the resulting year
is outside the supported range. `addMonths()` and `addYears()` clamp the day to
the last day of the target month (for example, January 31 plus one month becomes
February 28 or 29). Negative offsets are supported. `diffDays()` throws if the
signed result does not fit int; `diffDaysLong()` returns the exact difference
across the full supported year range. These operations return new values and do
not change their inputs.

**Creation:**

- `Date.new(year: int, month: int, day: int) ret Date`
- `Date.today() ret Date` - Current date (UTC)
- `Date.fromTimestamp(timestamp: long) ret Date`
- `Date.tryParse(text: string, output: *Date) ret bool` - Parse `YYYY-MM-DD`

**Conversion:**

- `date.toTimestamp() ret long`
- `date.format() ret string` - Owned YYYY-MM-DD text
- `date.formatSep(sep: u8) ret string` - Owned text with a separator

**Properties:**

- `date.year`, `date.month`, `date.day`
- `date.dayOfWeek() ret int` - 0=Sunday
- `date.dayOfYear() ret int`
- `date.weekOfYear() ret int`
- `date.isLeapYear() ret bool`
- `date.daysInMonth() ret int`

**Operations:**

- `date.addDays(days: int) ret Date`
- `date.subDays(days: int) ret Date`
- `date.addMonths(months: int) ret Date`
- `date.addYears(years: int) ret Date`
- `date.diffDays(other: *Date) ret int`
- `date.diffDaysLong(other: *Date) ret long`

### DateTime (`std/date.bpl`)

Date and time combined. Offset methods validate the stored date/time and reject
out-of-range results with string exceptions before arithmetic can overflow.
Seconds, minutes, hours, and days are fixed UTC durations; a day is 86400 seconds.
Calendar month/year additions preserve the clock fields and clamp the day using
the same rules as Date. Operations return new values without mutating the input.

**Creation:**

- `DateTime.new(year, month, day, hour, minute, second: int) ret DateTime`
- `DateTime.now() ret DateTime` - Current date/time (UTC)
- `DateTime.fromTimestamp(timestamp: long) ret DateTime`
- `DateTime.tryParse(text: string, output: *DateTime) ret bool` - Parse ISO 8601
  date and time; offsets convert to UTC

**Properties:**

- All Date fields plus `hour`, `minute`, `second`

**Conversion:**

- `dt.toTimestamp() ret long`
- `dt.toDate() ret Date`
- `dt.format() ret string` - Owned YYYY-MM-DD HH:MM:SS text
- `dt.formatISO() ret string`, `dt.formatTime() ret string` - Owned formatted text

**Operations:**

- `dt.addSeconds(seconds: long) ret DateTime`
- `dt.addMinutes(minutes: long) ret DateTime`
- `dt.addHours(hours: long) ret DateTime`
- `dt.addDays(days: long) ret DateTime`
- `dt.addMonths(months: int) ret DateTime`
- `dt.addYears(years: int) ret DateTime`
- `dt.diffSeconds(other: *DateTime) ret long` - Exact signed difference; validates both inputs

---

## Random Numbers

### Rand (`std/rand.bpl`)

Deterministic PCG32 generator with 64-bit state and a fixed stream (54).

**Creation:**

- `Rand.seed(seed: ulong) ret Rand`
- `Rand.seedFromTime() ret Rand`

**Generation:**

- `rng.nextInt() ret int`
- `rng.nextUInt() ret uint`
- `rng.nextLong() ret long`
- `rng.nextFloat() ret float` - Unsigned 32-bit fraction in [0, 1)
- `rng.nextBool() ret bool`
- `rng.range(min: int, max: int) ret int` - Rejection-sampled [min, max) integer range
- `rng.range(min: float, max: float) ret float`
- `rng.nextGaussian() ret float` - Box–Muller normal sample

**Array Operations:**

- `rng.shuffleInt(arr: *Array<int>)`
- `rng.choiceInt(arr: *Array<int>) ret int`
- `rng.fillBytes(buf: *u8, len: int)`
- `rng.weightedChoice(weights: *Array<int>) ret int`

## Random-number limitations

`Rand` uses PCG32 (XSH-RR), with 64-bit state and 32-bit output. It is not a
cryptographic generator. `Rand.seed` initializes the fixed stream rather than
assigning the seed directly to `state`. Equal seeds reproduce the same sequence;
sequences differ from the previous LCG implementation. `seedFromTime`
uses whole seconds, so equal seeds repeat sequences. `nextFloat` maps unsigned
32-bit output to [0, 1). Integer `range` uses rejection sampling to remove modulo
bias and supports intervals spanning signed boundaries; empty or reversed ranges
return `min` without advancing the generator.

For finite floating bounds, `range` uses a convex combination to avoid overflow
in `max - min`. Rounding can produce an endpoint. `nextGaussian` uses Box–Muller
with native logarithm, square root, and cosine, resampling zero before the
logarithm. `nextBool` and `fillBytes` use the permuted PCG32 output rather than
raw LCG state bits, removing the old strictly alternating booleans and 256-byte
repeat pattern. Use OS entropy for security-sensitive randomness. The generator
is checked against the [PCG32 reference vector](https://www.pcg-random.org/using-pcg-c-basic.html).
`weightedChoice` requires nonnegative weights with a positive total fitting
signed int. Negative weights, an empty or all-zero array, and a total above
2,147,483,647 throw a string error before advancing the generator. Valid weights
retain their deterministic selection sequence; zero-weight entries are not selected.

## Additional modules and implementation status

The declaration reference includes every module, including these previously
omitted areas:

| Modules                                                                                                         | Scope and limits                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `option.bpl`, `result.bpl`, `errors.bpl`                                                                        | Optional values, results, and error types; unwrap failures throw                                                   |
| `char_utils.bpl`, `string_utils.bpl`, `string_builder.bpl`, `fmt.bpl`                                           | Character/string helpers and formatting; inspect ownership per API                                                 |
| `utf8.bpl`                                                                                                      | Byte/codepoint helpers; `encode` borrows its input and `decode` copies into a String                               |
| `vec2.bpl`, `vec3.bpl`, `range.bpl`                                                                             | Vector and range utilities                                                                                         |
| `path.bpl`, `args.bpl`, `arg_parser.bpl`                                                                        | [Path helpers](62-stdlib-path.md) and command-line helpers                                                         |
| `memory/allocator.bpl`, `memory/arena_allocator.bpl`, `memory/pool_allocator.bpl`, `memory/stack_allocator.bpl` | [Manual allocator contracts](22-manual-memory.md#manual-allocator-contracts); explicit lifetimes and checked sizes |
| `memory/page_allocator.bpl`, `memory/syscalls.bpl`                                                              | PageAllocator uses native page alignment; raw syscalls declarations remain low-level                               |
| `iter_specs.bpl`, `core_specs.bpl`                                                                              | Interfaces used by implemented collections                                                                         |
| `iter.bpl`                                                                                                      | No public API; use implemented collection iterators in `iter_specs.bpl`                                            |
| `thread.bpl`, `sync.bpl`                                                                                        | No public API; native threading/synchronization requires an FFI library                                            |
| `type.bpl`, `primitives.bpl`, `reflection.bpl`, `intrinsics.bpl`                                                | Compiler/runtime support; platform and representation details matter                                               |
| `c.bpl`                                                                                                         | Native C declarations, not a portable or memory-safe wrapper                                                       |
| `process.bpl`                                                                                                   | Shell-free `run`/`runWith` and shell helpers; see the [process guide](59-process-execution.md)                     |
| `assert.bpl`, `debug.bpl`, `diagnostics.bpl`, `scope_stack.bpl`                                                 | Assertions, diagnostics, and compiler-oriented utilities                                                           |

`Log.debug/info/warn/error` currently share the same output path; they do not
provide independent level filtering or destinations. See the linked module
source for behavior that is not covered by a narrative guide.

### JSON object field replacement

When a JSON object repeats a recognized field, the last occurrence replaces the
earlier value. The parser releases earlier owned strings, arrays and nested
objects before reading the replacement. Missing subfields in a replacement
object or fixed array are zeroed; invalid replacement input fails the whole
parse and releases partial allocations. Unknown fields continue to be skipped.

### Simple output padding

`Fmt.printPaddedRight(text, width)` prints text followed by enough spaces to
reach a minimum total width in bytes. Longer text is preserved, negative widths
add no padding, and no newline is appended. For example, text `abc` at width 5
prints `abc  `. Width counts UTF-8 bytes rather than terminal display columns.

`UTF8.toCodepoints` returns decoded scalar values. Each malformed input byte
produces U+FFFD and advances by one byte, so following valid bytes are preserved.
A valid UTF-8 encoding of U+FFFD is consumed as one complete codepoint.
