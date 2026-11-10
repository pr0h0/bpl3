# Standard Library Declaration Reference

Generated from parsed library declarations with `bun run docs:stdlib`. Do not edit by hand.

This index covers all 93 BPL modules under `lib/`, including memory and low-level modules.
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
- [std/ansi.bpl](../lib/ansi.bpl)
- [std/arg_parser.bpl](../lib/arg_parser.bpl)
- [std/args.bpl](../lib/args.bpl)
- [std/array.bpl](../lib/array.bpl)
- [std/assert.bpl](../lib/assert.bpl)
- [std/base32.bpl](../lib/base32.bpl)
- [std/base64.bpl](../lib/base64.bpl)
- [std/base85.bpl](../lib/base85.bpl)
- [std/bigint.bpl](../lib/bigint.bpl)
- [std/binary.bpl](../lib/binary.bpl)
- [std/bits.bpl](../lib/bits.bpl)
- [std/bitset.bpl](../lib/bitset.bpl)
- [std/bufio.bpl](../lib/bufio.bpl)
- [std/c.bpl](../lib/c.bpl)
- [std/c_runtime.bpl](../lib/c_runtime.bpl)
- [std/char_utils.bpl](../lib/char_utils.bpl)
- [std/complex.bpl](../lib/complex.bpl)
- [std/compress.bpl](../lib/compress.bpl)
- [std/core_specs.bpl](../lib/core_specs.bpl)
- [std/csv.bpl](../lib/csv.bpl)
- [std/date.bpl](../lib/date.bpl)
- [std/debug.bpl](../lib/debug.bpl)
- [std/deque.bpl](../lib/deque.bpl)
- [std/diagnostics.bpl](../lib/diagnostics.bpl)
- [std/entropy.bpl](../lib/entropy.bpl)
- [std/env.bpl](../lib/env.bpl)
- [std/errors.bpl](../lib/errors.bpl)
- [std/files.bpl](../lib/files.bpl)
- [std/fmt.bpl](../lib/fmt.bpl)
- [std/fs.bpl](../lib/fs.bpl)
- [std/graph.bpl](../lib/graph.bpl)
- [std/hash.bpl](../lib/hash.bpl)
- [std/hex.bpl](../lib/hex.bpl)
- [std/hmac.bpl](../lib/hmac.bpl)
- [std/ini.bpl](../lib/ini.bpl)
- [std/intrinsics.bpl](../lib/intrinsics.bpl)
- [std/io.bpl](../lib/io.bpl)
- [std/iter.bpl](../lib/iter.bpl)
- [std/iter_specs.bpl](../lib/iter_specs.bpl)
- [std/json.bpl](../lib/json.bpl)
- [std/linked_list.bpl](../lib/linked_list.bpl)
- [std/log.bpl](../lib/log.bpl)
- [std/lru_cache.bpl](../lib/lru_cache.bpl)
- [std/map.bpl](../lib/map.bpl)
- [std/math.bpl](../lib/math.bpl)
- [std/memory/allocator.bpl](../lib/memory/allocator.bpl)
- [std/memory/arena_allocator.bpl](../lib/memory/arena_allocator.bpl)
- [std/memory/page_allocator.bpl](../lib/memory/page_allocator.bpl)
- [std/memory/pool_allocator.bpl](../lib/memory/pool_allocator.bpl)
- [std/memory/stack_allocator.bpl](../lib/memory/stack_allocator.bpl)
- [std/memory/syscalls.bpl](../lib/memory/syscalls.bpl)
- [std/option.bpl](../lib/option.bpl)
- [std/otp.bpl](../lib/otp.bpl)
- [std/parse.bpl](../lib/parse.bpl)
- [std/path.bpl](../lib/path.bpl)
- [std/primitives.bpl](../lib/primitives.bpl)
- [std/priority_queue.bpl](../lib/priority_queue.bpl)
- [std/process.bpl](../lib/process.bpl)
- [std/queue.bpl](../lib/queue.bpl)
- [std/rand.bpl](../lib/rand.bpl)
- [std/range.bpl](../lib/range.bpl)
- [std/rational.bpl](../lib/rational.bpl)
- [std/reflection.bpl](../lib/reflection.bpl)
- [std/regex.bpl](../lib/regex.bpl)
- [std/result.bpl](../lib/result.bpl)
- [std/ring_buffer.bpl](../lib/ring_buffer.bpl)
- [std/scope_stack.bpl](../lib/scope_stack.bpl)
- [std/semver.bpl](../lib/semver.bpl)
- [std/set.bpl](../lib/set.bpl)
- [std/sha1.bpl](../lib/sha1.bpl)
- [std/sha256.bpl](../lib/sha256.bpl)
- [std/sha384.bpl](../lib/sha384.bpl)
- [std/sha512.bpl](../lib/sha512.bpl)
- [std/stack.bpl](../lib/stack.bpl)
- [std/stats.bpl](../lib/stats.bpl)
- [std/std.bpl](../lib/std.bpl)
- [std/string.bpl](../lib/string.bpl)
- [std/string_builder.bpl](../lib/string_builder.bpl)
- [std/string_utils.bpl](../lib/string_utils.bpl)
- [std/sync.bpl](../lib/sync.bpl)
- [std/table.bpl](../lib/table.bpl)
- [std/thread.bpl](../lib/thread.bpl)
- [std/time.bpl](../lib/time.bpl)
- [std/tree_map.bpl](../lib/tree_map.bpl)
- [std/trie.bpl](../lib/trie.bpl)
- [std/type.bpl](../lib/type.bpl)
- [std/union_find.bpl](../lib/union_find.bpl)
- [std/url.bpl](../lib/url.bpl)
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
frame _siftDownIntRange(arr: *Array<int>, low: int, high: int, root: int, ascending: bool)
frame _heapSortIntRange(arr: *Array<int>, low: int, high: int, ascending: bool)
frame _insertionSortIntRange(arr: *Array<int>, low: int, high: int)
frame quickSort(arr: *Array<int>)
frame _introSortInt(arr: *Array<int>, low: int, high: int, depthLimit: int)
frame _medianToHighInt(arr: *Array<int>, low: int, high: int)
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
frame _siftDownFloat(arr: *Array<float>, root: int, high: int)
frame range(start: int, end: int) ret Array<int>
frame rangeStep(start: int, end: int, step: int) ret Array<int>
frame copy(src: *Array<int>, dest: *Array<int>)
frame merge(a: *Array<int>, b: *Array<int>) ret Array<int>
frame equals(a: *Array<int>, b: *Array<int>) ret bool
```

## std/ansi.bpl

[Source](../lib/ansi.bpl)

Exports:

```bpl
export [Ansi];
```

### Ansi

```bpl
struct Ansi
frame reset() ret string
frame bold() ret string
frame dim() ret string
frame italic() ret string
frame underline() ret string
frame blink() ret string
frame inverse() ret string
frame strikethrough() ret string
frame black() ret string
frame red() ret string
frame green() ret string
frame yellow() ret string
frame blue() ret string
frame magenta() ret string
frame cyan() ret string
frame white() ret string
frame gray() ret string
frame brightRed() ret string
frame brightGreen() ret string
frame brightYellow() ret string
frame brightBlue() ret string
frame brightMagenta() ret string
frame brightCyan() ret string
frame brightWhite() ret string
frame bgBlack() ret string
frame bgRed() ret string
frame bgGreen() ret string
frame bgYellow() ret string
frame bgBlue() ret string
frame bgMagenta() ret string
frame bgCyan() ret string
frame bgWhite() ret string
frame clearScreen() ret string
frame clearLine() ret string
frame hideCursor() ret string
frame showCursor() ret string
frame color256(index: int) ret String
frame background256(index: int) ret String
frame rgb(red: int, green: int, blue: int) ret String
frame backgroundRgb(red: int, green: int, blue: int) ret String
frame moveTo(row: int, column: int) ret String
frame paint(text: string, style: string) ret String
frame paintIf(text: string, style: string, enabled: bool) ret String
frame enabled() ret bool
frame strip(text: string) ret String
frame visibleWidth(text: string) ret int
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
errorCount: int
exitCode: int
frame new() ret *ParsedArgs
frame setFlag(this: *ParsedArgs, key: String, value: String)
frame getFlag(this: *ParsedArgs, name: string) ret Option<*String>
frame flagInt(this: *ParsedArgs, name: string, output: *int) ret bool
frame flagLong(this: *ParsedArgs, name: string, output: *long) ret bool
frame flagFloat(this: *ParsedArgs, name: string, output: *float) ret bool
frame hasFlag(this: *ParsedArgs, name: string) ret bool
frame getArg(this: *ParsedArgs, index: int) ret Option<*String>
frame destroy(this: *ParsedArgs)
```

### ArgParser

```bpl
struct ArgParser
root: *Command
frame new(rootCmd: *Command) ret ArgParser
frame applyDefaults(command: *Command, parsed: *ParsedArgs)
frame validateArguments(command: *Command, parsed: *ParsedArgs, start: int)
frame reportError(format: string, argument: string)
frame namesFlag(argStr: string, name: string) ret bool
frame matchFlag(this: *ArgParser, currentCmd: *Command, argStr: string) ret Option<*Flag>
frame isNegativeNumber(text: string) ret bool
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
frame insert(this: *Array<T>, index: int, value: T)
frame clear(this: *Array<T>)
frame isEmpty(this: *Array<T>) ret bool
frame removeAt(this: *Array<T>, index: int)
frame map<U>(this: *Array<T>, transform: Lambda<U>(T, int)) ret Array<U>
frame filter(this: *Array<T>, predicate: Lambda<bool>(T, int)) ret Array<T>
frame sortBy(this: *Array<T>, compare: Lambda<int>(T, T))
frame reduce<U>(this: *Array<T>, initial: U, reducer: Lambda<U>(U, T, int)) ret U
frame forEach(this: *Array<T>, action: Lambda<void>(T, int))
frame find(this: *Array<T>, predicate: Lambda<bool>(T)) ret Option<T>
frame every(this: *Array<T>, predicate: Lambda<bool>(T)) ret bool
frame some(this: *Array<T>, predicate: Lambda<bool>(T)) ret bool
frame indexOf(this: *Array<T>, value: T) ret int
frame contains(this: *Array<T>, value: T) ret bool
frame findIndex(this: *Array<T>, predicate: Lambda<bool>(T)) ret Option<int>
frame __lshift__(this: *Array<T>, value: T) ret *Array<T>
frame __rshift__(this: *Array<T>, dest: *T) ret *Array<T>
frame reserve(this: *Array<T>, capacity: int)
frame extend(this: *Array<T>, other: *Array<T>)
frame first(this: *Array<T>) ret Option<T>
frame last(this: *Array<T>) ret Option<T>
frame reverse(this: *Array<T>)
frame swap(this: *Array<T>, a: int, b: int)
frame slice(this: *Array<T>, start: int, end: int) ret Array<T>
frame retain(this: *Array<T>, keep: Lambda<bool>(T)) ret int
frame dedup(this: *Array<T>) ret int
frame dedupBy(this: *Array<T>, same: Lambda<bool>(T, T)) ret int
frame swapRemove(this: *Array<T>, index: int) ret T
frame truncate(this: *Array<T>, length: int)
frame fill(this: *Array<T>, value: T)
frame rotateLeft(this: *Array<T>, count: int)
frame _reverseRange(data: *T, low: int, high: int)
frame lastIndexOf(this: *Array<T>, value: T) ret int
frame countWhere(this: *Array<T>, predicate: Lambda<bool>(T)) ret int
frame isSortedBy(this: *Array<T>, compare: Lambda<int>(T, T)) ret bool
frame binarySearchBy(this: *Array<T>, probe: Lambda<int>(T)) ret int
frame partitionPoint(this: *Array<T>, before: Lambda<bool>(T)) ret int
frame minBy(this: *Array<T>, compare: Lambda<int>(T, T)) ret Option<T>
frame maxBy(this: *Array<T>, compare: Lambda<int>(T, T)) ret Option<T>
frame shrinkToFit(this: *Array<T>)
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
frame isTrue(condition: bool, message: string)
frame isFalse(condition: bool, message: string)
frame fail(message: string)
frame equalLong(actual: long, expected: long, message: string)
frame equalInt(actual: int, expected: int, message: string)
frame equalString(actual: string, expected: string, message: string)
frame near(actual: double, expected: double, tolerance: double, message: string)
```

## std/base32.bpl

[Source](../lib/base32.bpl)

Exports:

```bpl
export [Base32];
```

### Base32

```bpl
struct Base32
frame encode(data: *u8, length: long) ret string
frame encodeString(text: string) ret string
frame value(c: u8) ret int
frame scan(input: string, output: *u8, write: bool) ret long
frame decode(input: string, output: *u8) ret long
frame decodeToString(input: string) ret string
frame decodedLength(input: string) ret long
frame isValid(input: string) ret bool
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
frame isWhitespace(c: u8) ret bool
frame scan(input: string, output: *u8, write: bool) ret int
frame decode(input: string, output: *u8) ret int
frame decodeToString(input: string) ret string
frame decodedLength(input: string) ret int
frame encodeUrl(data: *u8, length: int) ret string
frame encodeStringUrl(str: string) ret string
frame padded(input: string) ret string
frame decodeUrl(input: string, output: *u8) ret int
frame decodeUrlToString(input: string) ret string
frame encodedLength(inputLen: int) ret int
frame isValid(input: string) ret bool
```

## std/base85.bpl

[Source](../lib/base85.bpl)

Exports:

```bpl
export [Base85];
```

### Base85

```bpl
struct Base85
frame encode(data: *u8, length: int) ret string
frame encodeString(text: string) ret string
frame scan(input: string, output: *u8, write: bool) ret int
frame decode(input: string, output: *u8) ret int
frame decodedLength(input: string) ret int
frame decodeToString(input: string) ret string
frame encodeZ85(data: *u8, length: int) ret string
frame decodedLengthZ85(input: string) ret int
frame decodeZ85(input: string, output: *u8) ret int
```

## std/bigint.bpl

[Source](../lib/bigint.bpl)

Exports:

```bpl
export [BigInt];
```

### BigInt

```bpl
struct BigInt
sign: int
length: int
limbs: *uint
frame withCapacity(capacity: int) ret BigInt
frame fromLong(number: long) ret BigInt
frame parse(text: string) ret BigInt
frame normalize(this: *BigInt)
frame destroy(this: *BigInt)
frame clone(this: *BigInt) ret BigInt
frame isZero(this: *BigInt) ret bool
frame isNegative(this: *BigInt) ret bool
frame compareMagnitude(a: *BigInt, b: *BigInt) ret int
frame compare(this: *BigInt, other: *BigInt) ret int
frame equals(this: *BigInt, other: *BigInt) ret bool
frame addMagnitudes(a: *BigInt, b: *BigInt, sign: int) ret BigInt
frame subtractMagnitudes(a: *BigInt, b: *BigInt, sign: int) ret BigInt
frame addSigned(a: *BigInt, b: *BigInt, negateOther: bool) ret BigInt
frame add(this: *BigInt, other: *BigInt) ret BigInt
frame subtract(this: *BigInt, other: *BigInt) ret BigInt
frame negate(this: *BigInt) ret BigInt
frame multiply(this: *BigInt, other: *BigInt) ret BigInt
frame divideSmall(this: *BigInt, divisor: int, remainder: *int) ret BigInt
frame multiplyMagnitudeSmall(value: *BigInt, factor: ulong) ret BigInt
frame divide(this: *BigInt, divisor: *BigInt, remainder: *BigInt) ret BigInt
frame abs(this: *BigInt) ret BigInt
frame pow(this: *BigInt, exponent: int) ret BigInt
frame gcd(this: *BigInt, other: *BigInt) ret BigInt
frame toLong(this: *BigInt, out: *long) ret bool
frame toString(this: *BigInt) ret string
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

## std/bits.bpl

[Source](../lib/bits.bpl)

Exports:

```bpl
export [Bits];
```

### Bits

```bpl
struct Bits
frame popCount32(value: uint) ret int
frame popCount64(value: ulong) ret int
frame leadingZeros32(value: uint) ret int
frame leadingZeros64(value: ulong) ret int
frame trailingZeros32(value: uint) ret int
frame trailingZeros64(value: ulong) ret int
frame rotateLeft32(value: uint, count: int) ret uint
frame rotateRight32(value: uint, count: int) ret uint
frame rotateLeft64(value: ulong, count: int) ret ulong
frame rotateRight64(value: ulong, count: int) ret ulong
frame byteSwap32(value: uint) ret uint
frame byteSwap64(value: ulong) ret ulong
frame reverseBits32(value: uint) ret uint
frame reverseBits64(value: ulong) ret ulong
frame parity32(value: uint) ret int
frame parity64(value: ulong) ret int
frame isPowerOfTwo64(value: ulong) ret bool
frame nextPowerOfTwo64(value: ulong) ret ulong
frame highestBit32(value: uint) ret int
frame highestBit64(value: ulong) ret int
frame lowestBit32(value: uint) ret int
frame lowestBit64(value: ulong) ret int
frame isolateLowest64(value: ulong) ret ulong
frame mask64(width: int) ret ulong
frame extract64(value: ulong, offset: int, width: int) ret ulong
frame insert64(value: ulong, offset: int, width: int, field: ulong) ret ulong
frame testBit64(value: ulong, index: int) ret bool
frame setBit64(value: ulong, index: int) ret ulong
frame clearBit64(value: ulong, index: int) ret ulong
frame toggleBit64(value: ulong, index: int) ret ulong
frame signExtend64(value: ulong, width: int) ret long
frame interleave(x: uint, y: uint) ret ulong
frame _spread(value: uint) ret ulong
frame toGray64(value: ulong) ret ulong
frame fromGray64(gray: ulong) ret ulong
frame toBinary64(value: ulong, width: int) ret string
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

## std/bufio.bpl

[Source](../lib/bufio.bpl)

Exports:

```bpl
export [BufferedReader];
export [BufferedWriter];
```

### BufferedReader

```bpl
struct BufferedReader
fd: int
stream: *void
buffer: *u8
start: int
end: int
eof: bool
frame _make(fd: int, stream: *void) ret BufferedReader
frame fromFd(fd: int) ret BufferedReader
frame stdin() ret BufferedReader
frame open(path: string) ret BufferedReader
frame _fill(this: *BufferedReader) ret bool
frame readByte(this: *BufferedReader) ret int
frame peekByte(this: *BufferedReader) ret int
frame readUntil(this: *BufferedReader, delimiter: u8) ret Option<String>
frame readLine(this: *BufferedReader) ret Option<String>
frame readBytes(this: *BufferedReader, data: *u8, length: int) ret int
frame readAll(this: *BufferedReader) ret String
frame close(this: *BufferedReader)
```

### BufferedWriter

```bpl
struct BufferedWriter
fd: int
stream: *void
buffer: *u8
length: int
failed: bool
frame _make(fd: int, stream: *void) ret BufferedWriter
frame fromFd(fd: int) ret BufferedWriter
frame stdout() ret BufferedWriter
frame stderr() ret BufferedWriter
frame create(path: string) ret BufferedWriter
frame append(path: string) ret BufferedWriter
frame flush(this: *BufferedWriter) ret bool
frame writeBytes(this: *BufferedWriter, data: *u8, length: int) ret bool
frame write(this: *BufferedWriter, text: string) ret bool
frame writeLine(this: *BufferedWriter, text: string) ret bool
frame writeByte(this: *BufferedWriter, value: u8) ret bool
frame writeLong(this: *BufferedWriter, value: long) ret bool
frame close(this: *BufferedWriter) ret bool
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
extern strlen(s: string) ret long
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

## std/c_runtime.bpl

[Source](../lib/c_runtime.bpl)

Exports:

```bpl
export [__bpl_write];
```

```bpl
extern __bpl_write(fd: int, buf: *char, count: long) ret long
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
frame _divideProducts(a: float, b: float, c: float, d: float, denominator: float, divisorExponent: int) ret float
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

## std/compress.bpl

[Source](../lib/compress.bpl)

Exports:

```bpl
export [Deflate];
```

### Deflate

```bpl
struct Deflate
frame inflate(data: *u8, length: long) ret Array<u8>
frame deflate(data: *u8, length: long, level: int) ret Array<u8>
frame zlibCompress(data: *u8, length: long, level: int) ret Array<u8>
frame zlibDecompress(data: *u8, length: long) ret Array<u8>
frame gzipCompress(data: *u8, length: long, level: int) ret Array<u8>
frame gzipDecompress(data: *u8, length: long) ret Array<u8>
frame _gzipMember(data: *u8, length: long, start: long, out: *Array<u8>) ret long
frame gzipString(text: string, level: int) ret Array<u8>
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

## std/csv.bpl

[Source](../lib/csv.bpl)

Exports:

```bpl
export [Csv];
```

### Csv

```bpl
struct Csv
frame parse(text: string) ret Array<Array<String>>
frame parseWith(text: string, delimiter: char) ret Array<Array<String>>
frame _destroyRow(row: *Array<String>)
frame destroyRows(rows: *Array<Array<String>>)
frame needsQuoting(field: string, delimiter: char) ret bool
frame appendField(out: *StringBuilder, field: string, delimiter: char)
frame formatRow(fields: *Array<String>, delimiter: char) ret String
frame formatStrings(fields: *Array<string>, delimiter: char) ret String
frame format(rows: *Array<Array<String>>, delimiter: char) ret String
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
frame diffDaysLong(this: *Date, other: *Date) ret long
frame isValid(this: *Date) ret bool
frame tryParse(text: string, output: *Date) ret bool
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
frame addMonths(this: *DateTime, months: int) ret DateTime
frame addYears(this: *DateTime, years: int) ret DateTime
frame diffSeconds(this: *DateTime, other: *DateTime) ret long
frame format(this: *DateTime) ret string
frame tryParse(text: string, output: *DateTime) ret bool
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

## std/entropy.bpl

[Source](../lib/entropy.bpl)

Exports:

```bpl
export [Entropy];
```

### Entropy

```bpl
struct Entropy
frame fill(buffer: *u8, length: long) ret bool
frame bytes(buffer: *u8, length: long)
frame hexToken(byteCount: int) ret string
frame nextULong() ret ulong
frame below(bound: ulong) ret ulong
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
frame loadFile(path: string, overrideExisting: bool) ret int
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

## std/files.bpl

[Source](../lib/files.bpl)

Exports:

```bpl
export [Files];
```

### Files

```bpl
struct Files
frame isFile(path: string) ret bool
frame isDir(path: string) ret bool
frame isSymlink(path: string) ret bool
frame fileSize(path: string) ret long
frame readLines(path: string) ret Array<String>
frame writeLines(path: string, lines: *Array<String>) ret bool
frame touch(path: string) ret bool
frame walk(root: string) ret Array<String>
frame _walkInto(directory: string, out: *Array<String>)
frame _compare(a: string, b: string) ret int
frame walkFiles(root: string) ret Array<String>
frame removeAll(path: string) ret bool
frame copyTree(source: string, target: string) ret bool
frame tempFile(prefix: string) ret String
frame tempDir(prefix: string) ret String
frame cwd() ret String
frame chdir(path: string) ret bool
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
export [FileInfo];
```

### FileInfo

```bpl
struct FileInfo
size: long
isFile: bool
isDir: bool
isSymlink: bool
```

### File

```bpl
struct File
handle: *void
frame open(path: string, mode: string) ret File
frame close(this: *File) ret bool
frame write(this: *File, data: string) ret bool
frame writeBytes(this: *File, data: *u8, length: int) ret bool
frame readBytes(this: *File, data: *u8, length: int) ret int
frame readLine(this: *File, buf: string, max_len: int) ret bool
```

### FS

```bpl
struct FS
frame exists(path: string) ret bool
frame stat(path: string) ret FileInfo
frame lstat(path: string) ret FileInfo
frame writeFile(path: string, data: string) ret bool
frame writeBytes(path: string, data: *u8, length: int) ret bool
frame readBytes(path: string) ret Array<u8>
frame readFile(path: string) ret String
frame mkdir(path: string) ret bool
frame remove(path: string) ret bool
frame rename(fromPath: string, toPath: string) ret bool
frame appendFile(path: string, data: string) ret bool
frame copyFile(fromPath: string, toPath: string) ret bool
frame mkdirp(path: string) ret bool
frame listDir(path: string) ret Array<String>
frame listDirChecked(path: string) ret Array<String>
```

## std/graph.bpl

[Source](../lib/graph.bpl)

Exports:

```bpl
export [Graph];
export [GraphEdge];
export GRAPH_UNREACHABLE;
```

```bpl
global GRAPH_UNREACHABLE: long = 9223372036854775807
```

### GraphEdge

```bpl
struct GraphEdge
source: int
target: int
weight: long
next: int
```

### Graph

```bpl
struct Graph
vertexCount: int
directed: bool
head: Array<int>
edges: Array<GraphEdge>
frame new(vertexCount: int, directed: bool) ret Graph
frame directedGraph(vertexCount: int) ret Graph
frame undirectedGraph(vertexCount: int) ret Graph
frame destroy(this: *Graph)
frame _check(this: *Graph, vertex: int)
frame _link(this: *Graph, source: int, target: int, weight: long)
frame addVertex(this: *Graph) ret int
frame addEdge(this: *Graph, source: int, target: int, weight: long)
frame connect(this: *Graph, source: int, target: int)
frame len(this: *Graph) ret int
frame edgeCount(this: *Graph) ret int
frame hasEdge(this: *Graph, source: int, target: int) ret bool
frame neighbors(this: *Graph, vertex: int) ret Array<int>
frame outDegree(this: *Graph, vertex: int) ret int
frame bfs(this: *Graph, start: int) ret Array<int>
frame bfsDistances(this: *Graph, start: int) ret Array<int>
frame dfs(this: *Graph, start: int) ret Array<int>
frame dijkstraWith(this: *Graph, start: int, previous: *Array<int>) ret Array<long>
frame dijkstra(this: *Graph, start: int) ret Array<long>
frame shortestPath(this: *Graph, source: int, target: int) ret Array<int>
frame bellmanFord(this: *Graph, start: int) ret Option<Array<long>>
frame topologicalSort(this: *Graph) ret Option<Array<int>>
frame hasCycle(this: *Graph) ret bool
frame connectedComponents(this: *Graph, count: *int) ret Array<int>
frame stronglyConnectedComponents(this: *Graph, count: *int) ret Array<int>
frame minimumSpanningTree(this: *Graph, total: *long) ret Array<GraphEdge>
frame isBipartite(this: *Graph) ret bool
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
frame fnv1a64(input: string) ret ulong
frame crc32(data: *u8, length: long) ret uint
frame crc32Update(crc: uint, data: *u8, length: long) ret uint
frame crc32String(input: string) ret uint
frame adler32(data: *u8, length: long) ret uint
frame fnv1a32Bytes(data: *u8, length: long) ret uint
frame fnv1a64Bytes(data: *u8, length: long) ret ulong
frame djb2(input: string) ret uint
frame crc32c(data: *u8, length: long) ret uint
frame crc32cUpdate(crc: uint, data: *u8, length: long) ret uint
frame murmur3_32(data: *u8, length: long, seed: uint) ret uint
frame xxhash32(data: *u8, length: long, seed: uint) ret uint
frame xxhash64(data: *u8, length: long, seed: ulong) ret ulong
frame xxhash32String(input: string) ret uint
frame xxhash64String(input: string) ret ulong
frame siphash24(key0: ulong, key1: ulong, data: *u8, length: long) ret ulong
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
frame isWhitespace(c: u8) ret bool
frame scan(input: string, output: *u8, write: bool) ret int
frame decode(input: string, output: *u8) ret int
frame decodeToString(input: string) ret string
frame byteToHex(b: u8) ret string
frame u32ToHex(val: u32) ret string
frame u64ToHex(val: u64) ret string
frame isValid(input: string) ret bool
frame decodedLength(input: string) ret int
```

## std/hmac.bpl

[Source](../lib/hmac.bpl)

Exports:

```bpl
export [Hmac];
export [HmacSha512];
export [HmacSha1];
```

### Hmac

```bpl
struct Hmac
inner: Sha256
outerKey: u8[64]
frame sha256(key: *u8, keyLength: long) ret Hmac
frame update(this: *Hmac, data: *u8, length: long)
frame finish(this: *Hmac, mac: *u8)
frame digest(key: *u8, keyLength: long, data: *u8, length: long, mac: *u8)
frame hex(key: string, message: string) ret string
frame equal(a: *u8, b: *u8, length: long) ret bool
```

### HmacSha512

```bpl
struct HmacSha512
inner: Sha512
outerKey: u8[128]
frame new(key: *u8, keyLength: long) ret HmacSha512
frame update(this: *HmacSha512, data: *u8, length: long)
frame finish(this: *HmacSha512, mac: *u8)
frame digest(key: *u8, keyLength: long, data: *u8, length: long, mac: *u8)
frame hex(key: string, message: string) ret string
```

### HmacSha1

```bpl
struct HmacSha1
inner: Sha1
outerKey: u8[64]
frame new(key: *u8, keyLength: long) ret HmacSha1
frame update(this: *HmacSha1, data: *u8, length: long)
frame finish(this: *HmacSha1, mac: *u8)
frame digest(key: *u8, keyLength: long, data: *u8, length: long, mac: *u8)
```

## std/ini.bpl

[Source](../lib/ini.bpl)

Exports:

```bpl
export [Ini];
export [IniEntry];
```

### IniEntry

```bpl
struct IniEntry
section: String
key: String
value: String
```

### Ini

```bpl
struct Ini
entries: Array<IniEntry>
sectionOrder: Array<String>
frame new() ret Ini
frame parse(text: string) ret Ini
frame _noteSection(this: *Ini, section: string)
frame _find(this: *Ini, section: string, key: string) ret int
frame set(this: *Ini, section: string, key: string, value: string)
frame get(this: *Ini, section: string, key: string) ret Option<string>
frame getOr(this: *Ini, section: string, key: string, fallback: string) ret string
frame has(this: *Ini, section: string, key: string) ret bool
frame getInt(this: *Ini, section: string, key: string, fallback: long) ret long
frame getBool(this: *Ini, section: string, key: string, fallback: bool) ret bool
frame remove(this: *Ini, section: string, key: string) ret bool
frame sections(this: *Ini) ret Array<string>
frame keys(this: *Ini, section: string) ret Array<string>
frame len(this: *Ini) ret int
frame _appendSection(this: *Ini, out: *StringBuilder, section: string)
frame toText(this: *Ini) ret String
frame destroy(this: *Ini)
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
export [Peekable];
export [Enumerated];
export [Zipped];
export iterEnumerate;
export iterChunks;
export iterRange;
export iterRangeStep;
export iterRangeOf;
export iterCounter;
export iterChars;
export iterArray;
export sumInt;
export sumLong;
export sumFloat;
export minInt;
export maxInt;
```

### Enumerated

```bpl
struct Enumerated<T>
index: int
value: T
```

### Zipped

```bpl
struct Zipped<A, B>
first: A
second: B
```

### Iter

```bpl
struct Iter<T>
step: Lambda<Option<T>>()
arena: *_IterArena
frame fromFn(step: Lambda<Option<T>>()) ret Iter<T>
frame fromIterator<I: Iterator<T>>(source: I) ret Iter<T>
frame fromArray(array: *Array<T>) ret Iter<T>
frame fromPointer(data: *T, count: int) ret Iter<T>
frame empty() ret Iter<T>
frame once(value: T) ret Iter<T>
frame repeat(value: T) ret Iter<T>
frame repeatN(value: T, count: int) ret Iter<T>
frame successors(first: T, next: Lambda<Option<T>>(T)) ret Iter<T>
frame next(this: *Iter<T>) ret Option<T>
frame destroy(this: *Iter<T>)
frame map<U>(this: *Iter<T>, transform: Lambda<U>(T)) ret Iter<U>
frame filter(this: *Iter<T>, predicate: Lambda<bool>(T)) ret Iter<T>
frame filterMap<U>(this: *Iter<T>, transform: Lambda<Option<U>>(T)) ret Iter<U>
frame take(this: *Iter<T>, count: int) ret Iter<T>
frame skip(this: *Iter<T>, count: int) ret Iter<T>
frame takeWhile(this: *Iter<T>, predicate: Lambda<bool>(T)) ret Iter<T>
frame skipWhile(this: *Iter<T>, predicate: Lambda<bool>(T)) ret Iter<T>
frame stepBy(this: *Iter<T>, step: int) ret Iter<T>
frame zip<U>(this: *Iter<T>, other: Iter<U>) ret Iter<Zipped<T, U>>
frame chain(this: *Iter<T>, other: Iter<T>) ret Iter<T>
frame inspect(this: *Iter<T>, action: Lambda<void>(T)) ret Iter<T>
frame flatMap<U>(this: *Iter<T>, expand: Lambda<Iter<U>>(T)) ret Iter<U>
frame scan<S>(this: *Iter<T>, initial: S, combine: Lambda<S>(S, T)) ret Iter<S>
frame dedupBy(this: *Iter<T>, same: Lambda<bool>(T, T)) ret Iter<T>
frame fuse(this: *Iter<T>) ret Iter<T>
frame collect(this: *Iter<T>) ret Array<T>
frame collectInto(this: *Iter<T>, target: *Array<T>)
frame sortedBy(this: *Iter<T>, compare: Lambda<int>(T, T)) ret Array<T>
frame count(this: *Iter<T>) ret int
frame fold<U>(this: *Iter<T>, initial: U, combine: Lambda<U>(U, T)) ret U
frame reduce(this: *Iter<T>, combine: Lambda<T>(T, T)) ret Option<T>
frame forEach(this: *Iter<T>, action: Lambda<void>(T))
frame any(this: *Iter<T>, predicate: Lambda<bool>(T)) ret bool
frame all(this: *Iter<T>, predicate: Lambda<bool>(T)) ret bool
frame find(this: *Iter<T>, predicate: Lambda<bool>(T)) ret Option<T>
frame position(this: *Iter<T>, predicate: Lambda<bool>(T)) ret Option<int>
frame last(this: *Iter<T>) ret Option<T>
frame nth(this: *Iter<T>, index: int) ret Option<T>
frame minBy(this: *Iter<T>, compare: Lambda<int>(T, T)) ret Option<T>
frame maxBy(this: *Iter<T>, compare: Lambda<int>(T, T)) ret Option<T>
frame partition(this: *Iter<T>, predicate: Lambda<bool>(T)) ret (Array<T>, Array<T>)
frame advanceBy(this: *Iter<T>, count: int) ret int
frame peekable(this: *Iter<T>) ret Peekable<T>
```

### Peekable

```bpl
struct Peekable<T>
inner: Iter<T>
peeked: Option<T>
hasPeeked: bool
frame new(inner: Iter<T>) ret Peekable<T>
frame peek(this: *Peekable<T>) ret Option<T>
frame next(this: *Peekable<T>) ret Option<T>
frame nextIf(this: *Peekable<T>, predicate: Lambda<bool>(T)) ret Option<T>
frame destroy(this: *Peekable<T>)
```

```bpl
frame iterEnumerate<T>(source: Iter<T>) ret Iter<Enumerated<T>>
```

```bpl
frame iterChunks<T>(source: Iter<T>, size: int) ret Iter<Array<T>>
```

```bpl
frame iterRange(start: int, end: int) ret Iter<int>
```

```bpl
frame iterRangeStep(start: int, end: int, step: int) ret Iter<int>
```

```bpl
frame iterRangeOf(range: Range) ret Iter<int>
```

```bpl
frame iterCounter(start: int) ret Iter<int>
```

```bpl
frame iterChars(text: string) ret Iter<char>
```

```bpl
frame iterArray<T>(array: *Array<T>) ret Iter<T>
```

```bpl
frame sumInt(values: *Iter<int>) ret long
```

```bpl
frame sumLong(values: *Iter<long>) ret long
```

```bpl
frame sumFloat(values: *Iter<float>) ret float
```

```bpl
frame minInt(values: *Iter<int>) ret Option<int>
```

```bpl
frame maxInt(values: *Iter<int>) ret Option<int>
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
frame pretty(text: string, indent: int) ret string
frame minify(text: string) ret string
frame reformat(text: string, indent: int) ret string
frame layout(text: string, indent: int, output: string) ret long
frame put(output: string, used: long, c: char) ret long
frame newline(output: string, used: long, indent: int, depth: long) ret long
frame stringify<T>(obj: *T) ret String
frame serializeAny(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame serializeEnum(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame serializePrimitive(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame isDynamicArray(info: *TypeInfo) ret bool
frame serializeDynamicArray(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame serializeStruct(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame serializePointer(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame serializeArray(sb: *StringBuilder, ptr: ulong, info: *TypeInfo)
frame withinDepthLimit(s: string, len: long) ret bool
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
export [LogLevel];
```

### LogLevel

```bpl
enum LogLevel
Debug
Info
Warn
Error
Off
```

### Log

```bpl
struct Log
frame debug(msg: string)
frame info(msg: string)
frame warn(msg: string)
frame error(msg: string)
frame write(level: LogLevel, msg: string)
frame setLevel(level: LogLevel)
frame enabled(level: LogLevel) ret bool
frame setPrefix(enabled: bool)
frame setTimestamps(enabled: bool)
frame useStderr(enabled: bool)
frame levelFromEnv() ret bool
```

## std/lru_cache.bpl

[Source](../lib/lru_cache.bpl)

Exports:

```bpl
export [LruCache];
```

### LruCache

```bpl
struct LruCache<K, V>
index: Map<K, int>
keys: *K
values: *V
prev: *int
next: *int
head: int
tail: int
freeHead: int
count: int
cap: int
frame new(capacity: int) ret LruCache<K, V>
frame _reset(this: *LruCache<K, V>)
frame destroy(this: *LruCache<K, V>)
frame len(this: *LruCache<K, V>) ret int
frame capacity(this: *LruCache<K, V>) ret int
frame isEmpty(this: *LruCache<K, V>) ret bool
frame _unlink(this: *LruCache<K, V>, slot: int)
frame _pushFront(this: *LruCache<K, V>, slot: int)
frame _touch(this: *LruCache<K, V>, slot: int)
frame has(this: *LruCache<K, V>, key: K) ret bool
frame get(this: *LruCache<K, V>, key: K) ret Option<V>
frame peek(this: *LruCache<K, V>, key: K) ret Option<V>
frame putEvicting(this: *LruCache<K, V>, key: K, value: V, evictedKey: *K, evictedValue: *V) ret bool
frame put(this: *LruCache<K, V>, key: K, value: V) ret bool
frame remove(this: *LruCache<K, V>, key: K) ret bool
frame oldestKey(this: *LruCache<K, V>) ret Option<K>
frame keysByRecency(this: *LruCache<K, V>) ret Array<K>
frame clear(this: *LruCache<K, V>)
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
frame getOr(this: *Map<K, V>, key: K, fallback: V) ret V
frame keys(this: *Map<K, V>) ret Array<K>
frame values(this: *Map<K, V>) ret Array<V>
frame has(this: *Map<K, V>, key: K) ret bool
frame remove(this: *Map<K, V>, key: K) ret bool
frame iterator(this: *Map<K, V>) ret MapIterator<K, V>
frame size(this: *Map<K, V>) ret int
frame clear(this: *Map<K, V>)
frame __eq__(this: *Map<K, V>, other: *Map<K, V>) ret bool
frame __ne__(this: *Map<K, V>, other: *Map<K, V>) ret bool
frame destroy(this: *Map<K, V>)
frame getRef(this: *Map<K, V>, key: K) ret *V
frame getOrInsert(this: *Map<K, V>, key: K, value: V) ret *V
frame update(this: *Map<K, V>, key: K, initial: V, transform: Lambda<V>(V)) ret V
frame entries(this: *Map<K, V>) ret Array<Pair<K, V>>
frame forEach(this: *Map<K, V>, visit: Lambda<void>(K, V))
frame retain(this: *Map<K, V>, keep: Lambda<bool>(K, V)) ret int
frame merge(this: *Map<K, V>, other: *Map<K, V>)
frame isEmpty(this: *Map<K, V>) ret bool
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
frame isNan(x: float) ret bool
frame isInfinite(x: float) ret bool
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
frame gcd(a: int, b: int) ret long
frame lcm(a: int, b: int) ret long
frame factorial(n: int) ret long
frame fibonacci(n: int) ret long
frame isEven(x: int) ret bool
frame isOdd(x: int) ret bool
frame isFinite(x: float) ret bool
frame trunc(x: float) ret float
frame fract(x: float) ret float
frame fma(a: float, b: float, c: float) ret float
frame approxEqual(a: float, b: float, relTol: float, absTol: float) ret bool
frame cbrt(x: float) ret float
frame hypot(x: float, y: float) ret float
frame exp2(x: float) ret float
frame expm1(x: float) ret float
frame log1p(x: float) ret float
frame logBase(x: float, base: float) ret float
frame powInt(x: float, n: int) ret float
frame sinh(x: float) ret float
frame cosh(x: float) ret float
frame tanh(x: float) ret float
frame asinh(x: float) ret float
frame acosh(x: float) ret float
frame atanh(x: float) ret float
frame erf(x: float) ret float
frame erfc(x: float) ret float
frame lgamma(x: float) ret float
frame tgamma(x: float) ret float
frame smoothstep(edge0: float, edge1: float, x: float) ret float
frame inverseLerp(a: float, b: float, x: float) ret float
frame remap(x: float, inMin: float, inMax: float, outMin: float, outMax: float) ret float
frame wrapAngle(radians: float) ret float
frame gcdLong(a: long, b: long) ret long
frame lcmLong(a: long, b: long) ret long
frame _magnitude(value: long) ret ulong
frame mulMod(a: ulong, b: ulong, m: ulong) ret ulong
frame powMod(base: ulong, exponent: ulong, m: ulong) ret ulong
frame modInverse(a: long, m: long) ret long
frame isqrt(n: long) ret long
frame isPrime(n: long) ret bool
frame primesUpTo(limit: int) ret Array<int>
frame binomial(n: int, k: int) ret long
frame floorDiv(a: long, b: long) ret long
frame floorMod(a: long, b: long) ret long
frame clampLong(x: long, minVal: long, maxVal: long) ret long
frame checkedAdd(a: long, b: long) ret long
frame checkedMul(a: long, b: long) ret long
frame saturatingAdd(a: long, b: long) ret long
frame digitCount(n: long) ret int
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
frame expect(this: Option<T>, message: string) ret T
frame expectFailed(message: string) ret T
frame unwrapOrElse(this: Option<T>, fallback: Lambda<T>()) ret T
frame map<U>(this: Option<T>, transform: Lambda<U>(T)) ret Option<U>
frame andThen<U>(this: Option<T>, next: Lambda<Option<U>>(T)) ret Option<U>
frame unwrapOr(this: Option<T>, defaultValue: T) ret T
frame __eq__(this: *Option<T>, other: *Option<T>) ret bool
frame __ne__(this: *Option<T>, other: *Option<T>) ret bool
frame clone(this: *Option<T>) ret Option<T>
```

## std/otp.bpl

[Source](../lib/otp.bpl)

Exports:

```bpl
export [Otp];
```

### Otp

```bpl
struct Otp
frame hotp(key: *u8, keyLength: long, counter: long, digits: int) ret int
frame totpAt(key: *u8, keyLength: long, unixSeconds: long, stepSeconds: int, digits: int) ret int
frame totp(key: *u8, keyLength: long) ret int
```

## std/parse.bpl

[Source](../lib/parse.bpl)

Exports:

```bpl
export [Parse];
```

### Parse

```bpl
struct Parse
frame int(text: string, output: *int) ret bool
frame long(text: string, output: *long) ret bool
frame radix(text: string, base: int, output: *long) ret bool
frame float(text: string, output: *float) ret bool
frame bool(text: string, output: *bool) ret bool
frame startsFloat(c: char) ret bool
frame digitValue(c: char) ret int
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
frame stem(path: string) ret String
frame withExtension(path: string, extension: string) ret String
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
export run;
export runWith;
export [RunResult];
```

### ProcessResult

```bpl
struct ProcessResult
exitCode: int
output: String
```

### RunResult

```bpl
struct RunResult
exitCode: int
timedOut: bool
stdout: String
stderr: String
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

```bpl
frame run(args: ...string, count: int) ret RunResult
```

```bpl
frame runWith(input: string, timeoutMs: int, args: ...string, count: int) ret RunResult
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
export [SplitMix64];
export [Xoshiro256];
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
frame shuffle<T>(this: *Rand, arr: *Array<T>)
frame choice<T>(this: *Rand, arr: *Array<T>, output: *T) ret bool
frame fillBytes(this: *Rand, buf: *u8, len: int)
frame weightedChoice(this: *Rand, weights: *Array<int>) ret int
frame nextBelow(this: *Rand, bound: ulong) ret ulong
frame rangeLong(this: *Rand, min: long, max: long) ret long
frame nextUnit(this: *Rand) ret float
frame nextBernoulli(this: *Rand, p: float) ret bool
frame nextNormal(this: *Rand, mean: float, stddev: float) ret float
frame nextExponential(this: *Rand, lambda: float) ret float
frame nextPoisson(this: *Rand, mean: float) ret int
frame nextBinomial(this: *Rand, trials: int, p: float) ret int
frame sample<T>(this: *Rand, arr: *Array<T>, count: int) ret Array<T>
```

### SplitMix64

```bpl
struct SplitMix64
state: ulong
frame seed(seed: ulong) ret SplitMix64
frame next(this: *SplitMix64) ret ulong
```

### Xoshiro256

```bpl
struct Xoshiro256
s0: ulong
s1: ulong
s2: ulong
s3: ulong
frame seed(seed: ulong) ret Xoshiro256
frame _rotl(value: ulong, count: ulong) ret ulong
frame nextULong(this: *Xoshiro256) ret ulong
frame nextLong(this: *Xoshiro256) ret long
frame nextUInt(this: *Xoshiro256) ret uint
frame nextFloat(this: *Xoshiro256) ret float
frame nextBool(this: *Xoshiro256) ret bool
frame nextBelow(this: *Xoshiro256, bound: ulong) ret ulong
frame range(this: *Xoshiro256, min: int, max: int) ret int
frame jump(this: *Xoshiro256)
frame shuffle<T>(this: *Xoshiro256, arr: *Array<T>)
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
end: long
step: long
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
frame gcdWide(a: u64, b: u64) ret u64
frame magnitude(value: long) ret u64
frame addFractions(an: long, ad: long, bn: long, bd: long) ret Rational
frame combine(an: long, ad: long, bn: long, bd: long, subtract: bool) ret Rational
frame add(this: *Rational, other: Rational) ret Rational
frame sub(this: *Rational, other: Rational) ret Rational
frame multiplyFractions(an: long, ad: long, bn: long, bd: long, divide: bool) ret Rational
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
frame floorDiv(value: long, divisor: long) ret long
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
vtable: *void
```

## std/regex.bpl

[Source](../lib/regex.bpl)

Exports:

```bpl
export [Regex];
```

### Regex

```bpl
struct Regex
kinds: *int
args: *int
outs: *int
alternates: *int
count: int
capacity: int
classes: *u8
classCount: int
classCapacity: int
start: int
pattern: string
position: int
frame compile(pattern: string) ret Regex
frame destroy(this: *Regex)
frame addState(this: *Regex, kind: int, argument: int) ret int
frame parseAlternation(this: *Regex, end: *int) ret int
frame parseConcatenation(this: *Regex, end: *int) ret int
frame parseRepetition(this: *Regex, end: *int) ret int
frame parseCount(this: *Regex) ret int
frame parseCounted(this: *Regex, atomStart: int, end: *int) ret int
frame parseAtom(this: *Regex, end: *int) ret int
frame parseEscapedByte(this: *Regex) ret int
frame parseShorthand(this: *Regex, c: char) ret int
frame addShorthand(this: *Regex, index: int, kind: char)
frame parseClass(this: *Regex) ret int
frame newClass(this: *Regex) ret int
frame fillClass(this: *Regex, index: int, low: int, high: int)
frame clearByte(this: *Regex, index: int, b: int)
frame invertClass(this: *Regex, index: int)
frame classHas(this: *Regex, index: int, b: int) ret bool
frame addToSet(this: *Regex, set: *int, size: *int, marks: *int, generation: int, state: int, at: long, length: long)
frame longestMatchFrom(this: *Regex, text: string, length: long, begin: long) ret long
frame matches(this: *Regex, text: string) ret bool
frame find(this: *Regex, text: string, begin: long, matchStart: *long, matchEnd: *long) ret bool
frame contains(this: *Regex, text: string) ret bool
frame nextSearch(start: long, end: long) ret long
frame countMatches(this: *Regex, text: string) ret long
frame replaceAll(this: *Regex, text: string, replacement: string) ret string
frame replaceFirst(this: *Regex, text: string, replacement: string) ret string
frame split(this: *Regex, text: string) ret Array<string>
frame copyRange(text: string, start: long, end: long) ret string
frame replace(this: *Regex, text: string, replacement: string, limit: long) ret string
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
frame expect(this: Result<T, E>, message: string) ret T
frame expectFailed(message: string) ret T
frame map<U>(this: Result<T, E>, transform: Lambda<U>(T)) ret Result<U, E>
frame mapErr<F>(this: Result<T, E>, transform: Lambda<F>(E)) ret Result<T, F>
frame ok(this: Result<T, E>) ret Option<T>
frame unwrapOr(this: Result<T, E>, defaultValue: T) ret T
frame unwrapErr(this: Result<T, E>) ret E
frame __eq__(this: *Result<T, E>, other: *Result<T, E>) ret bool
frame __ne__(this: *Result<T, E>, other: *Result<T, E>) ret bool
frame clone(this: *Result<T, E>) ret Result<T, E>
```

## std/ring_buffer.bpl

[Source](../lib/ring_buffer.bpl)

Exports:

```bpl
export [RingBuffer];
export [RingBufferIterator];
```

### RingBufferIterator

```bpl
struct RingBufferIterator<T>: Iterator<T>
buffer: *RingBuffer<T>
index: int
frame next(this: *RingBufferIterator<T>) ret Option<T>
```

### RingBuffer

```bpl
struct RingBuffer<T>
data: *T
cap: int
head: int
length: int
frame new(capacity: int) ret RingBuffer<T>
frame destroy(this: *RingBuffer<T>)
frame len(this: *RingBuffer<T>) ret int
frame capacity(this: *RingBuffer<T>) ret int
frame isEmpty(this: *RingBuffer<T>) ret bool
frame isFull(this: *RingBuffer<T>) ret bool
frame _slot(this: *RingBuffer<T>, index: int) ret int
frame push(this: *RingBuffer<T>, value: T) ret bool
frame pushOverwrite(this: *RingBuffer<T>, value: T) ret Option<T>
frame pushFront(this: *RingBuffer<T>, value: T) ret bool
frame pop(this: *RingBuffer<T>) ret Option<T>
frame popBack(this: *RingBuffer<T>) ret Option<T>
frame front(this: *RingBuffer<T>) ret Option<T>
frame back(this: *RingBuffer<T>) ret Option<T>
frame get(this: *RingBuffer<T>, index: int) ret T
frame set(this: *RingBuffer<T>, index: int, value: T)
frame clear(this: *RingBuffer<T>)
frame toArray(this: *RingBuffer<T>) ret Array<T>
frame iterator(this: *RingBuffer<T>) ret RingBufferIterator<T>
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

## std/semver.bpl

[Source](../lib/semver.bpl)

Exports:

```bpl
export [SemVer];
```

### SemVer

```bpl
struct SemVer
major: long
minor: long
patch: long
prerelease: String
build: String
frame new(major: long, minor: long, patch: long) ret SemVer
frame parse(text: string) ret Option<SemVer>
frame isValid(text: string) ret bool
frame destroy(this: *SemVer)
frame isPrerelease(this: *SemVer) ret bool
frame compare(this: *SemVer, other: *SemVer) ret int
frame compareStrings(a: string, b: string) ret int
frame toString(this: *SemVer) ret String
frame bumpMajor(this: *SemVer) ret SemVer
frame bumpMinor(this: *SemVer) ret SemVer
frame bumpPatch(this: *SemVer) ret SemVer
frame satisfies(this: *SemVer, range: string) ret bool
frame satisfiesString(version: string, range: string) ret bool
frame _satisfiesSet(this: *SemVer, range: string, start: long, end: long) ret bool
frame _partial(range: string, start: long, end: long, parts: *long, prerelease: *String) ret int
frame _compareParts(this: *SemVer, major: long, minor: long, patch: long, prerelease: string) ret int
frame _sameTuple(this: *SemVer, parts: *long) ret bool
frame _compareToken(this: *SemVer, range: string, start: long, end: long, operator: string, allowsPrerelease: *bool) ret bool
frame _evaluate(this: *SemVer, op: string, parts: *long, given: int, pre: string) ret bool
frame _hyphenHigh(this: *SemVer, range: string, start: long, end: long, allowsPrerelease: *bool) ret bool
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
frame isEmpty(this: *Set<T>) ret bool
frame isSubsetOf(this: *Set<T>, other: *Set<T>) ret bool
frame toArray(this: *Set<T>) ret Array<T>
frame union(this: *Set<T>, other: *Set<T>) ret Set<T>
frame difference(this: *Set<T>, other: *Set<T>) ret Set<T>
frame intersection(this: *Set<T>, other: *Set<T>) ret Set<T>
frame __or__(this: *Set<T>, other: Set<T>) ret Set<T>
frame __sub__(this: *Set<T>, other: Set<T>) ret Set<T>
frame __and__(this: *Set<T>, other: Set<T>) ret Set<T>
frame __eq__(this: *Set<T>, other: Set<T>) ret bool
frame __ne__(this: *Set<T>, other: Set<T>) ret bool
```

## std/sha1.bpl

[Source](../lib/sha1.bpl)

Exports:

```bpl
export [Sha1];
```

### Sha1

```bpl
struct Sha1
state: u32[5]
block: u8[64]
blockLength: int
totalLength: ulong
frame new() ret Sha1
frame init(this: *Sha1)
frame update(this: *Sha1, data: *u8, length: long)
frame finish(this: *Sha1, digest: *u8)
frame compress(this: *Sha1)
frame rotl(value: u32, bits: int) ret u32
frame digest(data: *u8, length: long, digest: *u8)
frame hexBytes(data: *u8, length: long) ret string
frame hex(text: string) ret string
```

## std/sha256.bpl

[Source](../lib/sha256.bpl)

Exports:

```bpl
export [Sha256];
```

### Sha256

```bpl
struct Sha256
state: u32[8]
block: u8[64]
blockLength: int
totalLength: ulong
frame new() ret Sha256
frame init(this: *Sha256)
frame update(this: *Sha256, data: *u8, length: long)
frame finish(this: *Sha256, digest: *u8)
frame compress(this: *Sha256)
frame rotr(value: u32, bits: int) ret u32
frame digest(data: *u8, length: long, digest: *u8)
frame hexBytes(data: *u8, length: long) ret string
frame hex(text: string) ret string
```

## std/sha384.bpl

[Source](../lib/sha384.bpl)

Exports:

```bpl
export [Sha384];
```

### Sha384

```bpl
struct Sha384
inner: Sha512
frame new() ret Sha384
frame init(this: *Sha384)
frame update(this: *Sha384, data: *u8, length: long)
frame finish(this: *Sha384, digest: *u8)
frame digest(data: *u8, length: long, digest: *u8)
frame hexBytes(data: *u8, length: long) ret string
frame hex(text: string) ret string
```

## std/sha512.bpl

[Source](../lib/sha512.bpl)

Exports:

```bpl
export [Sha512];
```

### Sha512

```bpl
struct Sha512
state: u64[8]
block: u8[128]
blockLength: int
totalLength: ulong
frame new() ret Sha512
frame init(this: *Sha512)
frame update(this: *Sha512, data: *u8, length: long)
frame finish(this: *Sha512, digest: *u8)
frame compress(this: *Sha512)
frame rotr(value: u64, bits: int) ret u64
frame storeWord(output: *u8, value: u64)
frame digest(data: *u8, length: long, digest: *u8)
frame hexBytes(data: *u8, length: long) ret string
frame hex(text: string) ret string
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
frame __lshift__(this: *Stack<T>, value: T) ret *Stack<T>
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
frame sortInPlace(data: *int, length: int)
frame siftDown(data: *int, root: int, count: int)
frame sortInPlace(data: *float, length: int)
frame siftDownFloat(data: *float, root: int, count: int)
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
export [LogLevel];
export exec;
export execStatus;
export execOutput;
export execShell;
export execSilent;
export sleep;
export [ProcessResult];
export [BitSet];
export [Base64];
export [Url];
export [Base32];
export [Parse];
export [Hex];
export [ByteReader];
export [ByteWriter];
export [Hash];
export [Sha1];
export [Sha256];
export [Sha512];
export [Sha384];
export [Regex];
export [BigInt];
export [Hmac];
export [HmacSha512];
export [HmacSha1];
export [Otp];
export [Entropy];
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
frame __lshift__(this: *String, other: String) ret *String
frame __lshift__(this: *String, other: string) ret *String
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
frame appendLong(this: *StringBuilder, value: long)
frame appendFloat(this: *StringBuilder, value: float)
frame appendFixed(this: *StringBuilder, value: float, decimals: int)
frame appendBool(this: *StringBuilder, value: bool)
frame toString(this: *StringBuilder) ret string
frame __lshift__(this: *StringBuilder, str: string) ret *StringBuilder
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
frame join(parts: *Array<string>, separator: string) ret string
frame trim(s: string) ret String
frame replaceChar(s: string, target: char, repl: char) ret String
frame findString(haystack: string, needle: string, start: int) ret int
frame replace(s: string, oldStr: string, newStr: string) ret String
frame contains(haystack: string, needle: string) ret bool
frame indexOf(haystack: string, needle: string) ret int
frame lastIndexOf(haystack: string, needle: string) ret int
frame countOccurrences(haystack: string, needle: string) ret int
frame compareIgnoreCase(a: string, b: string) ret int
frame equalsIgnoreCase(a: string, b: string) ret bool
frame isBlank(s: string) ret bool
frame trimWhitespace(s: string) ret String
frame trimStart(s: string) ret String
frame trimEnd(s: string) ret String
frame trimChars(s: string, chars: string) ret String
frame removePrefix(s: string, prefix: string) ret String
frame removeSuffix(s: string, suffix: string) ret String
frame splitBy(s: string, separator: string) ret Array<String>
frame splitWhitespace(s: string) ret Array<String>
frame splitLines(s: string) ret Array<String>
frame joinStrings(parts: *Array<String>, separator: string) ret String
frame destroyAll(parts: *Array<String>)
frame toLowerAscii(s: string) ret String
frame toUpperAscii(s: string) ret String
frame capitalize(s: string) ret String
frame toTitleCase(s: string) ret String
frame _words(s: string, separator: char, camel: bool, pascal: bool) ret String
frame toSnakeCase(s: string) ret String
frame toKebabCase(s: string) ret String
frame toCamelCase(s: string) ret String
frame toPascalCase(s: string) ret String
frame padCenter(s: string, width: int, fill: char) ret String
frame repeat(s: string, count: int) ret String
frame truncate(s: string, width: int, ellipsis: string) ret String
frame wordWrap(s: string, width: int) ret String
frame editDistance(a: string, b: string) ret int
frame commonPrefixLength(a: string, b: string) ret int
frame escape(s: string) ret String
frame unescape(s: string) ret String
```

## std/sync.bpl

[Source](../lib/sync.bpl)

Exports:

```bpl
export [AtomicInt];
export [AtomicLong];
export [AtomicBool];
export [SpinLock];
export [Mutex];
export [RwLock];
export [Condvar];
export [Once];
export [Semaphore];
export [WaitGroup];
export [Barrier];
export [Channel];
export fence;
```

```bpl
frame fence()
```

### AtomicInt

```bpl
struct AtomicInt
value: int
frame new(initial: int) ret AtomicInt
frame load(this: *AtomicInt) ret int
frame store(this: *AtomicInt, value: int)
frame swap(this: *AtomicInt, value: int) ret int
frame fetchAdd(this: *AtomicInt, delta: int) ret int
frame fetchSub(this: *AtomicInt, delta: int) ret int
frame fetchAnd(this: *AtomicInt, mask: int) ret int
frame fetchOr(this: *AtomicInt, mask: int) ret int
frame fetchXor(this: *AtomicInt, mask: int) ret int
frame fetchMax(this: *AtomicInt, value: int) ret int
frame fetchMin(this: *AtomicInt, value: int) ret int
frame compareExchange(this: *AtomicInt, expected: int, desired: int) ret int
frame compareAndSet(this: *AtomicInt, expected: int, desired: int) ret bool
frame increment(this: *AtomicInt) ret int
frame decrement(this: *AtomicInt) ret int
frame update(this: *AtomicInt, transform: Lambda<int>(int)) ret int
```

### AtomicLong

```bpl
struct AtomicLong
value: long
frame new(initial: long) ret AtomicLong
frame load(this: *AtomicLong) ret long
frame store(this: *AtomicLong, value: long)
frame swap(this: *AtomicLong, value: long) ret long
frame fetchAdd(this: *AtomicLong, delta: long) ret long
frame fetchSub(this: *AtomicLong, delta: long) ret long
frame fetchAnd(this: *AtomicLong, mask: long) ret long
frame fetchOr(this: *AtomicLong, mask: long) ret long
frame fetchXor(this: *AtomicLong, mask: long) ret long
frame compareExchange(this: *AtomicLong, expected: long, desired: long) ret long
frame compareAndSet(this: *AtomicLong, expected: long, desired: long) ret bool
frame increment(this: *AtomicLong) ret long
frame decrement(this: *AtomicLong) ret long
```

### AtomicBool

```bpl
struct AtomicBool
cell: AtomicInt
frame new(initial: bool) ret AtomicBool
frame load(this: *AtomicBool) ret bool
frame store(this: *AtomicBool, value: bool)
frame swap(this: *AtomicBool, value: bool) ret bool
frame compareAndSet(this: *AtomicBool, expected: bool, desired: bool) ret bool
```

### SpinLock

```bpl
struct SpinLock
state: AtomicInt
frame new() ret SpinLock
frame lock(this: *SpinLock)
frame tryLock(this: *SpinLock) ret bool
frame unlock(this: *SpinLock)
```

### Mutex

```bpl
struct Mutex
handle: *void
frame new() ret Mutex
frame lock(this: *Mutex)
frame tryLock(this: *Mutex) ret bool
frame unlock(this: *Mutex)
frame withLock(this: *Mutex, action: Lambda<void>())
frame destroy(this: *Mutex)
```

### RwLock

```bpl
struct RwLock
handle: *void
frame new() ret RwLock
frame readLock(this: *RwLock)
frame tryReadLock(this: *RwLock) ret bool
frame writeLock(this: *RwLock)
frame tryWriteLock(this: *RwLock) ret bool
frame unlock(this: *RwLock)
frame destroy(this: *RwLock)
```

### Condvar

```bpl
struct Condvar
handle: *void
frame new() ret Condvar
frame wait(this: *Condvar, mutex: *Mutex)
frame waitUntil(this: *Condvar, mutex: *Mutex, ready: Lambda<bool>())
frame notifyOne(this: *Condvar)
frame notifyAll(this: *Condvar)
frame destroy(this: *Condvar)
```

### Once

```bpl
struct Once
state: AtomicInt
frame new() ret Once
frame call(this: *Once, init: Lambda<void>())
frame isCompleted(this: *Once) ret bool
```

### Semaphore

```bpl
struct Semaphore
mutex: Mutex
condvar: Condvar
permits: *int
frame new(permits: int) ret Semaphore
frame acquire(this: *Semaphore)
frame tryAcquire(this: *Semaphore) ret bool
frame release(this: *Semaphore)
frame available(this: *Semaphore) ret int
frame destroy(this: *Semaphore)
```

### WaitGroup

```bpl
struct WaitGroup
mutex: Mutex
condvar: Condvar
count: *int
frame new() ret WaitGroup
frame add(this: *WaitGroup, delta: int)
frame done(this: *WaitGroup)
frame wait(this: *WaitGroup)
frame destroy(this: *WaitGroup)
```

### Barrier

```bpl
struct Barrier
mutex: Mutex
condvar: Condvar
state: *_BarrierState
frame new(parties: int) ret Barrier
frame wait(this: *Barrier) ret bool
frame destroy(this: *Barrier)
```

### Channel

```bpl
struct Channel<T>
mutex: Mutex
notEmpty: Condvar
notFull: Condvar
state: *_ChannelState<T>
frame new(capacity: int) ret Channel<T>
frame send(this: *Channel<T>, value: T) ret bool
frame trySend(this: *Channel<T>, value: T) ret bool
frame recv(this: *Channel<T>) ret Option<T>
frame tryRecv(this: *Channel<T>) ret Option<T>
frame close(this: *Channel<T>)
frame isClosed(this: *Channel<T>) ret bool
frame len(this: *Channel<T>) ret int
frame capacity(this: *Channel<T>) ret int
frame _push(this: *Channel<T>, value: T)
frame _pop(this: *Channel<T>) ret T
frame destroy(this: *Channel<T>)
```

## std/table.bpl

[Source](../lib/table.bpl)

Exports:

```bpl
export [Table];
export TABLE_ALIGN_LEFT;
export TABLE_ALIGN_RIGHT;
export TABLE_ALIGN_CENTER;
```

```bpl
global TABLE_ALIGN_LEFT: int = 0
```

```bpl
global TABLE_ALIGN_RIGHT: int = 1
```

```bpl
global TABLE_ALIGN_CENTER: int = 2
```

### Table

```bpl
struct Table
header: Array<String>
rows: Array<Array<String>>
alignments: Array<int>
padding: int
frame new() ret Table
frame setHeader(this: *Table, cells: *Array<string>)
frame addRow(this: *Table, cells: *Array<string>)
frame addStringRow(this: *Table, cells: *Array<String>)
frame setAlignment(this: *Table, column: int, alignment: int)
frame setPadding(this: *Table, padding: int)
frame rowCount(this: *Table) ret int
frame _columns(this: *Table) ret int
frame _widths(this: *Table, columns: int) ret Array<int>
frame _appendRepeated(out: *StringBuilder, text: string, count: int)
frame _rule(this: *Table, out: *StringBuilder, widths: *Array<int>, fill: string, left: string, join: string, right: string)
frame _row(this: *Table, out: *StringBuilder, cells: *Array<String>, widths: *Array<int>, style: *_TableStyle)
frame _render(this: *Table, style: _TableStyle) ret String
frame render(this: *Table) ret String
frame renderAscii(this: *Table) ret String
frame renderPlain(this: *Table) ret String
frame _destroyCells(cells: *Array<String>)
frame destroy(this: *Table)
```

## std/thread.bpl

[Source](../lib/thread.bpl)

Exports:

```bpl
export [Thread];
export [JoinHandle];
```

### Thread

```bpl
struct Thread
handle: ulong
state: *_ThreadState
finished: bool
frame spawn(body: Lambda<void>()) ret Thread
frame spawnFunc(body: Func<void>()) ret Thread
frame join(this: *Thread) ret bool
frame panicked(this: *Thread) ret bool
frame panicMessage(this: *Thread) ret string
frame detach(this: *Thread)
frame destroy(this: *Thread)
frame id(this: *Thread) ret ulong
frame currentId() ret ulong
frame sleepMs(ms: long)
frame sleepUs(us: long)
frame yieldNow()
frame hardwareConcurrency() ret int
```

### JoinHandle

```bpl
struct JoinHandle<T>
thread: Thread
slot: *_JoinSlot<T>
frame spawn(work: Lambda<T>()) ret JoinHandle<T>
frame join(this: *JoinHandle<T>) ret T
frame id(this: *JoinHandle<T>) ret ulong
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
frame format(this: *Duration) ret string
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
elapsedTime: long
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
frame nowSeconds() ret long
frame nowMs() ret long
frame nowUs() ret long
frame monotonicMs() ret long
frame monotonicUs() ret long
frame sleep(ms: long)
frame sleepUs(usec: long)
frame sleepSeconds(sec: long)
frame formatTimestamp(timestamp: long) ret string
frame measure(action: Lambda<void>()) ret long
```

## std/tree_map.bpl

[Source](../lib/tree_map.bpl)

Exports:

```bpl
export [TreeMap];
export compareInts;
export compareLongs;
export compareStrings;
```

```bpl
frame compareInts(a: int, b: int) ret int
```

```bpl
frame compareLongs(a: long, b: long) ret int
```

```bpl
frame compareStrings(a: string, b: string) ret int
```

### TreeMap

```bpl
struct TreeMap<K, V>
root: *_TreeNode<K, V>
count: int
compare: Lambda<int>(K, K)
frame new(compare: Lambda<int>(K, K)) ret TreeMap<K, V>
frame _cmp(this: *TreeMap<K, V>, a: K, b: K) ret int
frame _height(node: *_TreeNode<K, V>) ret int
frame _update(node: *_TreeNode<K, V>)
frame _rotateRight(node: *_TreeNode<K, V>) ret *_TreeNode<K, V>
frame _rotateLeft(node: *_TreeNode<K, V>) ret *_TreeNode<K, V>
frame _balance(node: *_TreeNode<K, V>) ret *_TreeNode<K, V>
frame _insert(this: *TreeMap<K, V>, node: *_TreeNode<K, V>, key: K, value: V, added: *bool) ret *_TreeNode<K, V>
frame put(this: *TreeMap<K, V>, key: K, value: V) ret bool
frame _find(this: *TreeMap<K, V>, key: K) ret *_TreeNode<K, V>
frame get(this: *TreeMap<K, V>, key: K) ret Option<V>
frame getOr(this: *TreeMap<K, V>, key: K, fallback: V) ret V
frame has(this: *TreeMap<K, V>, key: K) ret bool
frame _removeMin(node: *_TreeNode<K, V>, removed: **_TreeNode<K, V>) ret *_TreeNode<K, V>
frame _remove(this: *TreeMap<K, V>, node: *_TreeNode<K, V>, key: K, removed: *bool) ret *_TreeNode<K, V>
frame remove(this: *TreeMap<K, V>, key: K) ret bool
frame len(this: *TreeMap<K, V>) ret int
frame isEmpty(this: *TreeMap<K, V>) ret bool
frame height(this: *TreeMap<K, V>) ret int
frame minKey(this: *TreeMap<K, V>) ret Option<K>
frame maxKey(this: *TreeMap<K, V>) ret Option<K>
frame floorKey(this: *TreeMap<K, V>, key: K) ret Option<K>
frame ceilingKey(this: *TreeMap<K, V>, key: K) ret Option<K>
frame _collect(this: *TreeMap<K, V>, bounded: bool, low: K, high: K) ret Array<*_TreeNode<K, V>>
frame _visit(nodes: Array<*_TreeNode<K, V>>, visit: Lambda<void>(K, V))
frame forEach(this: *TreeMap<K, V>, visit: Lambda<void>(K, V))
frame forEachInRange(this: *TreeMap<K, V>, low: K, high: K, visit: Lambda<void>(K, V))
frame _keysOf(nodes: Array<*_TreeNode<K, V>>) ret Array<K>
frame keys(this: *TreeMap<K, V>) ret Array<K>
frame values(this: *TreeMap<K, V>) ret Array<V>
frame keysInRange(this: *TreeMap<K, V>, low: K, high: K) ret Array<K>
frame _freeAll(node: *_TreeNode<K, V>)
frame clear(this: *TreeMap<K, V>)
frame destroy(this: *TreeMap<K, V>)
```

## std/trie.bpl

[Source](../lib/trie.bpl)

Exports:

```bpl
export [Trie];
```

### Trie

```bpl
struct Trie<V>
root: *_TrieNode<V>
count: int
frame new() ret Trie<V>
frame _node(byte: u8) ret *_TrieNode<V>
frame _freeNode(node: *_TrieNode<V>)
frame destroy(this: *Trie<V>)
frame len(this: *Trie<V>) ret int
frame isEmpty(this: *Trie<V>) ret bool
frame _childOf(node: *_TrieNode<V>, byte: u8) ret *_TrieNode<V>
frame _walk(this: *Trie<V>, key: string) ret *_TrieNode<V>
frame insert(this: *Trie<V>, key: string, value: V) ret bool
frame get(this: *Trie<V>, key: string) ret Option<V>
frame has(this: *Trie<V>, key: string) ret bool
frame hasPrefix(this: *Trie<V>, prefix: string) ret bool
frame countPrefix(this: *Trie<V>, prefix: string) ret int
frame remove(this: *Trie<V>, key: string) ret bool
frame keysWithPrefix(this: *Trie<V>, prefix: string) ret Array<String>
frame longestPrefixOf(this: *Trie<V>, text: string) ret int
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

## std/union_find.bpl

[Source](../lib/union_find.bpl)

Exports:

```bpl
export [UnionFind];
```

### UnionFind

```bpl
struct UnionFind
parent: *int
sizes: *int
count: int
sets: int
frame new(count: int) ret UnionFind
frame destroy(this: *UnionFind)
frame _check(this: *UnionFind, element: int)
frame find(this: *UnionFind, element: int) ret int
frame union(this: *UnionFind, a: int, b: int) ret bool
frame connected(this: *UnionFind, a: int, b: int) ret bool
frame setSize(this: *UnionFind, element: int) ret int
frame setCount(this: *UnionFind) ret int
frame len(this: *UnionFind) ret int
```

## std/url.bpl

[Source](../lib/url.bpl)

Exports:

```bpl
export [Url];
```

### Url

```bpl
struct Url
frame encodeComponent(text: string) ret string
frame encodeForm(text: string) ret string
frame decode(text: string) ret string
frame decodeForm(text: string) ret string
frame isUnreserved(c: int) ret bool
frame hexValue(c: int) ret int
frame encode(text: string, spaceAsPlus: bool) ret string
frame decodeWith(text: string, plusAsSpace: bool) ret string
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
frame _decodeCodepoint(s: string, pos: int, length: long) ret u32
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
frame tryV4(output: *UUID) ret bool
frame v7() ret UUID
frame tryV7(output: *UUID) ret bool
frame timestampMs(this: *UUID) ret long
frame fromBytes(data: *u8) ret UUID
frame nil() ret UUID
frame toString(this: *UUID) ret string
frame fromString(str: string) ret UUID
frame tryFromString(str: string, output: *UUID) ret bool
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
