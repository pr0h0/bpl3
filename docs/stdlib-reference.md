# Standard Library Declaration Reference

Generated from parsed library declarations with `bun run docs:stdlib`. Do not edit by hand.

This index covers all 64 BPL modules under `lib/`, including memory and low-level modules.
It lists explicit exports and declarations defined in each source file. Re-exported symbols
are listed under exports; their definitions are in the originating modules. Inherited members
are not repeated. An exported type's declared members include implementation helpers and fields;
their presence does not make direct mutation or internal helper calls a supported usage pattern.

These are declaration excerpts, not standalone programs. Receiver parameters (`this`) are shown
explicitly; callers normally use method syntax. Platform support, ownership, bounds, and failure
behavior are described in the [standard-library guide](48-stdlib-api.md) and linked chapters.
A declaration here proves that the API is present in source, not that every instantiation or
platform has been validated. C/POSIX extern declarations retain their native ABI requirements.

## Module index

- [std/algorithm.bpl](../lib/algorithm.bpl)
- [std/arg_parser.bpl](../lib/arg_parser.bpl)
- [std/args.bpl](../lib/args.bpl)
- [std/array.bpl](../lib/array.bpl)
- [std/assert.bpl](../lib/assert.bpl)
- [std/base64.bpl](../lib/base64.bpl)
- [std/binary.bpl](../lib/binary.bpl)
- [std/bitset.bpl](../lib/bitset.bpl)
- [std/c.bpl](../lib/c.bpl)
- [std/char_utils.bpl](../lib/char_utils.bpl)
- [std/complex.bpl](../lib/complex.bpl)
- [std/core_specs.bpl](../lib/core_specs.bpl)
- [std/date.bpl](../lib/date.bpl)
- [std/debug.bpl](../lib/debug.bpl)
- [std/deque.bpl](../lib/deque.bpl)
- [std/diagnostics.bpl](../lib/diagnostics.bpl)
- [std/env.bpl](../lib/env.bpl)
- [std/errors.bpl](../lib/errors.bpl)
- [std/fmt.bpl](../lib/fmt.bpl)
- [std/fs.bpl](../lib/fs.bpl)
- [std/hash.bpl](../lib/hash.bpl)
- [std/hex.bpl](../lib/hex.bpl)
- [std/intrinsics.bpl](../lib/intrinsics.bpl)
- [std/io.bpl](../lib/io.bpl)
- [std/iter.bpl](../lib/iter.bpl)
- [std/iter_specs.bpl](../lib/iter_specs.bpl)
- [std/json.bpl](../lib/json.bpl)
- [std/linked_list.bpl](../lib/linked_list.bpl)
- [std/log.bpl](../lib/log.bpl)
- [std/map.bpl](../lib/map.bpl)
- [std/math.bpl](../lib/math.bpl)
- [std/memory/allocator.bpl](../lib/memory/allocator.bpl)
- [std/memory/arena_allocator.bpl](../lib/memory/arena_allocator.bpl)
- [std/memory/page_allocator.bpl](../lib/memory/page_allocator.bpl)
- [std/memory/pool_allocator.bpl](../lib/memory/pool_allocator.bpl)
- [std/memory/stack_allocator.bpl](../lib/memory/stack_allocator.bpl)
- [std/memory/syscalls.bpl](../lib/memory/syscalls.bpl)
- [std/option.bpl](../lib/option.bpl)
- [std/path.bpl](../lib/path.bpl)
- [std/primitives.bpl](../lib/primitives.bpl)
- [std/priority_queue.bpl](../lib/priority_queue.bpl)
- [std/process.bpl](../lib/process.bpl)
- [std/queue.bpl](../lib/queue.bpl)
- [std/rand.bpl](../lib/rand.bpl)
- [std/range.bpl](../lib/range.bpl)
- [std/rational.bpl](../lib/rational.bpl)
- [std/reflection.bpl](../lib/reflection.bpl)
- [std/result.bpl](../lib/result.bpl)
- [std/scope_stack.bpl](../lib/scope_stack.bpl)
- [std/set.bpl](../lib/set.bpl)
- [std/stack.bpl](../lib/stack.bpl)
- [std/stats.bpl](../lib/stats.bpl)
- [std/std.bpl](../lib/std.bpl)
- [std/string.bpl](../lib/string.bpl)
- [std/string_builder.bpl](../lib/string_builder.bpl)
- [std/string_utils.bpl](../lib/string_utils.bpl)
- [std/sync.bpl](../lib/sync.bpl)
- [std/thread.bpl](../lib/thread.bpl)
- [std/time.bpl](../lib/time.bpl)
- [std/type.bpl](../lib/type.bpl)
- [std/utf8.bpl](../lib/utf8.bpl)
- [std/uuid.bpl](../lib/uuid.bpl)
- [std/vec2.bpl](../lib/vec2.bpl)
- [std/vec3.bpl](../lib/vec3.bpl)

## std/algorithm.bpl

[Source](../lib/algorithm.bpl)

Exports:

```bpl
export [Algorithm];
```

### Algorithm

```bpl
struct Algorithm
frame reverse(arr: *Array<int>)
frame sortAsc(arr: *Array<int>)
frame sortDesc(arr: *Array<int>)
frame quickSort(arr: *Array<int>)
frame _quickSortIntHelper(arr: *Array<int>, low: int, high: int)
frame _partitionInt(arr: *Array<int>, low: int, high: int) ret int
frame binarySearch(arr: *Array<int>, target: int) ret int
frame min(arr: *Array<int>) ret int
frame max(arr: *Array<int>) ret int
frame sum(arr: *Array<int>) ret long
frame average(arr: *Array<int>) ret float
frame fill(arr: *Array<int>, value: int)
frame count(arr: *Array<int>, value: int) ret int
frame shuffle(arr: *Array<int>, rng: *Rand)
frame isSorted(arr: *Array<int>) ret bool
frame unique(arr: *Array<int>) ret Array<int>
frame min(arr: *Array<float>) ret float
frame max(arr: *Array<float>) ret float
frame sum(arr: *Array<float>) ret float
frame average(arr: *Array<float>) ret float
frame sortAsc(arr: *Array<float>)
frame range(start: int, end: int) ret Array<int>
frame rangeStep(start: int, end: int, step: int) ret Array<int>
frame copy(src: *Array<int>, dest: *Array<int>)
frame merge(a: *Array<int>, b: *Array<int>) ret Array<int>
frame equals(a: *Array<int>, b: *Array<int>) ret bool
```

## std/arg_parser.bpl

[Source](../lib/arg_parser.bpl)

Exports:

```bpl
export [Command];
export [Flag];
export [Argument];
export [ArgParser];
export [ParsedArgs];
```

### Flag

```bpl
struct Flag
name: String
alias: String
description: String
hasValue: bool
defaultValue: String
frame new(name: string, alias: string, desc: string, hasVal: bool) ret *Flag
frame withDefault(this: *Flag, val: string) ret *Flag
frame destroy(this: *Flag)
```

### Argument

```bpl
struct Argument
name: String
description: String
required: bool
frame new(name: string, desc: string, required: bool) ret *Argument
frame destroy(this: *Argument)
```

### Command

```bpl
struct Command
name: String
description: String
flags: Array<*Flag>
arguments: Array<*Argument>
subcommands: Array<*Command>
action: Func<int>(*ParsedArgs)
frame new(name: string, desc: string) ret *Command
frame addFlag(this: *Command, flag: *Flag) ret *Command
frame addArgument(this: *Command, arg: *Argument) ret *Command
frame addSubcommand(this: *Command, cmd: *Command) ret *Command
frame setAction(this: *Command, fn: Func<int>(*ParsedArgs)) ret *Command
frame printHelp(this: *Command)
frame destroy(this: *Command)
```

### ParsedArgs

```bpl
struct ParsedArgs: Destructible
commandPath: Array<*String>
flags: Array<*FlagEntry>
positional: Array<*String>
frame new() ret *ParsedArgs
frame setFlag(this: *ParsedArgs, key: String, value: String)
frame getFlag(this: *ParsedArgs, name: string) ret Option<*String>
frame hasFlag(this: *ParsedArgs, name: string) ret bool
frame getArg(this: *ParsedArgs, index: int) ret Option<*String>
frame destroy(this: *ParsedArgs)
```

### ArgParser

```bpl
struct ArgParser
root: *Command
frame new(rootCmd: *Command) ret ArgParser
frame matchFlag(this: *ArgParser, currentCmd: *Command, argStr: string) ret Option<*Flag>
frame parse(this: *ArgParser, args: *Args) ret *ParsedArgs
```

## std/args.bpl

[Source](../lib/args.bpl)

Exports:

```bpl
export [Args];
```

### Args

```bpl
struct Args
argc: int
argv: *string
frame new(argc: int, argv: *string) ret Args
frame count(this: *Args) ret int
frame get(this: *Args, index: int) ret String
```

## std/array.bpl

[Source](../lib/array.bpl)

Exports:

```bpl
export [Array];
export [ArrayIterator];
```

### ArrayIterator

```bpl
struct ArrayIterator<T>: Iterator<T>
array: *Array<T>
index: int
frame next(this: *ArrayIterator<T>) ret Option<T>
```

### Array

```bpl
struct Array<T>: Iterable<T>, Cloneable<Array<T>>, Destructible
data: *T
capacity: int
length: int
frame new(initial_capacity: int) ret Array<T>
frame destroy(this: *Array<T>)
frame iterator(this: *Array<T>) ret ArrayIterator<T>
frame clone(this: *Array<T>) ret Array<T>
frame len(this: *Array<T>) ret int
frame get(this: *Array<T>, index: int) ret T
frame getRef(this: *Array<T>, index: int) ret *T
frame set(this: *Array<T>, index: int, value: T)
frame push(this: *Array<T>, value: T)
frame pop(this: *Array<T>) ret T
frame removeAt(this: *Array<T>, index: int)
frame map<U>(this: *Array<T>, transform: Lambda<U>(T, int)) ret Array<U>
frame filter(this: *Array<T>, predicate: Lambda<bool>(T, int)) ret Array<T>
frame reduce<U>(this: *Array<T>, initial: U, reducer: Lambda<U>(U, T, int)) ret U
frame forEach(this: *Array<T>, action: Lambda<void>(T, int))
frame find(this: *Array<T>, predicate: Lambda<bool>(T)) ret Option<T>
frame every(this: *Array<T>, predicate: Lambda<bool>(T)) ret bool
frame some(this: *Array<T>, predicate: Lambda<bool>(T)) ret bool
frame indexOf(this: *Array<T>, value: T) ret int
frame contains(this: *Array<T>, value: T) ret bool
frame findIndex(this: *Array<T>, predicate: Lambda<bool>(T)) ret Option<int>
frame __lshift__(this: *Array<T>, value: T) ret Array<T>
frame __rshift__(this: *Array<T>, dest: *T) ret Array<T>
```

## std/assert.bpl

[Source](../lib/assert.bpl)

Exports:

```bpl
export [Assert];
```

### Assert

```bpl
struct Assert
frame that(condition: bool, message: string)
```

## std/base64.bpl

[Source](../lib/base64.bpl)

Exports:

```bpl
export [Base64];
```

### Base64

```bpl
struct Base64
frame encode(data: *u8, length: int) ret string
frame encodeString(str: string) ret string
frame decodeChar(c: u8) ret int
frame decode(input: string, output: *u8) ret int
frame decodeToString(input: string) ret string
frame decodedLength(input: string) ret int
frame encodedLength(inputLen: int) ret int
frame isValid(input: string) ret bool
```

## std/binary.bpl

[Source](../lib/binary.bpl)

Exports:

```bpl
export [ByteReader];
export [ByteWriter];
```

### ByteReader

```bpl
struct ByteReader
data: *u8
length: int
offset: int
frame new(data: *u8, length: int) ret ByteReader
frame position(this: *ByteReader) ret int
frame remaining(this: *ByteReader) ret int
frame seek(this: *ByteReader, position: int) ret bool
frame skip(this: *ByteReader, count: int) ret bool
frame readUnsigned(this: *ByteReader, width: int, littleEndian: bool) ret Option<u64>
frame readU8(this: *ByteReader) ret Option<u8>
frame readU16LE(this: *ByteReader) ret Option<u16>
frame readU16BE(this: *ByteReader) ret Option<u16>
frame readU32LE(this: *ByteReader) ret Option<u32>
frame readU32BE(this: *ByteReader) ret Option<u32>
frame readU64LE(this: *ByteReader) ret Option<u64>
frame readU64BE(this: *ByteReader) ret Option<u64>
```

### ByteWriter

```bpl
struct ByteWriter
data: *u8
length: int
offset: int
frame new(data: *u8, length: int) ret ByteWriter
frame position(this: *ByteWriter) ret int
frame remaining(this: *ByteWriter) ret int
frame seek(this: *ByteWriter, position: int) ret bool
frame skip(this: *ByteWriter, count: int) ret bool
frame writeUnsigned(this: *ByteWriter, value: u64, width: int, littleEndian: bool) ret bool
frame writeU8(this: *ByteWriter, value: u8) ret bool
frame writeU16LE(this: *ByteWriter, value: u16) ret bool
frame writeU16BE(this: *ByteWriter, value: u16) ret bool
frame writeU32LE(this: *ByteWriter, value: u32) ret bool
frame writeU32BE(this: *ByteWriter, value: u32) ret bool
frame writeU64LE(this: *ByteWriter, value: u64) ret bool
frame writeU64BE(this: *ByteWriter, value: u64) ret bool
```

## std/bitset.bpl

[Source](../lib/bitset.bpl)

Exports:

```bpl
export [BitSet];
```

### BitSet

```bpl
struct BitSet
data: *u64
numBits: int
numWords: int
frame new(numBits: int) ret BitSet
frame destroy(this: *BitSet)
frame set(this: *BitSet, index: int)
frame clear(this: *BitSet, index: int)
frame test(this: *BitSet, index: int) ret bool
frame flip(this: *BitSet, index: int)
frame flipAll(this: *BitSet)
frame setAll(this: *BitSet)
frame clearAll(this: *BitSet)
frame clearExcessBits(this: *BitSet)
frame count(this: *BitSet) ret int
frame all(this: *BitSet) ret bool
frame any(this: *BitSet) ret bool
frame none(this: *BitSet) ret bool
frame size(this: *BitSet) ret int
frame firstSet(this: *BitSet) ret int
frame lastSet(this: *BitSet) ret int
frame andWith(this: *BitSet, other: *BitSet)
frame orWith(this: *BitSet, other: *BitSet)
frame xorWith(this: *BitSet, other: *BitSet)
frame equals(this: *BitSet, other: *BitSet) ret bool
frame clone(this: *BitSet) ret BitSet
```

## std/c.bpl

[Source](../lib/c.bpl)

Exports:

```bpl
export [printf];
export [fprintf];
export [dprintf];
export [sprintf];
export [snprintf];
export [puts];
export [putchar];
export [scanf];
export [gets];
export [write];
export [malloc];
export [free];
export [memcpy];
export [memmove];
export [memset];
export [strlen];
export [strcmp];
export [strncmp];
export [strcpy];
export [strcat];
export [atoi];
```

```bpl
extern printf(fmt: string, ...) ret int
```

```bpl
extern fprintf(stream: *void, fmt: string, ...) ret int
```

```bpl
extern dprintf(fd: int, fmt: string, ...) ret int
```

```bpl
extern sprintf(dest: string, fmt: string, ...) ret int
```

```bpl
extern snprintf(dest: string, size: long, fmt: string, ...) ret int
```

```bpl
extern puts(value: string) ret int
```

```bpl
extern putchar(value: int) ret int
```

```bpl
extern scanf(fmt: string, ...) ret int
```

```bpl
extern gets(buf: string) ret string
```

```bpl
extern write(fd: int, buf: *char, count: int) ret int
```

```bpl
extern malloc(size: long) ret *void
```

```bpl
extern free(ptr: *void) ret void
```

```bpl
extern memcpy(dest: *void, src: *void, n: long) ret *void
```

```bpl
extern memmove(dest: *void, src: *void, n: long) ret *void
```

```bpl
extern memset(dest: *void, value: int, n: long) ret *void
```

```bpl
extern strlen(s: string) ret int
```

```bpl
extern strcmp(left: string, right: string) ret int
```

```bpl
extern strncmp(left: string, right: string, count: long) ret int
```

```bpl
extern strcpy(dest: string, src: string) ret string
```

```bpl
extern strcat(dest: string, src: string) ret string
```

```bpl
extern atoi(s: string) ret int
```

## std/char_utils.bpl

[Source](../lib/char_utils.bpl)

Exports:

```bpl
export [CharUtils];
```

### CharUtils

```bpl
struct CharUtils
frame isDigit(c: char) ret bool
frame isHexDigit(c: char) ret bool
frame isAlpha(c: char) ret bool
frame isAlphaNumeric(c: char) ret bool
frame isWhitespace(c: char) ret bool
frame isIdentifierStart(c: char) ret bool
frame isIdentifierPart(c: char) ret bool
frame toLower(c: char) ret char
frame toUpper(c: char) ret char
```

## std/complex.bpl

[Source](../lib/complex.bpl)

Exports:

```bpl
export [Complex];
```

### Complex

```bpl
struct Complex
real: float
imag: float
frame new(real: float, imag: float) ret Complex
frame fromReal(real: float) ret Complex
frame fromImag(imag: float) ret Complex
frame fromPolar(magnitude: float, angle: float) ret Complex
frame zero() ret Complex
frame one() ret Complex
frame i() ret Complex
frame add(this: *Complex, other: Complex) ret Complex
frame sub(this: *Complex, other: Complex) ret Complex
frame mul(this: *Complex, other: Complex) ret Complex
frame div(this: *Complex, other: Complex) ret Complex
frame scale(this: *Complex, scalar: float) ret Complex
frame abs(this: *Complex) ret float
frame absSquared(this: *Complex) ret float
frame phase(this: *Complex) ret float
frame conjugate(this: *Complex) ret Complex
frame negate(this: *Complex) ret Complex
frame reciprocal(this: *Complex) ret Complex
frame exp(this: *Complex) ret Complex
frame log(this: *Complex) ret Complex
frame pow(this: *Complex, n: int) ret Complex
frame pow(this: *Complex, exponent: Complex) ret Complex
frame sqrt(this: *Complex) ret Complex
frame sin(this: *Complex) ret Complex
frame cos(this: *Complex) ret Complex
frame equals(this: *Complex, other: *Complex) ret bool
frame approxEquals(this: *Complex, other: *Complex, epsilon: float) ret bool
frame isReal(this: *Complex) ret bool
frame isImaginary(this: *Complex) ret bool
frame isZero(this: *Complex) ret bool
frame clone(this: *Complex) ret Complex
frame __add__(this: *Complex, other: *Complex) ret Complex
frame __sub__(this: *Complex, other: *Complex) ret Complex
frame __mul__(this: *Complex, other: *Complex) ret Complex
frame __div__(this: *Complex, other: *Complex) ret Complex
frame __eq__(this: *Complex, other: *Complex) ret bool
frame __ne__(this: *Complex, other: *Complex) ret bool
frame __neg__(this: *Complex) ret Complex
```

## std/core_specs.bpl

[Source](../lib/core_specs.bpl)

Exports:

```bpl
export [Comparable];
export [Equatable];
export [Destructible];
export [Cloneable];
export [Hashable];
```

### Equatable

```bpl
spec Equatable<T>
frame __eq__(this: *T, other: *T) ret bool
frame __ne__(this: *T, other: *T) ret bool
```

### Hashable

```bpl
spec Hashable<T>
frame hash(this: *T) ret u64
```

### Comparable

```bpl
spec Comparable<T>: Equatable<T>
frame __lt__(this: *T, other: *T) ret bool
frame __gt__(this: *T, other: *T) ret bool
frame __le__(this: *T, other: *T) ret bool
frame __ge__(this: *T, other: *T) ret bool
```

### Destructible

```bpl
spec Destructible
frame destroy(this: *Self)
```

### Cloneable

```bpl
spec Cloneable<T>
frame clone(this: *T) ret T
```

## std/date.bpl

[Source](../lib/date.bpl)

Exports:

```bpl
export [Date];
export [DateTime];
```

### Date

```bpl
struct Date
year: int
month: int
day: int
frame new(year: int, month: int, day: int) ret Date
frame today() ret Date
frame fromTimestamp(timestamp: long) ret Date
frame toTimestamp(this: *Date) ret long
frame isLeapYearInt(year: int) ret bool
frame daysInMonthStatic(year: int, month: int) ret int
frame isLeapYear(this: *Date) ret bool
frame daysInMonth(this: *Date) ret int
frame dayOfYear(this: *Date) ret int
frame dayOfWeek(this: *Date) ret int
frame weekOfYear(this: *Date) ret int
frame addDays(this: *Date, days: int) ret Date
frame subDays(this: *Date, days: int) ret Date
frame addMonths(this: *Date, months: int) ret Date
frame addYears(this: *Date, years: int) ret Date
frame diffDays(this: *Date, other: *Date) ret int
frame isValid(this: *Date) ret bool
frame format(this: *Date) ret string
frame formatSep(this: *Date, sep: u8) ret string
frame compare(this: *Date, other: *Date) ret int
frame equals(this: *Date, other: *Date) ret bool
frame __eq__(this: *Date, other: *Date) ret bool
frame __ne__(this: *Date, other: *Date) ret bool
frame __lt__(this: *Date, other: *Date) ret bool
frame __le__(this: *Date, other: *Date) ret bool
frame __gt__(this: *Date, other: *Date) ret bool
frame __ge__(this: *Date, other: *Date) ret bool
frame clone(this: *Date) ret Date
```

### DateTime

```bpl
struct DateTime
year: int
month: int
day: int
hour: int
minute: int
second: int
frame new(year: int, month: int, day: int, hour: int, minute: int, second: int) ret DateTime
frame fromDate(d: Date) ret DateTime
frame now() ret DateTime
frame fromTimestamp(timestamp: long) ret DateTime
frame toTimestamp(this: *DateTime) ret long
frame toDate(this: *DateTime) ret Date
frame isValid(this: *DateTime) ret bool
frame addSeconds(this: *DateTime, seconds: long) ret DateTime
frame addMinutes(this: *DateTime, minutes: long) ret DateTime
frame addHours(this: *DateTime, hours: long) ret DateTime
frame addDays(this: *DateTime, days: long) ret DateTime
frame diffSeconds(this: *DateTime, other: *DateTime) ret long
frame format(this: *DateTime) ret string
frame formatISO(this: *DateTime) ret string
frame formatTime(this: *DateTime) ret string
frame compare(this: *DateTime, other: *DateTime) ret int
frame equals(this: *DateTime, other: *DateTime) ret bool
frame __eq__(this: *DateTime, other: *DateTime) ret bool
frame __ne__(this: *DateTime, other: *DateTime) ret bool
frame __lt__(this: *DateTime, other: *DateTime) ret bool
frame __le__(this: *DateTime, other: *DateTime) ret bool
frame __gt__(this: *DateTime, other: *DateTime) ret bool
frame __ge__(this: *DateTime, other: *DateTime) ret bool
frame clone(this: *DateTime) ret DateTime
```

## std/debug.bpl

[Source](../lib/debug.bpl)

Exports:

```bpl
export [Debug];
```

### Debug

```bpl
struct Debug
frame captureStackTrace(buffer: **void, max_frames: int) ret int
frame printStackTrace()
```

## std/deque.bpl

[Source](../lib/deque.bpl)

Exports:

```bpl
export [Deque];
export [DequeIterator];
```

### DequeIterator

```bpl
struct DequeIterator<T>: Iterator<T>
deque: *Deque<T>
index: int
frame next(this: *DequeIterator<T>) ret Option<T>
```

### Deque

```bpl
struct Deque<T>: Iterable<T>, Destructible
inner: Array<T>
head: int
count: int
frame new() ret Deque<T>
frame new(initialCapacity: int) ret Deque<T>
frame size(this: *Deque<T>) ret int
frame capacity(this: *Deque<T>) ret int
frame isEmpty(this: *Deque<T>) ret bool
frame physicalIndex(this: *Deque<T>, offset: int) ret int
frame reserve(this: *Deque<T>, minimum: int)
frame ensureRoom(this: *Deque<T>)
frame pushBack(this: *Deque<T>, value: T)
frame pushFront(this: *Deque<T>, value: T)
frame popFront(this: *Deque<T>) ret Option<T>
frame popBack(this: *Deque<T>) ret Option<T>
frame get(this: *Deque<T>, index: int) ret Option<T>
frame set(this: *Deque<T>, index: int, value: T) ret bool
frame peekFront(this: *Deque<T>) ret Option<T>
frame peekBack(this: *Deque<T>) ret Option<T>
frame clear(this: *Deque<T>)
frame destroy(this: *Deque<T>)
frame clone(this: *Deque<T>) ret Deque<T>
frame iterator(this: *Deque<T>) ret DequeIterator<T>
```

## std/diagnostics.bpl

[Source](../lib/diagnostics.bpl)

Exports:

```bpl
export [Span];
export [DiagnosticLevel];
export [Diagnostic];
export [DiagnosticReporter];
```

### Span

```bpl
struct Span
file: String
start: int
end: int
line: int
col: int
frame new(file: string, start: int, end: int, line: int, col: int) ret Span
frame destroy(this: *Span)
```

### DiagnosticLevel

```bpl
enum DiagnosticLevel
Error
Warning
Info
```

### Diagnostic

```bpl
struct Diagnostic
level: DiagnosticLevel
message: String
span: Span
frame new(level: DiagnosticLevel, msg: string, span: Span) ret Diagnostic
frame destroy(this: *Diagnostic)
```

### DiagnosticReporter

```bpl
struct DiagnosticReporter
diagnostics: Array<Diagnostic>
frame new() ret DiagnosticReporter
frame report(this: *DiagnosticReporter, level: DiagnosticLevel, msg: string, span: Span)
frame printAll(this: *DiagnosticReporter, source: string)
frame _printOne(this: *DiagnosticReporter, d: *Diagnostic, source: string)
frame _printSnippet(this: *DiagnosticReporter, line: int, col: int, start: int, end: int, source: string)
frame destroy(this: *DiagnosticReporter)
```

## std/env.bpl

[Source](../lib/env.bpl)

Exports:

```bpl
export [Env];
```

### Env

```bpl
struct Env
frame get(name: string) ret string
frame getOr(name: string, defaultValue: string) ret string
frame set(name: string, value: string) ret bool
frame setIfAbsent(name: string, value: string) ret bool
frame unset(name: string) ret bool
frame has(name: string) ret bool
frame hasValue(name: string) ret bool
frame getPath() ret string
frame getHome() ret string
frame getUser() ret string
frame getShell() ret string
frame getTerm() ret string
frame getPwd() ret string
frame getLang() ret string
frame getTmpDir() ret string
frame isDebug() ret bool
frame getInt(name: string, defaultValue: int) ret int
frame getBool(name: string, defaultValue: bool) ret bool
```

## std/errors.bpl

[Source](../lib/errors.bpl)

Exports:

```bpl
export [Error];
export [OptionUnwrapError];
export [ResultUnwrapError];
export [IOError];
export [CastError];
export [IndexOutOfBoundsError];
export [EmptyError];
export [NullAccessError];
export [DivisionByZeroError];
export [StackOverflowError];
```

### Error

```bpl
struct Error
message: string
code: int
stack_frames: **void
stack_depth: int
frame new(message: string) ret Error
frame new(message: string, code: int) ret Error
frame captureStack(this: *Error)
frame getStackTrace(this: *Error) ret string
frame toString(this: *Error) ret string
frame printStack(this: *Error)
```

### OptionUnwrapError

```bpl
struct OptionUnwrapError: Error
```

### ResultUnwrapError

```bpl
struct ResultUnwrapError: Error
```

### IOError

```bpl
struct IOError: Error
```

### CastError

```bpl
struct CastError: Error
```

### IndexOutOfBoundsError

```bpl
struct IndexOutOfBoundsError: Error
index: int
size: int
frame new(index: int, size: int) ret IndexOutOfBoundsError
frame new(message: string) ret IndexOutOfBoundsError
```

### EmptyError

```bpl
struct EmptyError: Error
```

### NullAccessError

```bpl
struct NullAccessError: Error
function: string
expression: string
line: int
column: int
```

### DivisionByZeroError

```bpl
struct DivisionByZeroError: Error
```

### StackOverflowError

```bpl
struct StackOverflowError: Error
```

## std/fmt.bpl

[Source](../lib/fmt.bpl)

Exports:

```bpl
export [Fmt];
```

### Fmt

```bpl
struct Fmt
frame printInt(n: int)
frame printIntLn(n: int)
frame printHex(n: int)
frame printHexLn(n: int)
frame printString(s: string)
frame printPaddedLeft(text: string, width: int)
frame printPaddedRight(text: string, width: int)
```

## std/fs.bpl

[Source](../lib/fs.bpl)

Exports:

```bpl
export [FS];
export [File];
```

### File

```bpl
struct File
handle: *void
frame open(path: string, mode: string) ret File
frame close(this: *File)
frame write(this: *File, data: string)
frame readLine(this: *File, buf: string, max_len: int) ret bool
```

### FS

```bpl
struct FS
frame exists(path: string) ret bool
frame writeFile(path: string, data: string) ret bool
frame readFile(path: string) ret String
frame mkdir(path: string) ret bool
frame mkdirp(path: string) ret bool
frame listDir(path: string) ret Array<String>
```

## std/hash.bpl

[Source](../lib/hash.bpl)

Exports:

```bpl
export [Hash];
```

### Hash

```bpl
struct Hash
frame fnv1a32(input: string) ret uint
frame checksum32(input: string) ret uint
frame combine32(left: uint, right: uint) ret uint
```

## std/hex.bpl

[Source](../lib/hex.bpl)

Exports:

```bpl
export [Hex];
```

### Hex

```bpl
struct Hex
frame encode(data: *u8, length: int) ret string
frame encodeUpper(data: *u8, length: int) ret string
frame encodeString(str: string) ret string
frame hexCharToValue(c: u8) ret int
frame decode(input: string, output: *u8) ret int
frame decodeToString(input: string) ret string
frame byteToHex(b: u8) ret string
frame u32ToHex(val: u32) ret string
frame u64ToHex(val: u64) ret string
frame isValid(input: string) ret bool
frame decodedLength(input: string) ret int
```

## std/intrinsics.bpl

[Source](../lib/intrinsics.bpl)

Exports:

```bpl
export likely;
export unlikely;
export prefetch;
export trap;
export debugtrap;
export sqrt;
export sin;
export cos;
export pow;
export exp;
export log;
export floor;
export ceil;
export round;
export fabs;
export minnum;
export maxnum;
export copysign;
export fma;
export frameaddress;
export returnaddress;
export stacksave;
export stackrestore;
export ctpop;
export ctlz;
export cttz;
export bswap;
export bitreverse;
export memcpy;
export memmove;
export memset;
export [Dl_info];
export dladdr;
```

```bpl
extern likely(cond: bool) ret bool
```

```bpl
extern unlikely(cond: bool) ret bool
```

```bpl
extern prefetch(ptr: *void, rw: int, locality: int)
```

```bpl
extern trap()
```

```bpl
extern debugtrap()
```

```bpl
extern sqrt(x: float) ret float
```

```bpl
extern sin(x: float) ret float
```

```bpl
extern cos(x: float) ret float
```

```bpl
extern pow(x: float, y: float) ret float
```

```bpl
extern exp(x: float) ret float
```

```bpl
extern log(x: float) ret float
```

```bpl
extern floor(x: float) ret float
```

```bpl
extern ceil(x: float) ret float
```

```bpl
extern round(x: float) ret float
```

```bpl
extern fabs(x: float) ret float
```

```bpl
extern minnum(x: float, y: float) ret float
```

```bpl
extern maxnum(x: float, y: float) ret float
```

```bpl
extern copysign(x: float, y: float) ret float
```

```bpl
extern fma(a: float, b: float, c: float) ret float
```

```bpl
extern frameaddress(level: int) ret *void
```

```bpl
extern returnaddress(level: int) ret *void
```

```bpl
extern stacksave() ret *void
```

```bpl
extern stackrestore(ptr: *void)
```

```bpl
extern ctpop(x: int) ret int
```

```bpl
extern ctlz(x: int) ret int
```

```bpl
extern cttz(x: int) ret int
```

```bpl
extern bswap(x: int) ret int
```

```bpl
extern bitreverse(x: int) ret int
```

```bpl
extern memcpy(dest: *void, src: *void, len: long, is_volatile: bool)
```

```bpl
extern memmove(dest: *void, src: *void, len: long, is_volatile: bool)
```

```bpl
extern memset(dest: *void, val: u8, len: long, is_volatile: bool)
```

### Dl_info

```bpl
struct Dl_info
dli_fname: *i8
dli_fbase: *void
dli_sname: *i8
dli_saddr: *void
```

```bpl
extern dladdr(addr: *void, info: *Dl_info) ret int
```

## std/io.bpl

[Source](../lib/io.bpl)

Exports:

```bpl
export [IO];
export [LineReadResult];
```

### LineReadResult

```bpl
enum LineReadResult
Line(int)
Truncated(int)
EndOfFile
Error
InvalidBuffer
```

### IO

```bpl
struct IO
frame printf(format: string, a0: int) ret int
frame read(format: string, ptr: *void) ret int
frame printInt(n: int)
frame printIntLn(n: int)
frame print(s: string)
frame printString(s: string)
frame printString(s: String)
frame log(msg: string)
frame printFloat(f: float)
frame printFloatLn(f: float)
frame printBool(b: bool)
frame printBoolLn(b: bool)
frame readLine(buf: string, capacity: int) ret LineReadResult
frame bpl_printf(fmt: string, args: *Any, args_count: int)
```

## std/iter.bpl

[Source](../lib/iter.bpl)

Exports:

```bpl
export [Iter];
```

### Iter

```bpl
struct Iter
frame map()
frame filter()
frame reduce()
```

## std/iter_specs.bpl

[Source](../lib/iter_specs.bpl)

Exports:

```bpl
export [Iterator];
export [Iterable];
```

### Iterator

```bpl
spec Iterator<T>
frame next(this: *Self) ret Option<T>
```

### Iterable

```bpl
spec Iterable<T>
frame iterator(this: *Self) ret Iterator<T>
```

## std/json.bpl

[Source](../lib/json.bpl)

Exports:

```bpl
export [JSON];
export [JsonToResult];
export [JsonParseResult];
export [Jsonable];
```

### JsonToResult

```bpl
enum JsonToResult
Result(string)
Ignore
Default
```

### JsonParseResult

```bpl
enum JsonParseResult
Success
Ignore
Default
```

### Jsonable

```bpl
spec Jsonable
frame toJson(this: *Self) ret JsonToResult
frame fromJson(json: string, dest: *Self) ret JsonParseResult
```

### JSON

```bpl
struct JSON
frame stringify<T>(obj: *T) ret String
frame serializeAny(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame serializeEnum(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame serializePrimitive(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame isDynamicArray(info: *TypeInfo) ret bool
frame serializeDynamicArray(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame serializeStruct(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame serializePointer(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame serializeArray(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame parse<T>(s: string) ret *T
frame free<T>(obj: *T)
frame freeAny(ptr: ulong, info: *TypeInfo)
frame freeDynamicArray(ptr: ulong, info: *TypeInfo)
frame parseAny(p: *JsonParser, ptr: ulong, info: *TypeInfo)
frame parseDefault(p: *JsonParser, ptr: ulong, info: *TypeInfo)
frame parsePrimitive(p: *JsonParser, ptr: ulong, info: *TypeInfo)
frame parseStruct(p: *JsonParser, ptr: ulong, info: *TypeInfo)
frame parseArray(p: *JsonParser, ptr: ulong, info: *TypeInfo)
frame parseEnum(p: *JsonParser, ptr: ulong, info: *TypeInfo)
frame parsePointer(p: *JsonParser, ptr: ulong, info: *TypeInfo)
frame parseDynamicArray(p: *JsonParser, ptr: ulong, info: *TypeInfo)
```

## std/linked_list.bpl

[Source](../lib/linked_list.bpl)

Exports:

```bpl
export [LinkedList];
export [ListNode];
export [LinkedListIterator];
```

### ListNode

```bpl
struct ListNode<T>
value: T
next: *ListNode<T>
prev: *ListNode<T>
```

### LinkedListIterator

```bpl
struct LinkedListIterator<T>: Iterator<T>
current: *ListNode<T>
frame next(this: *LinkedListIterator<T>) ret Option<T>
```

### LinkedList

```bpl
struct LinkedList<T>: Iterable<T>, Destructible
head: *ListNode<T>
tail: *ListNode<T>
length: int
frame new() ret LinkedList<T>
frame iterator(this: *LinkedList<T>) ret LinkedListIterator<T>
frame destroy(this: *LinkedList<T>)
frame pushBack(this: *LinkedList<T>, value: T)
frame pushFront(this: *LinkedList<T>, value: T)
frame popBack(this: *LinkedList<T>) ret Option<T>
frame popFront(this: *LinkedList<T>) ret Option<T>
frame len(this: *LinkedList<T>) ret int
frame isEmpty(this: *LinkedList<T>) ret bool
frame front(this: *LinkedList<T>) ret Option<T>
frame back(this: *LinkedList<T>) ret Option<T>
```

## std/log.bpl

[Source](../lib/log.bpl)

Exports:

```bpl
export [Log];
```

### Log

```bpl
struct Log
frame debug(msg: string)
frame info(msg: string)
frame warn(msg: string)
frame error(msg: string)
```

## std/map.bpl

[Source](../lib/map.bpl)

Exports:

```bpl
export [Map];
export [MapIterator];
export [Pair];
export [MapNode];
```

### Pair

```bpl
struct Pair<K, V>
key: K
value: V
```

### MapNode

```bpl
struct MapNode<K, V>
key: K
value: V
next: *MapNode<K, V>
```

### MapIterator

```bpl
struct MapIterator<K, V>: Iterator<Pair<K, V>>
map: *Map<K, V>
bucketIndex: int
currentNode: *MapNode<K, V>
frame next(this: *MapIterator<K, V>) ret Option<Pair<K, V>>
```

### Map

```bpl
struct Map<K, V>: Iterable<Pair<K, V>>, Destructible, Equatable<Map<K, V>>
buckets: Array<*MapNode<K, V>>
count: int
hasher: Func<u64>(*K)
equaler: Func<bool>(*K, *K)
frame new() ret Map<K, V>
frame new(initial_capacity: int) ret Map<K, V>
frame new(initial_capacity: int, hasher: Func<u64>(*K), equaler: Func<bool>(*K, *K)) ret Map<K, V>
frame _getBucketIndex(this: *Map<K, V>, key: K) ret int
frame reserve(this: *Map<K, V>, entry_count: int)
frame bucketCount(this: *Map<K, V>) ret int
frame set(this: *Map<K, V>, key: K, value: V)
frame get(this: *Map<K, V>, key: K) ret Option<V>
frame has(this: *Map<K, V>, key: K) ret bool
frame remove(this: *Map<K, V>, key: K) ret bool
frame iterator(this: *Map<K, V>) ret MapIterator<K, V>
frame size(this: *Map<K, V>) ret int
frame clear(this: *Map<K, V>)
frame __eq__(this: *Map<K, V>, other: *Map<K, V>) ret bool
frame __ne__(this: *Map<K, V>, other: *Map<K, V>) ret bool
frame destroy(this: *Map<K, V>)
```

## std/math.bpl

[Source](../lib/math.bpl)

Exports:

```bpl
export [Math];
export {PI};
export {E};
export {TAU};
export {SQRT2};
export {LN2};
export {LN10};
```

```bpl
global const PI: float = 3.14159265358979323846
```

```bpl
global const E: float = 2.71828182845904523536
```

```bpl
global const TAU: float = 6.28318530717958647692
```

```bpl
global const SQRT2: float = 1.41421356237309504880
```

```bpl
global const LN2: float = 0.69314718055994530942
```

```bpl
global const LN10: float = 2.30258509299404568402
```

### Math

```bpl
struct Math
frame abs(x: int) ret int
frame abs(x: float) ret float
frame min(a: int, b: int) ret int
frame max(a: int, b: int) ret int
frame min(a: float, b: float) ret float
frame max(a: float, b: float) ret float
frame sqrt(x: float) ret float
frame sin(x: float) ret float
frame cos(x: float) ret float
frame pow(x: float, y: float) ret float
frame exp(x: float) ret float
frame log(x: float) ret float
frame floor(x: float) ret float
frame ceil(x: float) ret float
frame round(x: float) ret float
frame copysign(x: float, y: float) ret float
frame tan(x: float) ret float
frame asin(x: float) ret float
frame acos(x: float) ret float
frame atan(x: float) ret float
frame atan2(y: float, x: float) ret float
frame log10(x: float) ret float
frame log2(x: float) ret float
frame clamp(x: float, minVal: float, maxVal: float) ret float
frame clamp(x: int, minVal: int, maxVal: int) ret int
frame lerp(a: float, b: float, t: float) ret float
frame sign(x: float) ret float
frame sign(x: int) ret int
frame mod(x: float, y: float) ret float
frame degToRad(deg: float) ret float
frame radToDeg(rad: float) ret float
frame isPowerOfTwo(x: int) ret bool
frame nextPowerOfTwo(x: int) ret int
frame gcd(a: int, b: int) ret int
frame lcm(a: int, b: int) ret int
frame factorial(n: int) ret long
frame fibonacci(n: int) ret long
frame isEven(x: int) ret bool
frame isOdd(x: int) ret bool
```

## std/memory/allocator.bpl

[Source](../lib/memory/allocator.bpl)

Exports:

```bpl
export [Allocator];
```

### Allocator

```bpl
spec Allocator
frame alloc(this: *Self, size: ulong) ret *void
frame free(this: *Self, ptr: *void)
frame reset(this: *Self)
```

## std/memory/arena_allocator.bpl

[Source](../lib/memory/arena_allocator.bpl)

Exports:

```bpl
export [ArenaAllocator];
```

### ArenaAllocator

```bpl
struct ArenaAllocator: Allocator
head: *ArenaBlock
current: *ArenaBlock
default_block_size: ulong
frame init(this: *ArenaAllocator, block_size: ulong)
frame alloc(this: *ArenaAllocator, size: ulong) ret *void
frame alloc_large(this: *ArenaAllocator, size: ulong) ret *void
frame grow_and_alloc(this: *ArenaAllocator, size: ulong) ret *void
frame free(this: *ArenaAllocator, ptr: *void)
frame reset(this: *ArenaAllocator)
frame destroy(this: *ArenaAllocator)
```

## std/memory/page_allocator.bpl

[Source](../lib/memory/page_allocator.bpl)

Exports:

```bpl
export [PageAllocator];
```

### PageAllocator

```bpl
struct PageAllocator: Allocator
frame alloc(this: *PageAllocator, size: ulong) ret *void
frame free(this: *PageAllocator, ptr: *void)
frame reset(this: *PageAllocator)
```

## std/memory/pool_allocator.bpl

[Source](../lib/memory/pool_allocator.bpl)

Exports:

```bpl
export [PoolAllocator];
```

### PoolAllocator

```bpl
struct PoolAllocator: Allocator
block_size: ulong
free_head: *PoolNode
chunk_head: *PoolChunk
frame init(this: *PoolAllocator, item_size: ulong)
frame alloc(this: *PoolAllocator, size: ulong) ret *void
frame grow(this: *PoolAllocator)
frame free(this: *PoolAllocator, ptr: *void)
frame reset(this: *PoolAllocator)
frame destroy(this: *PoolAllocator)
```

## std/memory/stack_allocator.bpl

[Source](../lib/memory/stack_allocator.bpl)

Exports:

```bpl
export [StackAllocator];
```

### StackAllocator

```bpl
struct StackAllocator: Allocator
base_ptr: *u8
top_offset: ulong
capacity: ulong
frame init(this: *StackAllocator, size: ulong)
frame alloc(this: *StackAllocator, size: ulong) ret *void
frame free(this: *StackAllocator, ptr: *void)
frame get_marker(this: *StackAllocator) ret ulong
frame free_to_marker(this: *StackAllocator, marker: ulong)
frame reset(this: *StackAllocator)
frame destroy(this: *StackAllocator)
```

## std/memory/syscalls.bpl

[Source](../lib/memory/syscalls.bpl)

Exports:

```bpl
export [mmap];
export [munmap];
export {MAP_PRIVATE};
export {MAP_ANONYMOUS};
export {PROT_READ};
export {PROT_WRITE};
export {MAP_FAILED};
```

```bpl
extern mmap(addr: *void, len: ulong, prot: int, flags: int, fd: int, offset: ulong) ret *void
```

```bpl
extern munmap(addr: *void, len: ulong) ret int
```

```bpl
global const PROT_READ: int = 1
```

```bpl
global const PROT_WRITE: int = 2
```

```bpl
global const MAP_PRIVATE: int = 2
```

```bpl
global const MAP_ANONYMOUS: int = 32
```

```bpl
global const MAP_FAILED: ulong = 18446744073709551615
```

## std/option.bpl

[Source](../lib/option.bpl)

Exports:

```bpl
export [Option];
```

### Option

```bpl
enum Option<T>
Some(T)
None
frame isSome(this: Option<T>) ret bool
frame isNone(this: Option<T>) ret bool
frame panic() ret T
frame unwrap(this: Option<T>) ret T
frame unwrapOr(this: Option<T>, defaultValue: T) ret T
frame __eq__(this: *Option<T>, other: *Option<T>) ret bool
frame __ne__(this: *Option<T>, other: *Option<T>) ret bool
frame clone(this: *Option<T>) ret Option<T>
```

## std/path.bpl

[Source](../lib/path.bpl)

Exports:

```bpl
export [Path];
```

### Path

```bpl
struct Path
frame join(a: string, b: string) ret String
frame dirname(path: string) ret String
frame basename(path: string) ret String
frame isAbsolute(path: string) ret bool
frame extname(path: string) ret String
frame normalize(path: string) ret String
frame resolve(base: string, target: string) ret String
frame relative(src: string, dest: string) ret String
```

## std/primitives.bpl

[Source](../lib/primitives.bpl)

Exports:

```bpl
export [Int];
export [Bool];
export [Double];
export [Long];
export [Char];
export [UChar];
export [Short];
export [UShort];
export [UInt];
export [ULong];
```

### Int

```bpl
struct Int: Comparable<Int>
value: int
frame toString(this: *Int) ret String
frame __eq__(this: *Int, other: *Int) ret bool
frame __ne__(this: *Int, other: *Int) ret bool
frame __lt__(this: *Int, other: *Int) ret bool
frame __gt__(this: *Int, other: *Int) ret bool
frame __le__(this: *Int, other: *Int) ret bool
frame __ge__(this: *Int, other: *Int) ret bool
frame popCount(this: *Int) ret int
frame leadingZeros(this: *Int) ret int
frame trailingZeros(this: *Int) ret int
frame byteSwap(this: *Int) ret int
frame reverseBits(this: *Int) ret int
```

### Bool

```bpl
struct Bool: Comparable<Bool>
value: bool
frame toString(this: *Bool) ret String
frame __eq__(this: *Bool, other: *Bool) ret bool
frame __ne__(this: *Bool, other: *Bool) ret bool
frame __lt__(this: *Bool, other: *Bool) ret bool
frame __gt__(this: *Bool, other: *Bool) ret bool
frame __le__(this: *Bool, other: *Bool) ret bool
frame __ge__(this: *Bool, other: *Bool) ret bool
```

### Double

```bpl
struct Double: Comparable<Double>
value: double
frame toString(this: *Double) ret String
frame __eq__(this: *Double, other: *Double) ret bool
frame __ne__(this: *Double, other: *Double) ret bool
frame __lt__(this: *Double, other: *Double) ret bool
frame __gt__(this: *Double, other: *Double) ret bool
frame __le__(this: *Double, other: *Double) ret bool
frame __ge__(this: *Double, other: *Double) ret bool
```

### Long

```bpl
struct Long: Comparable<Long>
value: long
frame toString(this: *Long) ret String
frame __eq__(this: *Long, other: *Long) ret bool
frame __ne__(this: *Long, other: *Long) ret bool
frame __lt__(this: *Long, other: *Long) ret bool
frame __gt__(this: *Long, other: *Long) ret bool
frame __le__(this: *Long, other: *Long) ret bool
frame __ge__(this: *Long, other: *Long) ret bool
frame popCount(this: *Long) ret long
frame leadingZeros(this: *Long) ret long
frame trailingZeros(this: *Long) ret long
frame byteSwap(this: *Long) ret long
frame reverseBits(this: *Long) ret long
```

### Char

```bpl
struct Char
value: char
frame toString(this: *Char) ret String
```

### UChar

```bpl
struct UChar
value: uchar
frame toString(this: *UChar) ret String
```

### Short

```bpl
struct Short
value: short
frame toString(this: *Short) ret String
frame popCount(this: *Short) ret uint
frame leadingZeros(this: *Short) ret uint
frame trailingZeros(this: *Short) ret uint
frame byteSwap(this: *Short) ret uint
frame reverseBits(this: *Short) ret uint
```

### UShort

```bpl
struct UShort
value: ushort
frame toString(this: *UShort) ret String
frame popCount(this: *UShort) ret uint
frame leadingZeros(this: *UShort) ret uint
frame trailingZeros(this: *UShort) ret uint
frame byteSwap(this: *UShort) ret uint
frame reverseBits(this: *UShort) ret uint
```

### UInt

```bpl
struct UInt
value: uint
frame toString(this: *UInt) ret String
frame popCount(this: *UInt) ret uint
frame leadingZeros(this: *UInt) ret uint
frame trailingZeros(this: *UInt) ret uint
frame byteSwap(this: *UInt) ret uint
frame reverseBits(this: *UInt) ret uint
```

### ULong

```bpl
struct ULong
value: ulong
frame toString(this: *ULong) ret String
frame popCount(this: *ULong) ret ulong
frame leadingZeros(this: *ULong) ret ulong
frame trailingZeros(this: *ULong) ret ulong
frame byteSwap(this: *ULong) ret ulong
frame reverseBits(this: *ULong) ret ulong
```

## std/priority_queue.bpl

[Source](../lib/priority_queue.bpl)

Exports:

```bpl
export [PriorityQueue];
export [PriorityQueueIterator];
```

### PriorityQueueIterator

```bpl
struct PriorityQueueIterator<T>: Iterator<T>
pq: *PriorityQueue<T>
index: int
frame next(this: *PriorityQueueIterator<T>) ret Option<T>
```

### PriorityQueue

```bpl
struct PriorityQueue<T>: Iterable<T>, Destructible
items: Array<T>
frame new(initial_capacity: int) ret PriorityQueue<T>
frame iterator(this: *PriorityQueue<T>) ret PriorityQueueIterator<T>
frame destroy(this: *PriorityQueue<T>)
frame push(this: *PriorityQueue<T>, value: T)
frame pop(this: *PriorityQueue<T>) ret Option<T>
frame peek(this: *PriorityQueue<T>) ret Option<T>
frame siftUp(this: *PriorityQueue<T>, index: int)
frame siftDown(this: *PriorityQueue<T>, index: int)
frame len(this: *PriorityQueue<T>) ret int
frame isEmpty(this: *PriorityQueue<T>) ret bool
```

## std/process.bpl

[Source](../lib/process.bpl)

Exports:

```bpl
export exec;
export execStatus;
export execOutput;
export [ProcessResult];
export execShell;
export execSilent;
export sleep;
```

### ProcessResult

```bpl
struct ProcessResult
exitCode: int
output: String
```

```bpl
frame sleep(ms: int)
```

```bpl
frame exec(args: ...string, count: int)
```

```bpl
frame execShell(cmd: string) ret ProcessResult
```

```bpl
frame execSilent(args: ...string, count: int) ret int
```

```bpl
frame execStatus(args: ...string, count: int) ret int
```

```bpl
frame execOutput(args: ...string, count: int) ret ProcessResult
```

## std/queue.bpl

[Source](../lib/queue.bpl)

Exports:

```bpl
export [Queue];
export [QueueIterator];
```

### QueueIterator

```bpl
struct QueueIterator<T>: Iterator<T>
queue: *Queue<T>
index: int
frame next(this: *QueueIterator<T>) ret Option<T>
```

### Queue

```bpl
struct Queue<T>: Iterable<T>, Destructible
inner: Array<T>
head: int
tail: int
count: int
frame new(initial_capacity: int) ret Queue<T>
frame iterator(this: *Queue<T>) ret QueueIterator<T>
frame destroy(this: *Queue<T>)
frame enqueue(this: *Queue<T>, value: T)
frame dequeue(this: *Queue<T>) ret Option<T>
frame resize(this: *Queue<T>)
frame size(this: *Queue<T>) ret int
frame isEmpty(this: *Queue<T>) ret bool
frame peek(this: *Queue<T>) ret Option<T>
frame clear(this: *Queue<T>)
frame __lshift__(this: *Queue<T>, value: T) ret *Queue<T>
```

## std/rand.bpl

[Source](../lib/rand.bpl)

Exports:

```bpl
export [Rand];
```

### Rand

```bpl
struct Rand
state: ulong
frame seed(seed: ulong) ret Rand
frame seedFromTime() ret Rand
frame nextInt(this: *Rand) ret int
frame nextUInt(this: *Rand) ret uint
frame nextLong(this: *Rand) ret long
frame nextFloat(this: *Rand) ret float
frame nextBool(this: *Rand) ret bool
frame range(this: *Rand, min: int, max: int) ret int
frame range(this: *Rand, min: float, max: float) ret float
frame nextGaussian(this: *Rand) ret float
frame shuffleInt(this: *Rand, arr: *Array<int>)
frame choiceInt(this: *Rand, arr: *Array<int>) ret int
frame fillBytes(this: *Rand, buf: *u8, len: int)
frame weightedChoice(this: *Rand, weights: *Array<int>) ret int
```

## std/range.bpl

[Source](../lib/range.bpl)

Exports:

```bpl
export [Range];
```

### Range

```bpl
struct Range
start: int
end: int
step: int
frame new(start: int, end: int, step: int) ret Range
frame until(end: int) ret Range
frame between(start: int, end: int) ret Range
frame betweenInclusive(start: int, end: int) ret Range
frame len(this: *Range) ret int
frame contains(this: *Range, value: int) ret bool
frame get(this: *Range, index: int) ret int
frame reverse(this: *Range) ret Range
frame __get__(this: *Range, index: int) ret int
frame __eq__(this: *Range, other: Range) ret bool
frame __ne__(this: *Range, other: Range) ret bool
```

## std/rational.bpl

[Source](../lib/rational.bpl)

Exports:

```bpl
export [Rational];
```

### Rational

```bpl
struct Rational
num: long
den: long
frame new(numerator: long, denominator: long) ret Rational
frame fromInt(value: int) ret Rational
frame fromLong(value: long) ret Rational
frame zero() ret Rational
frame one() ret Rational
frame gcd(a: long, b: long) ret long
frame simplify(this: *Rational)
frame add(this: *Rational, other: Rational) ret Rational
frame sub(this: *Rational, other: Rational) ret Rational
frame mul(this: *Rational, other: Rational) ret Rational
frame div(this: *Rational, other: Rational) ret Rational
frame negate(this: *Rational) ret Rational
frame reciprocal(this: *Rational) ret Rational
frame abs(this: *Rational) ret Rational
frame pow(this: *Rational, n: int) ret Rational
frame toFloat(this: *Rational) ret float
frame toInt(this: *Rational) ret int
frame toLong(this: *Rational) ret long
frame floor(this: *Rational) ret long
frame ceil(this: *Rational) ret long
frame round(this: *Rational) ret long
frame isValid(this: *Rational) ret bool
frame isZero(this: *Rational) ret bool
frame isPositive(this: *Rational) ret bool
frame isNegative(this: *Rational) ret bool
frame isInteger(this: *Rational) ret bool
frame compare(this: *Rational, other: *Rational) ret int
frame equals(this: *Rational, other: *Rational) ret bool
frame lessThan(this: *Rational, other: *Rational) ret bool
frame lessEqual(this: *Rational, other: *Rational) ret bool
frame greaterThan(this: *Rational, other: *Rational) ret bool
frame greaterEqual(this: *Rational, other: *Rational) ret bool
frame sign(this: *Rational) ret int
frame clone(this: *Rational) ret Rational
frame numerator(this: *Rational) ret long
frame denominator(this: *Rational) ret long
frame __add__(this: *Rational, other: *Rational) ret Rational
frame __sub__(this: *Rational, other: *Rational) ret Rational
frame __mul__(this: *Rational, other: *Rational) ret Rational
frame __div__(this: *Rational, other: *Rational) ret Rational
frame __eq__(this: *Rational, other: *Rational) ret bool
frame __ne__(this: *Rational, other: *Rational) ret bool
frame __lt__(this: *Rational, other: *Rational) ret bool
frame __le__(this: *Rational, other: *Rational) ret bool
frame __gt__(this: *Rational, other: *Rational) ret bool
frame __ge__(this: *Rational, other: *Rational) ret bool
frame __neg__(this: *Rational) ret Rational
```

## std/reflection.bpl

[Source](../lib/reflection.bpl)

Exports:

```bpl
export {TYPE_KIND_PRIMITIVE};
export {TYPE_KIND_STRUCT};
export {TYPE_KIND_ARRAY};
export {TYPE_KIND_POINTER};
export {TYPE_KIND_ENUM};
export {TYPE_KIND_FUNCTION};
export [FieldInfo];
export [MethodInfo];
export [TypeInfo];
```

```bpl
global const TYPE_KIND_PRIMITIVE: u8 = 0
```

```bpl
global const TYPE_KIND_STRUCT: u8 = 1
```

```bpl
global const TYPE_KIND_ARRAY: u8 = 2
```

```bpl
global const TYPE_KIND_POINTER: u8 = 3
```

```bpl
global const TYPE_KIND_ENUM: u8 = 4
```

```bpl
global const TYPE_KIND_FUNCTION: u8 = 5
```

### FieldInfo

```bpl
struct FieldInfo
name: string
offset: ulong
type_info: *TypeInfo
```

### MethodInfo

```bpl
struct MethodInfo
name: string
func_ptr: *void
```

### TypeInfo

```bpl
struct TypeInfo
name: string
size: ulong
kind: u8
num_fields: int
fields: *FieldInfo
num_methods: int
methods: *MethodInfo
element_type: *TypeInfo
```

## std/result.bpl

[Source](../lib/result.bpl)

Exports:

```bpl
export [Result];
```

### Result

```bpl
enum Result<T, E>
Ok(T)
Err(E)
frame isOk(this: Result<T, E>) ret bool
frame isErr(this: Result<T, E>) ret bool
frame unwrap(this: Result<T, E>) ret T
frame unwrapOr(this: Result<T, E>, defaultValue: T) ret T
frame unwrapErr(this: Result<T, E>) ret E
frame __eq__(this: *Result<T, E>, other: *Result<T, E>) ret bool
frame __ne__(this: *Result<T, E>, other: *Result<T, E>) ret bool
frame clone(this: *Result<T, E>) ret Result<T, E>
```

## std/scope_stack.bpl

[Source](../lib/scope_stack.bpl)

Exports:

```bpl
export [ScopeStack];
```

### ScopeStack

```bpl
struct ScopeStack<T>
scopes: Array<Map<string, T>>
frame new() ret ScopeStack<T>
frame destroy(this: *ScopeStack<T>)
frame enterScope(this: *ScopeStack<T>)
frame exitScope(this: *ScopeStack<T>)
frame define(this: *ScopeStack<T>, name: string, value: T)
frame lookup(this: *ScopeStack<T>, name: string) ret Option<T>
frame isDefinedInCurrentScope(this: *ScopeStack<T>, name: string) ret bool
```

## std/set.bpl

[Source](../lib/set.bpl)

Exports:

```bpl
export [Set];
export [SetIterator];
```

### SetIterator

```bpl
struct SetIterator<T>: Iterator<T>
iter: MapIterator<T, bool>
frame next(this: *SetIterator<T>) ret Option<T>
```

### Set

```bpl
struct Set<T>: Iterable<T>, Destructible
inner: Map<T, bool>
frame new() ret Set<T>
frame new(initial_capacity: int) ret Set<T>
frame new(initial_capacity: int, hasher: Func<u64>(*T), equaler: Func<bool>(*T, *T)) ret Set<T>
frame iterator(this: *Set<T>) ret SetIterator<T>
frame destroy(this: *Set<T>)
frame add(this: *Set<T>, value: T)
frame has(this: *Set<T>, value: T) ret bool
frame remove(this: *Set<T>, value: T) ret bool
frame size(this: *Set<T>) ret int
frame clear(this: *Set<T>)
frame union(this: *Set<T>, other: *Set<T>) ret Set<T>
frame difference(this: *Set<T>, other: *Set<T>) ret Set<T>
frame intersection(this: *Set<T>, other: *Set<T>) ret Set<T>
frame __or__(this: *Set<T>, other: Set<T>) ret Set<T>
frame __sub__(this: *Set<T>, other: Set<T>) ret Set<T>
frame __and__(this: *Set<T>, other: Set<T>) ret Set<T>
frame __eq__(this: *Set<T>, other: Set<T>) ret bool
frame __ne__(this: *Set<T>, other: Set<T>) ret bool
```

## std/stack.bpl

[Source](../lib/stack.bpl)

Exports:

```bpl
export [Stack];
```

### Stack

```bpl
struct Stack<T>
inner: Array<T>
frame new(initial_capacity: int) ret Stack<T>
frame destroy(this: *Stack<T>)
frame push(this: *Stack<T>, value: T)
frame pop(this: *Stack<T>) ret Option<T>
frame size(this: *Stack<T>) ret int
frame isEmpty(this: *Stack<T>) ret bool
frame peek(this: *Stack<T>) ret Option<T>
frame clear(this: *Stack<T>)
frame __lshift__(this: *Stack<T>, value: T) ret Stack<T>
```

## std/stats.bpl

[Source](../lib/stats.bpl)

Exports:

```bpl
export [Stats];
```

### Stats

```bpl
struct Stats
frame mean(data: *int, length: int) ret float
frame mean(data: *float, length: int) ret float
frame sum(data: *int, length: int) ret long
frame sum(data: *float, length: int) ret float
frame min(data: *int, length: int) ret int
frame max(data: *int, length: int) ret int
frame min(data: *float, length: int) ret float
frame max(data: *float, length: int) ret float
frame range(data: *int, length: int) ret int
frame range(data: *float, length: int) ret float
frame variance(data: *int, length: int) ret float
frame variance(data: *float, length: int) ret float
frame sampleVariance(data: *int, length: int) ret float
frame sampleVariance(data: *float, length: int) ret float
frame stddev(data: *int, length: int) ret float
frame stddev(data: *float, length: int) ret float
frame sampleStddev(data: *int, length: int) ret float
frame sampleStddev(data: *float, length: int) ret float
frame median(data: *int, length: int) ret float
frame median(data: *float, length: int) ret float
frame mode(data: *int, length: int) ret int
frame percentile(data: *float, length: int, p: float) ret float
frame covariance(dataX: *float, dataY: *float, length: int) ret float
frame correlation(dataX: *float, dataY: *float, length: int) ret float
frame geometricMean(data: *float, length: int) ret float
frame harmonicMean(data: *float, length: int) ret float
frame skewness(data: *float, length: int) ret float
frame kurtosis(data: *float, length: int) ret float
```

## std/std.bpl

[Source](../lib/std.bpl)

Exports:

```bpl
export [Type];
export [Any];
export [Comparable];
export [Equatable];
export [Destructible];
export [Cloneable];
export [Iterator];
export [Iterable];
export [Int];
export [Bool];
export [Double];
export [Long];
export [Char];
export [UChar];
export [Short];
export [UShort];
export [UInt];
export [ULong];
export [OptionUnwrapError];
export [ResultUnwrapError];
export [IOError];
export [CastError];
export [IndexOutOfBoundsError];
export [EmptyError];
export [NullAccessError];
export [DivisionByZeroError];
export [StackOverflowError];
export [Array];
export [Map];
export [String];
export [Stack];
export [Queue];
export [Deque];
export [DequeIterator];
export [Set];
export [LinkedList];
export [ListNode];
export [PriorityQueue];
export [likely];
export [unlikely];
export [prefetch];
export [trap];
export [debugtrap];
export [printf];
export [fprintf];
export [dprintf];
export [sprintf];
export [snprintf];
export [puts];
export [putchar];
export [scanf];
export [gets];
export [write];
export [malloc];
export [free];
export [memcpy];
export [memmove];
export [memset];
export [strlen];
export [strcmp];
export [strncmp];
export [strcpy];
export [strcat];
export [atoi];
export [Option];
export [Result];
export [Vec2];
export [Vec3];
export [IO];
export [LineReadResult];
export [FS];
export [Path];
export [Math];
export {PI};
export {E};
export {TAU};
export {SQRT2};
export {LN2};
export {LN10};
export [Rand];
export [Time];
export [Duration];
export [Stopwatch];
export [Assert];
export [Algorithm];
export [UTF8];
export [CharUtils];
export [Range];
export [StringBuilder];
export [Args];
export [Command];
export [Flag];
export [Argument];
export [ArgParser];
export [ParsedArgs];
export [JSON];
export [JsonToResult];
export [JsonParseResult];
export [Jsonable];
export [Log];
export exec;
export execStatus;
export execOutput;
export execShell;
export execSilent;
export sleep;
export [ProcessResult];
export [BitSet];
export [Base64];
export [Hex];
export [ByteReader];
export [ByteWriter];
export [Hash];
export [UUID];
export [Stats];
export [Complex];
export [Rational];
export [Env];
export [Date];
export [DateTime];
```

## std/string.bpl

[Source](../lib/string.bpl)

Exports:

```bpl
export [String];
```

### String

```bpl
struct String: Comparable<String>, Cloneable<String>, Destructible, Hashable<String>
data: string
length: int
frame new(text: string) ret String
frame new(this: *String) ret *String
frame hash(this: *String) ret u64
frame destroy(this: *String)
frame toString(this: *String) ret string
frame assign(this: *String, text: string)
frame isEmpty(this: String) ret bool
frame clone(this: *String) ret String
frame includes(this: *String, substr: string) ret bool
frame __eq__(this: *String, other: *String) ret bool
frame __ne__(this: *String, other: *String) ret bool
frame __lt__(this: *String, other: *String) ret bool
frame __gt__(this: *String, other: *String) ret bool
frame __le__(this: *String, other: *String) ret bool
frame __ge__(this: *String, other: *String) ret bool
frame __add__(this: *String, other: String) ret String
frame __add__(this: *String, other: string) ret String
frame __eq__(this: *String, other: String) ret bool
frame __eq__(this: *String, other: string) ret bool
frame __ne__(this: *String, other: String) ret bool
frame __lt__(this: *String, other: String) ret bool
frame __le__(this: *String, other: String) ret bool
frame __gt__(this: *String, other: String) ret bool
frame __ge__(this: *String, other: String) ret bool
frame __lshift__(this: *String, other: String) ret String
frame __lshift__(this: *String, other: string) ret String
frame fromInt(val: long) ret String
frame fromAddress(addr: long) ret String
frame get(this: *String, index: int) ret char
frame substring(this: *String, start: int, len: int) ret String
frame cstr(this: *String) ret string
frame split(this: *String, delimiter: char) ret Array<String>
frame trim(this: *String) ret String
frame trimLeft(this: *String) ret String
frame trimRight(this: *String) ret String
frame startsWith(this: *String, prefix: string) ret bool
frame endsWith(this: *String, suffix: string) ret bool
frame toUpper(this: *String) ret String
frame toLower(this: *String) ret String
frame repeat(this: *String, count: int) ret String
frame padLeft(this: *String, targetLen: int, padChar: char) ret String
frame padRight(this: *String, targetLen: int, padChar: char) ret String
frame reverse(this: *String) ret String
frame replace(this: *String, old: string, newStr: string) ret String
frame replaceAll(this: *String, old: string, newStr: string) ret String
frame indexOf(this: *String, substr: string) ret int
frame lastIndexOf(this: *String, substr: string) ret int
frame count(this: *String, substr: string) ret int
frame isDigits(this: *String) ret bool
frame isAlpha(this: *String) ret bool
frame isAlphanumeric(this: *String) ret bool
```

## std/string_builder.bpl

[Source](../lib/string_builder.bpl)

Exports:

```bpl
export [StringBuilder];
```

### StringBuilder

```bpl
struct StringBuilder
buffer: string
length: int
capacity: int
frame new(initial_capacity: int) ret StringBuilder
frame newDefault() ret StringBuilder
frame destroy(this: *StringBuilder)
frame ensureCapacity(this: *StringBuilder, additional: int)
frame append(this: *StringBuilder, str: string)
frame appendString(this: *StringBuilder, str: String)
frame appendChar(this: *StringBuilder, ch: char)
frame appendInt(this: *StringBuilder, value: int)
frame clear(this: *StringBuilder)
frame len(this: *StringBuilder) ret int
frame toString(this: *StringBuilder) ret string
frame __lshift__(this: *StringBuilder, str: string) ret StringBuilder
```

## std/string_utils.bpl

[Source](../lib/string_utils.bpl)

Exports:

```bpl
export [StringUtils];
```

### StringUtils

```bpl
struct StringUtils
frame startsWith(s: string, prefix: string) ret bool
frame endsWith(s: string, suffix: string) ret bool
frame find(s: string, ch: char) ret int
frame trim(s: string) ret String
frame replaceChar(s: string, target: char, repl: char) ret String
frame findString(haystack: string, needle: string, start: int) ret int
frame replace(s: string, oldStr: string, newStr: string) ret String
```

## std/sync.bpl

[Source](../lib/sync.bpl)

Exports:

```bpl
export [Sync];
```

### Sync

```bpl
struct Sync
frame mutex()
frame lock()
frame unlock()
```

## std/thread.bpl

[Source](../lib/thread.bpl)

Exports:

```bpl
export [Thread];
```

### Thread

```bpl
struct Thread
frame spawn()
frame join()
```

## std/time.bpl

[Source](../lib/time.bpl)

Exports:

```bpl
export [Time];
export [Duration];
export [Stopwatch];
```

### Duration

```bpl
struct Duration
milliseconds: long
frame fromMs(ms: long) ret Duration
frame fromSeconds(sec: long) ret Duration
frame fromMinutes(min: long) ret Duration
frame fromHours(hours: long) ret Duration
frame toMs(this: *Duration) ret long
frame toSeconds(this: *Duration) ret long
frame toMinutes(this: *Duration) ret long
frame toHours(this: *Duration) ret long
frame __add__(this: *Duration, other: Duration) ret Duration
frame __sub__(this: *Duration, other: Duration) ret Duration
frame __eq__(this: *Duration, other: *Duration) ret bool
frame __lt__(this: *Duration, other: *Duration) ret bool
frame __gt__(this: *Duration, other: *Duration) ret bool
frame __le__(this: *Duration, other: *Duration) ret bool
frame __ge__(this: *Duration, other: *Duration) ret bool
```

### Stopwatch

```bpl
struct Stopwatch
startTime: long
running: bool
frame new() ret Stopwatch
frame start(this: *Stopwatch)
frame elapsed(this: *Stopwatch) ret Duration
frame elapsedMs(this: *Stopwatch) ret long
frame stop(this: *Stopwatch) ret Duration
frame reset(this: *Stopwatch)
frame restart(this: *Stopwatch)
```

### Time

```bpl
struct Time
frame now() ret int
frame nowMs() ret long
frame nowUs() ret long
frame sleep(ms: int)
frame sleepUs(usec: int)
frame sleepSeconds(sec: int)
frame formatTimestamp(timestamp: long) ret string
frame measure(action: Lambda<void>()) ret long
```

## std/type.bpl

[Source](../lib/type.bpl)

Exports:

```bpl
export [Type];
export [Any];
```

### Type

```bpl
struct Type
frame getTypeName(this: *Type) ret string
frame toString(this: *Type) ret string
frame destroy(this: *Type)
```

### Any

```bpl
struct Any
type_info: *TypeInfo
data: u64
```

## std/utf8.bpl

[Source](../lib/utf8.bpl)

Exports:

```bpl
export [UTF8];
```

### UTF8

```bpl
struct UTF8
frame encode(s: string) ret string
frame decode(buf: string) ret String
frame byteLength(s: string) ret int
frame codepointCount(s: string) ret int
frame codepointByteLength(leadByte: u8) ret int
frame isValid(s: string) ret bool
frame decodeCodepoint(s: string, pos: int) ret u32
frame encodeCodepoint(codepoint: u32, dest: *u8) ret int
frame isAscii(codepoint: u32) ret bool
frame isAsciiString(s: string) ret bool
frame toCodepoints(s: string) ret Array<u32>
```

## std/uuid.bpl

[Source](../lib/uuid.bpl)

Exports:

```bpl
export [UUID];
```

### UUID

```bpl
struct UUID
bytes: u8[16]
frame v4() ret UUID
frame fromBytes(data: *u8) ret UUID
frame nil() ret UUID
frame toString(this: *UUID) ret string
frame fromString(str: string) ret UUID
frame hexCharToValue(c: u8) ret int
frame isNil(this: *UUID) ret bool
frame version(this: *UUID) ret int
frame variant(this: *UUID) ret int
frame equals(this: *UUID, other: *UUID) ret bool
frame compare(this: *UUID, other: *UUID) ret int
frame isValid(str: string) ret bool
frame clone(this: *UUID) ret UUID
frame toBytes(this: *UUID, output: *u8)
```

## std/vec2.bpl

[Source](../lib/vec2.bpl)

Exports:

```bpl
export [Vec2];
```

### Vec2

```bpl
struct Vec2: Equatable<Vec2>, Cloneable<Vec2>
x: float
y: float
frame new(x: float, y: float) ret Vec2
frame __eq__(this: *Vec2, other: *Vec2) ret bool
frame __ne__(this: *Vec2, other: *Vec2) ret bool
frame clone(this: *Vec2) ret Vec2
frame add(this: *Vec2, other: Vec2) ret Vec2
frame sub(this: *Vec2, other: Vec2) ret Vec2
frame dot(this: *Vec2, other: Vec2) ret float
frame length(this: *Vec2) ret float
frame normalize(this: *Vec2) ret Vec2
frame print(this: *Vec2)
frame __add__(this: *Vec2, other: Vec2) ret Vec2
frame __sub__(this: *Vec2, other: Vec2) ret Vec2
frame __mul__(this: *Vec2, scalar: float) ret Vec2
frame __div__(this: *Vec2, scalar: float) ret Vec2
frame __eq__(this: *Vec2, other: Vec2) ret bool
frame __ne__(this: *Vec2, other: Vec2) ret bool
frame __neg__(this: *Vec2) ret Vec2
```

## std/vec3.bpl

[Source](../lib/vec3.bpl)

Exports:

```bpl
export [Vec3];
```

### Vec3

```bpl
struct Vec3: Equatable<Vec3>, Cloneable<Vec3>
x: float
y: float
z: float
frame new(x: float, y: float, z: float) ret Vec3
frame __eq__(this: *Vec3, other: *Vec3) ret bool
frame __ne__(this: *Vec3, other: *Vec3) ret bool
frame clone(this: *Vec3) ret Vec3
frame add(this: *Vec3, other: Vec3) ret Vec3
frame sub(this: *Vec3, other: Vec3) ret Vec3
frame dot(this: *Vec3, other: Vec3) ret float
frame cross(this: *Vec3, other: Vec3) ret Vec3
frame length(this: *Vec3) ret float
frame normalize(this: *Vec3) ret Vec3
frame print(this: *Vec3)
frame __add__(this: *Vec3, other: Vec3) ret Vec3
frame __sub__(this: *Vec3, other: Vec3) ret Vec3
frame __mul__(this: *Vec3, scalar: float) ret Vec3
frame __div__(this: *Vec3, scalar: float) ret Vec3
frame __eq__(this: *Vec3, other: Vec3) ret bool
frame __ne__(this: *Vec3, other: Vec3) ret bool
frame __neg__(this: *Vec3) ret Vec3
```
