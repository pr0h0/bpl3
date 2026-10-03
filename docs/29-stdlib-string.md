# Standard Library: String Utilities

`String` owns a heap-allocated, NUL-terminated byte string. It requires explicit
cleanup; it is not garbage-collected and its `destroy` method is not marked
`@[auto_destroy]`. Use `defer { s.destroy(); }` or call `destroy()` yourself.

```bpl
import [String] from "std/string.bpl";
```

## Ownership and representation

`String.new(text)` copies a non-null C string. It throws
`"String.new input too large"` above 2,147,483,646 bytes, or
`"String.new allocation failed"` if allocation fails. `String.new(nullptr)` creates an empty value with no allocation. A failed
`assign(text)` leaves the previous contents intact. `clone()` copies its storage.
`toString()` and `cstr()` return borrowed pointers, valid only while the string
storage remains alive and unchanged. Do not free those borrowed pointers.
Assigning a `String` value copies its pointer and length; it does not clone its
storage. Destroying both shallow copies would free the same allocation twice.

`length` counts bytes. Embedded NUL bytes are not supported as string content.
Indexing, substring, reversal, and case conversion operate on bytes; case
conversion handles ASCII letters, not general Unicode case mappings. Use the
UTF-8 module when you need codepoint operations.

## Available methods

| Method                                                      | Behavior                                              |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| `String.new(text: string) ret String`                       | Allocate a copy of a C string                         |
| `String.fromInt(val: long) ret String`                      | Format an integer                                     |
| `String.fromAddress(addr: long) ret String`                 | Format an address                                     |
| `s.destroy()`                                               | Free owned storage                                    |
| `s.clone() ret String`                                      | Copy owned bytes                                      |
| `s.assign(text: string)`                                    | Copy and replace content, including self or a suffix          |
| `s.isEmpty() ret bool`                                      | Test length                                           |
| `s.toString() ret string`, `s.cstr() ret string`            | Borrow underlying bytes                               |
| `s.get(index: int) ret char`                                | Byte at index; zero when out of range                 |
| `s.substring(start: int, len: int) ret String`              | Copy up to `len` bytes, clamped to the end; second argument is a length |
| `s.includes(text: string) ret bool`                         | Substring containment                                 |
| `s.indexOf(text: string) ret int`                           | First match, or -1                                    |
| `s.lastIndexOf(text: string) ret int`                       | Last match, or -1                                     |
| `s.count(text: string) ret int`                             | Count non-overlapping matches; zero for an empty text |
| `s.startsWith(text: string) ret bool`                       | Prefix test                                           |
| `s.endsWith(text: string) ret bool`                         | Suffix test                                           |
| `s.trim()`, `s.trimLeft()`, `s.trimRight()`                 | Return newly allocated trimmed Strings                |
| `s.toUpper()`, `s.toLower()`                                | Return newly allocated ASCII case conversions         |
| `s.reverse() ret String`                                    | Reverse bytes                                         |
| `s.repeat(count: int) ret String`                           | Repeat bytes in a new allocation; throws when the result would not fit |
| `s.padLeft(width: int, pad: char) ret String`               | Pad to a byte width                                   |
| `s.padRight(width: int, pad: char) ret String`              | Pad to a byte width                                   |
| `s.replace(old: string, replacement: string) ret String`    | Replace the first match                               |
| `s.replaceAll(old: string, replacement: string) ret String` | Replace non-overlapping matches in the original input |
| `s.split(delimiter: char) ret Array<String>`                | Split on one byte; each element owns storage          |
| `s.isDigits()`, `s.isAlpha()`, `s.isAlphanumeric()`         | ASCII classification                                  |

An empty search text is contained in every string: `includes` is true,
`indexOf` is 0, `startsWith` and `endsWith` are true, and `lastIndexOf` is the
string's length. `count` is the exception and reports zero, because the number
of empty matches is not meaningful. A null search text is not an empty one:
every search rejects it, reporting false or -1.

`repeat` and `replaceAll` throw a string when the result would not fit in a
`String`, whose length is a signed `int`, or when the allocation fails.

`replaceAll` returns an owned result and leaves the original unchanged. Replacement
text is never searched again: replacing `"a"` with `"aa"` terminates. Matches are
non-overlapping and processed left to right. An empty or null search returns a
clone; a null replacement deletes matches. Results too large for String's length
or failed allocation throw a string error.

There are no `String.join`, `charAt`, `replaceFirst`, `fromFloat`, `fromBool`,
`toInt`, `toFloat`, or `toBool` methods in this implementation. The
[declaration reference](stdlib-reference.md) lists exact signatures and overloads.

## Splitting and cleanup example

```bpl
import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    local text: String = String.new("red,green,blue");
    local parts: Array<String> = text.split(',');
    loop (local i: int = 0; i < parts.len(); i = i + 1) {
        printf("%s\n", parts.getRef(i).toString());
        parts.getRef(i).destroy();
    }
    parts.destroy();
    text.destroy();
    return 0;
}
```

Destroying `Array<String>` only frees array storage, so destroy each element
first. An empty input string produces an empty array. A trailing delimiter
produces a final empty string.

## Operators

`+` allocates a new concatenated String. `<<` appends to the receiver. Comparison
operators use string contents. Results of concatenation need cleanup, and
assignment of owning String values remains shallow. `assign` copies before
releasing the previous buffer, so assigning its own borrowed buffer or a suffix
is supported. Previously borrowed pointers become invalid after assignment.


## UTF-8 codepoints

Import `UTF8` from `std/utf8.bpl` to work with Unicode codepoints.
`decodeCodepoint(text, byteOffset)` reads one scalar value at a byte offset,
returning U+FFFD for malformed or truncated sequences, null input, and offsets
outside the string. `toCodepoints(text)` collects decoded values in an owned
`Array<u32>`; destroy that array when finished. Bulk decoding scans the byte
length once.

`encodeCodepoint(value, destination)` writes one to four bytes and returns the
number written. Provide a writable buffer of at least four bytes. It does not
append a NUL terminator. Surrogates (U+D800–U+DFFF) and values above U+10FFFF
encode as U+FFFD rather than producing invalid UTF-8.


## C-string search utilities

`StringUtils.findString(haystack, needle, start)` searches from a byte offset and
returns the first matching `int` index, or -1. Null inputs, negative offsets,
and offsets past the end return -1. An empty needle matches at any valid offset,
including the end. Only indices representable by the `int` return type are
searched.


`StringUtils.replace(text, oldText, newText)` uses the same non-overlapping
replacement rules as `String.replaceAll` and returns an owned `String`. Empty or
null search patterns return a copy; null replacement text deletes matches.
Temporary storage is released before returning, and the caller must destroy the
result.
