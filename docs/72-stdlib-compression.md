# Compression

`std/compress.bpl` implements DEFLATE (RFC 1951) and its zlib (RFC 1950) and
gzip (RFC 1952) containers in BPL, with no C library dependency.

| Function                                    | Purpose                                                   |
| ------------------------------------------- | --------------------------------------------------------- |
| `Deflate.inflate(data, length)`             | Decompress a raw DEFLATE stream                           |
| `Deflate.deflate(data, length, level)`      | Compress to raw DEFLATE                                   |
| `Deflate.zlibCompress(data, length, level)` | zlib header, DEFLATE data and Adler-32 trailer            |
| `Deflate.zlibDecompress(data, length)`      | Verifies the header and Adler-32                          |
| `Deflate.gzipCompress(data, length, level)` | gzip member without a file name, modification time 0      |
| `Deflate.gzipDecompress(data, length)`      | Joins concatenated members; verifies each CRC-32 and size |
| `Deflate.gzipString(text, level)`           | gzip a null-terminated string                             |

All functions return a new `Array<u8>` that the caller destroys and throw a
string starting with `Deflate:`, `Zlib:` or `Gzip:` for malformed, truncated
or corrupted input. Preset zlib dictionaries are rejected.

The decoder handles stored, fixed-Huffman and dynamic-Huffman blocks, so it
reads data from zlib, gzip, Python, browsers and ZIP tools. The encoder uses
level 0 for stored blocks and levels 1-9 for greedy LZ77 matching with
progressively longer hash-chain searches, emitted as one fixed-Huffman block.
Its output is valid for every decoder but larger than zlib's, which builds
dynamic Huffman tables (roughly 30-40% larger on English text).

```bpl
import [Deflate] from "std/compress.bpl";
import [Array] from "std/array.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local packed: Array<u8> = Deflate.gzipString("hello hello hello hello", 6);
    local unpacked: Array<u8> = Deflate.gzipDecompress(packed.data, cast<long>(packed.length));
    printf("%d -> %d bytes\n", unpacked.length, packed.length);
    packed.destroy();
    unpacked.destroy();
    return 0;
}
```
