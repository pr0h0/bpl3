# Standard Library: Binary Data

`std/binary.bpl` provides `ByteReader` and `ByteWriter` for checked integer access
to byte buffers. Both are also exported from `std`.

```bpl
import [ByteReader], [ByteWriter] from "std/binary.bpl";

local bytes: u8[6];
local writer: ByteWriter = ByteWriter.new(&bytes[0], 6);
writer.writeU16BE(cast<u16>(0xcafe));
writer.writeU32LE(cast<u32>(123456));

local reader: ByteReader = ByteReader.new(&bytes[0], writer.position());
local magic: u16 = reader.readU16BE().unwrap();
local value: u32 = reader.readU32LE().unwrap();
```

## Buffer ownership

The cursors borrow memory: they do not allocate, free, or take ownership of the
buffer. The caller must provide a valid pointer covering at least `length` bytes
and keep it alive while the cursor is used. Writer buffers must be writable.
Null pointers and negative lengths create empty views. Copying a cursor copies
its position while sharing the underlying bytes. Treat its fields as internal;
use the methods to preserve bounds checks.

Unaligned buffers work, and results do not depend on the machine's byte order.
Operations process individual bytes, so they do not require aligned integer
pointers. Access is not synchronized between threads.

## Integer access

The reader returns `Option<u8>`, `Option<u16>`, `Option<u32>`, or `Option<u64>`:

- `readU8()`
- `readU16LE()`, `readU16BE()`
- `readU32LE()`, `readU32BE()`
- `readU64LE()`, `readU64BE()`

The corresponding writer methods accept the matching unsigned type and return
`bool`: `writeU8(value)`, `writeU16LE(value)`, `writeU16BE(value)`,
`writeU32LE(value)`, `writeU32BE(value)`, `writeU64LE(value)`, and `writeU64BE(value)`.

For unusual field sizes such as 24-bit or 48-bit integers, use:

- `readUnsigned(width: int, littleEndian: bool) ret Option<u64>`
- `writeUnsigned(value: u64, width: int, littleEndian: bool) ret bool`

Widths must be 1 through 8 bytes. `littleEndian = false` selects big-endian.
`writeUnsigned` rejects values that do not fit the width. Typed writer methods
receive already-converted values: cast truncation happens before the call, so
use `writeUnsigned` when a wider value needs a checked narrowing operation.

Successful reads/writes advance the cursor by their byte width. Invalid widths,
insufficient remaining space, or a value that does not fit return `None`/`false`
without advancing the cursor or partially modifying the output. Handle failure
before unwrapping when parsing untrusted or possibly truncated input.

## Cursor operations

Both types provide:

- `position() ret int`: current byte offset, initially zero.
- `remaining() ret int`: bytes available from that position.
- `seek(position: int) ret bool`: move to an absolute offset in `[0, length]`.
- `skip(count: int) ret bool`: advance by a nonnegative count within the buffer.

Failed seek/skip operations leave the cursor unchanged. Seeking to the end and
skipping zero bytes are valid. Writer seek/skip does not initialize skipped bytes;
only expose bytes you have initialized.

See the [binary packet example](../examples/stdlib_binary/main.bpl).
