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

`Log.debug`, `Log.info`, `Log.warn`, and `Log.error` are available through
`std` and currently write through the standard IO log path.

---

## Numeric Types

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
- `Stats.range(data: *int, length: int) ret int` - Max - Min
- `Stats.range(data: *float, length: int) ret float`
- `Stats.variance(data: *int, length: int) ret float` - Population variance
- `Stats.variance(data: *float, length: int) ret float`
- `Stats.sampleVariance(data: *int, length: int) ret float` - Sample variance
- `Stats.stddev(data: *int, length: int) ret float` - Population std deviation
- `Stats.stddev(data: *float, length: int) ret float`
- `Stats.sampleStddev(data: *int, length: int) ret float` - Sample std deviation
- `Stats.median(data: *int, length: int) ret float` - Median value
- `Stats.median(data: *float, length: int) ret float`

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

### Rational (`std/rational.bpl`)

Rational number (fraction) arithmetic.

**Creation:**

- `Rational.new(numerator: long, denominator: long) ret Rational`
- `Rational.fromInt(value: int) ret Rational`
- `Rational.fromLong(value: long) ret Rational`
- `Rational.zero() ret Rational`
- `Rational.one() ret Rational`

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

### Base64 (`std/base64.bpl`)

Base64 encoding and decoding.

String-returning helpers return caller-owned allocations, including empty
results and null-input results. Release them with `free(cast<*void>(result))`.

- `Base64.encode(data: *u8, length: int) ret string`
- `Base64.encodeString(str: string) ret string`
- `Base64.decode(input: string, output: *u8) ret int`
- `Base64.decodeToString(input: string) ret string`
- `Base64.encodedLength(inputLength: int) ret int`
- `Base64.decodedLength(input: string) ret int`
- `Base64.isValid(input: string) ret bool`

### Hex (`std/hex.bpl`)

Hexadecimal encoding and decoding.

String-returning helpers return caller-owned allocations, including empty
results and null-input results. Release them with `free(cast<*void>(result))`.

- `Hex.encode(data: *u8, length: int) ret string`
- `Hex.encodeUpper(data: *u8, length: int) ret string`
- `Hex.encodeString(str: string) ret string`
- `Hex.decode(input: string, output: *u8) ret int`
- `Hex.decodeToString(input: string) ret string`
- `Hex.isValid(input: string) ret bool`

### Hash (`std/hash.bpl`)

Stable non-cryptographic hashing helpers.

- `Hash.fnv1a32(input: string) ret uint`
- `Hash.checksum32(input: string) ret uint`
- `Hash.combine32(left: uint, right: uint) ret uint`

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

- `bs.destroy()` - Free memory

---

## UUID

### UUID (`std/uuid.bpl`)

UUID formatting, parsing, and v4-shaped generation. `v4()` reseeds a predictable
LCG from whole seconds on every call; calls in the same second repeat identifiers.
Do not use it where uniqueness, unpredictability, or security tokens are required.
`fromString` can return a partially parsed value, so validate text with `isValid`
before parsing. `toString()` returns allocated storage that the caller must free.

**Creation:**

- `UUID.v4() ret UUID` - Generate random v4 UUID
- `UUID.fromBytes(data: *u8) ret UUID`
- `UUID.fromString(str: string) ret UUID`
- `UUID.nil() ret UUID` - All-zero UUID

**Conversion:**

- `uuid.toString() ret string` - Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

**Properties:**

- `uuid.isNil() ret bool`
- `uuid.version() ret int`
- `uuid.variant() ret int`
- `uuid.equals(other: *UUID) ret bool`

---

## Environment

### Env (`std/env.bpl`)

Environment variable utilities using POSIX `getenv`/`setenv`/`unsetenv`.
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

- `Env.getInt(name: string, defaultValue: int) ret int`
- `Env.getBool(name: string, defaultValue: bool) ret bool`

---

## Date/Time

### Date (`std/date.bpl`)

Calendar helpers intended for UTC-like Unix timestamps. Constructors store fields
without validation; use `isValid()`. Negative timestamps and dates before 1970
are not handled correctly by the current conversion algorithms. Formatting
allocates strings that callers must free. This is not a timezone/DST library.

**Creation:**

- `Date.new(year: int, month: int, day: int) ret Date`
- `Date.today() ret Date` - Current date (UTC)
- `Date.fromTimestamp(timestamp: long) ret Date`

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
- `date.addMonths(months: int) ret Date`
- `date.addYears(years: int) ret Date`
- `date.diffDays(other: *Date) ret int`

### DateTime (`std/date.bpl`)

Date and time combined.

**Creation:**

- `DateTime.new(year, month, day, hour, minute, second: int) ret DateTime`
- `DateTime.now() ret DateTime` - Current date/time (UTC)
- `DateTime.fromTimestamp(timestamp: long) ret DateTime`

**Properties:**

- All Date fields plus `hour`, `minute`, `second`

**Conversion:**

- `dt.toTimestamp() ret long`
- `dt.toDate() ret Date`
- `dt.format() ret string` - Owned YYYY-MM-DD HH:MM:SS text
- `dt.formatISO() ret string`, `dt.formatTime() ret string` - Owned formatted text

---

## Random Numbers

### Rand (`std/rand.bpl`)

Pseudo-random number generator (LCG).

**Creation:**

- `Rand.seed(seed: ulong) ret Rand`
- `Rand.seedFromTime() ret Rand`

**Generation:**

- `rng.nextInt() ret int`
- `rng.nextUInt() ret uint`
- `rng.nextLong() ret long`
- `rng.nextFloat() ret float` - Legacy biased fraction; see limitations below
- `rng.nextBool() ret bool`
- `rng.range(min: int, max: int) ret int` - Legacy modulo-based range
- `rng.range(min: float, max: float) ret float`
- `rng.nextGaussian() ret float` - Legacy approximation; not a normal distribution

**Array Operations:**

- `rng.shuffleInt(arr: *Array<int>)`
- `rng.choiceInt(arr: *Array<int>) ret int`
- `rng.fillBytes(buf: *u8, len: int)`
- `rng.weightedChoice(weights: *Array<int>) ret int`

## Random-number limitations

`Rand` is deterministic and not cryptographically secure. Its current
`nextFloat` takes the absolute value of a signed 32-bit result and divides by
2^32, so it normally covers only the lower half of the advertised unit interval;
the minimum signed integer can produce a negative value. `range` inherits bias
and signed-overflow edge cases. `nextGaussian` uses a polynomial approximation
that is not a valid normal-distribution sampler. Do not use these methods for
security, unbiased sampling, or statistical simulation without replacing them.

## Additional modules and implementation status

The declaration reference includes every module, including these previously
omitted areas:

| Modules                                                                                                         | Scope and limits                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `option.bpl`, `result.bpl`, `errors.bpl`                                                                        | Optional values, results, and error types; unwrap failures throw                     |
| `char_utils.bpl`, `string_utils.bpl`, `string_builder.bpl`, `fmt.bpl`                                           | Character/string helpers and formatting; inspect ownership per API                   |
| `utf8.bpl`                                                                                                      | Byte/codepoint helpers; `encode` borrows its input and `decode` copies into a String |
| `vec2.bpl`, `vec3.bpl`, `range.bpl`                                                                             | Vector and range utilities                                                           |
| `path.bpl`, `args.bpl`, `arg_parser.bpl`                                                                        | Path and command-line helpers                                                        |
| `memory/allocator.bpl`, `memory/arena_allocator.bpl`, `memory/pool_allocator.bpl`, `memory/stack_allocator.bpl` | Manual allocator interfaces and implementations; allocations have explicit lifetimes |
| `memory/page_allocator.bpl`, `memory/syscalls.bpl`                                                              | mmap-backed allocation with Linux-specific constants                                 |
| `iter_specs.bpl`, `core_specs.bpl`                                                                              | Interfaces used by implemented collections                                           |
| `iter.bpl`                                                                                                      | `Iter.map`, `filter`, and `reduce` are stubs that throw 999                          |
| `thread.bpl`, `sync.bpl`                                                                                        | Threading and synchronization are stubs that throw 999                               |
| `type.bpl`, `primitives.bpl`, `reflection.bpl`, `intrinsics.bpl`                                                | Compiler/runtime support; platform and representation details matter                 |
| `c.bpl`                                                                                                         | Native C declarations, not a portable or memory-safe wrapper                         |
| `process.bpl`                                                                                                   | Shell-backed execution; see the [process guide](59-process-execution.md)             |
| `assert.bpl`, `debug.bpl`, `diagnostics.bpl`, `scope_stack.bpl`                                                 | Assertions, diagnostics, and compiler-oriented utilities                             |

`Log.debug/info/warn/error` currently share the same output path; they do not
provide independent level filtering or destinations. See the linked module
source for behavior that is not covered by a narrative guide.
