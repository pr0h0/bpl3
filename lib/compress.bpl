# DEFLATE compression (RFC 1951) with zlib (RFC 1950) and gzip (RFC 1952)
# containers, in pure BPL.
#
# Decompression supports stored, fixed-Huffman and dynamic-Huffman blocks,
# so it reads the output of zlib, gzip, Python, browsers and ZIP tools.
# Compression emits a single fixed-Huffman block found by greedy LZ77
# matching with hash chains (or stored blocks at level 0); it is valid
# DEFLATE that any decoder accepts, but compresses less than zlib's dynamic
# Huffman coding.
#
# Every function returns a new Array<u8> owned by the caller and throws a
# string beginning with "Deflate:", "Zlib:" or "Gzip:" on invalid input.
# Container decoders verify the Adler-32 / CRC-32 trailer.

export [Deflate];

import [Array] from "std/array.bpl";
import [Hash] from "std/hash.bpl";

extern strlen(text: string) ret long;

# Lengths 257..285: base length and extra bits.
global DEFLATE_LENGTH_BASE: int[29] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
global DEFLATE_LENGTH_EXTRA: int[29] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
# Distance codes 0..29: base distance and extra bits.
global DEFLATE_DIST_BASE: int[30] = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
global DEFLATE_DIST_EXTRA: int[30] = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
# Order of code length code lengths in a dynamic block header.
global DEFLATE_CODE_ORDER: int[19] = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

# Canonical Huffman decoding table (counts per length, symbols by code).
struct _Huffman {
    count: int[16],
    symbol: int[320],
}

struct _BitReader {
    data: *u8,
    length: long,
    position: long,
    buffer: uint,
    bits: int,
}

frame _inflateBits(reader: *_BitReader, need: int) ret int {
    loop (reader.bits < need) {
        if (reader.position >= reader.length) {
            throw "Deflate: unexpected end of input";
        }
        reader.buffer = reader.buffer | (cast<uint>(reader.data[reader.position]) << cast<uint>(reader.bits));
        reader.position = reader.position + 1;
        reader.bits = reader.bits + 8;
    }
    local value: uint = reader.buffer & ((cast<uint>(1) << cast<uint>(need)) - cast<uint>(1));
    reader.buffer = reader.buffer >> cast<uint>(need);
    reader.bits = reader.bits - need;
    return cast<int>(value);
}

# Builds a decoding table from code lengths; throws when over-subscribed.
frame _inflateBuild(table: *_Huffman, lengths: *int, count: int) {
    loop (local i: int = 0; i < 16; i = i + 1) {
        table.count[i] = 0;
    }
    loop (local i: int = 0; i < count; i = i + 1) {
        table.count[lengths[i]] = table.count[lengths[i]] + 1;
    }
    local left: int = 1;
    loop (local len: int = 1; len < 16; len = len + 1) {
        left = left * 2;
        left = left - table.count[len];
        if (left < 0) {
            throw "Deflate: over-subscribed Huffman code";
        }
    }
    local offsets: int[16];
    offsets[1] = 0;
    loop (local len: int = 1; len < 15; len = len + 1) {
        offsets[len + 1] = offsets[len] + table.count[len];
    }
    loop (local i: int = 0; i < count; i = i + 1) {
        if (lengths[i] != 0) {
            table.symbol[offsets[lengths[i]]] = i;
            offsets[lengths[i]] = offsets[lengths[i]] + 1;
        }
    }
}

frame _inflateDecode(reader: *_BitReader, table: *_Huffman) ret int {
    local code: int = 0;
    local first: int = 0;
    local index: int = 0;
    loop (local len: int = 1; len < 16; len = len + 1) {
        code = code | _inflateBits(reader, 1);
        local count: int = table.count[len];
        if ((code - count) < first) {
            return table.symbol[index + (code - first)];
        }
        index = index + count;
        first = first + count;
        first = first * 2;
        code = code * 2;
    }
    throw "Deflate: invalid Huffman code";
}

frame _inflateCodes(reader: *_BitReader, out: *Array<u8>, lengths: *_Huffman, distances: *_Huffman) {
    loop {
        local symbol: int = _inflateDecode(reader, lengths);
        if (symbol < 256) {
            out.push(cast<u8>(symbol));
            continue;
        }
        if (symbol == 256) {
            return;
        }
        symbol = symbol - 257;
        if (symbol >= 29) {
            throw "Deflate: invalid length symbol";
        }
        local length: int = DEFLATE_LENGTH_BASE[symbol] + _inflateBits(reader, DEFLATE_LENGTH_EXTRA[symbol]);
        local distSymbol: int = _inflateDecode(reader, distances);
        if (distSymbol >= 30) {
            throw "Deflate: invalid distance symbol";
        }
        local distance: int = DEFLATE_DIST_BASE[distSymbol] + _inflateBits(reader, DEFLATE_DIST_EXTRA[distSymbol]);
        if (distance > out.length) {
            throw "Deflate: distance too far back";
        }
        # Byte-by-byte copy: overlapping matches repeat recent output.
        local source: int = out.length - distance;
        loop (local k: int = 0; k < length; k = k + 1) {
            out.push(out.data[source + k]);
        }
    }
}

frame _inflateFixed(reader: *_BitReader, out: *Array<u8>) {
    local lengths: int[320];
    loop (local i: int = 0; i < 144; i = i + 1) {
        lengths[i] = 8;
    }
    loop (local i: int = 144; i < 256; i = i + 1) {
        lengths[i] = 9;
    }
    loop (local i: int = 256; i < 280; i = i + 1) {
        lengths[i] = 7;
    }
    loop (local i: int = 280; i < 288; i = i + 1) {
        lengths[i] = 8;
    }
    local litTable: _Huffman;
    _inflateBuild(&litTable, &lengths[0], 288);
    loop (local i: int = 0; i < 30; i = i + 1) {
        lengths[i] = 5;
    }
    local distTable: _Huffman;
    _inflateBuild(&distTable, &lengths[0], 30);
    _inflateCodes(reader, out, &litTable, &distTable);
}

frame _inflateDynamic(reader: *_BitReader, out: *Array<u8>) {
    local nlen: int = _inflateBits(reader, 5) + 257;
    local ndist: int = _inflateBits(reader, 5) + 1;
    local ncode: int = _inflateBits(reader, 4) + 4;
    if ((nlen > 286) || (ndist > 30)) {
        throw "Deflate: bad dynamic block counts";
    }
    local lengths: int[320];
    loop (local i: int = 0; i < 19; i = i + 1) {
        lengths[i] = 0;
    }
    loop (local i: int = 0; i < ncode; i = i + 1) {
        lengths[DEFLATE_CODE_ORDER[i]] = _inflateBits(reader, 3);
    }
    local codeTable: _Huffman;
    _inflateBuild(&codeTable, &lengths[0], 19);
    local index: int = 0;
    loop (index < (nlen + ndist)) {
        local symbol: int = _inflateDecode(reader, &codeTable);
        if (symbol < 16) {
            lengths[index] = symbol;
            index = index + 1;
            continue;
        }
        local repeat: int = 0;
        local value: int = 0;
        if (symbol == 16) {
            if (index == 0) {
                throw "Deflate: repeat with no previous length";
            }
            value = lengths[index - 1];
            repeat = 3 + _inflateBits(reader, 2);
        } else if (symbol == 17) {
            repeat = 3 + _inflateBits(reader, 3);
        } else {
            repeat = 11 + _inflateBits(reader, 7);
        }
        if ((index + repeat) > (nlen + ndist)) {
            throw "Deflate: too many code lengths";
        }
        loop (local k: int = 0; k < repeat; k = k + 1) {
            lengths[index] = value;
            index = index + 1;
        }
    }
    if (lengths[256] == 0) {
        throw "Deflate: missing end-of-block code";
    }
    local litTable: _Huffman;
    _inflateBuild(&litTable, &lengths[0], nlen);
    local distTable: _Huffman;
    _inflateBuild(&distTable, &lengths[nlen], ndist);
    _inflateCodes(reader, out, &litTable, &distTable);
}

# Inflates a raw DEFLATE stream into `out`; returns the bytes consumed.
frame _inflateInto(data: *u8, length: long, out: *Array<u8>) ret long {
    local reader: _BitReader = _BitReader { data: data, length: length, position: 0, buffer: 0, bits: 0 };
    loop {
        local last: int = _inflateBits(&reader, 1);
        local kind: int = _inflateBits(&reader, 2);
        if (kind == 0) {
            # Stored: skip to a byte boundary, then LEN and its complement.
            reader.buffer = 0;
            reader.bits = 0;
            if ((reader.position + 4) > reader.length) {
                throw "Deflate: unexpected end of input";
            }
            local len: int = cast<int>(data[reader.position]) | (cast<int>(data[reader.position + 1]) << 8);
            local nlen: int = cast<int>(data[reader.position + 2]) | (cast<int>(data[reader.position + 3]) << 8);
            if (len != ((~nlen) & 65535)) {
                throw "Deflate: stored block length mismatch";
            }
            reader.position = reader.position + 4;
            if ((reader.position + cast<long>(len)) > reader.length) {
                throw "Deflate: unexpected end of input";
            }
            loop (local k: int = 0; k < len; k = k + 1) {
                out.push(data[reader.position + cast<long>(k)]);
            }
            reader.position = reader.position + cast<long>(len);
        } else if (kind == 1) {
            _inflateFixed(&reader, out);
        } else if (kind == 2) {
            _inflateDynamic(&reader, out);
        } else {
            throw "Deflate: invalid block type";
        }
        if (last == 1) {
            return reader.position;
        }
    }
    return reader.position;
}

struct _BitWriter {
    out: *Array<u8>,
    buffer: uint,
    bits: int,
}

frame _deflatePut(writer: *_BitWriter, value: int, count: int) {
    writer.buffer = writer.buffer | (cast<uint>(value) << cast<uint>(writer.bits));
    writer.bits = writer.bits + count;
    loop (writer.bits >= 8) {
        writer.out.push(cast<u8>(writer.buffer & cast<uint>(255)));
        writer.buffer = writer.buffer >> cast<uint>(8);
        writer.bits = writer.bits - 8;
    }
}

frame _deflateFlush(writer: *_BitWriter) {
    if (writer.bits > 0) {
        writer.out.push(cast<u8>(writer.buffer & cast<uint>(255)));
    }
    writer.buffer = 0;
    writer.bits = 0;
}

# Huffman codes are sent most significant bit first.
frame _deflatePutCode(writer: *_BitWriter, code: int, count: int) {
    local reversed: int = 0;
    loop (local i: int = 0; i < count; i = i + 1) {
        reversed = (reversed << 1) | ((code >> i) & 1);
    }
    _deflatePut(writer, reversed, count);
}

frame _deflateLiteral(writer: *_BitWriter, symbol: int) {
    if (symbol < 144) {
        _deflatePutCode(writer, 48 + symbol, 8);
    } else if (symbol < 256) {
        _deflatePutCode(writer, 400 + (symbol - 144), 9);
    } else if (symbol < 280) {
        _deflatePutCode(writer, symbol - 256, 7);
    } else {
        _deflatePutCode(writer, 192 + (symbol - 280), 8);
    }
}

frame _deflateMatch(writer: *_BitWriter, length: int, distance: int) {
    local code: int = 28;
    loop ((code > 0) && (DEFLATE_LENGTH_BASE[code] > length)) {
        code = code - 1;
    }
    _deflateLiteral(writer, 257 + code);
    _deflatePut(writer, length - DEFLATE_LENGTH_BASE[code], DEFLATE_LENGTH_EXTRA[code]);
    local dcode: int = 29;
    loop ((dcode > 0) && (DEFLATE_DIST_BASE[dcode] > distance)) {
        dcode = dcode - 1;
    }
    _deflatePutCode(writer, dcode, 5);
    _deflatePut(writer, distance - DEFLATE_DIST_BASE[dcode], DEFLATE_DIST_EXTRA[dcode]);
}

frame _deflateStored(data: *u8, length: long, out: *Array<u8>) {
    local position: long = 0;
    loop {
        local chunk: long = length - position;
        if (chunk > cast<long>(65535)) {
            chunk = 65535;
        }
        local last: bool = (position + chunk) >= length;
        if (last) {
            out.push(cast<u8>(1));
        } else {
            out.push(cast<u8>(0));
        }
        local len: int = cast<int>(chunk);
        out.push(cast<u8>(len & 255));
        out.push(cast<u8>((len >> 8) & 255));
        out.push(cast<u8>((~len) & 255));
        out.push(cast<u8>(((~len) >> 8) & 255));
        loop (local k: long = 0; k < chunk; k = k + 1) {
            out.push(data[position + k]);
        }
        position = position + chunk;
        if (last) {
            return;
        }
    }
}

frame _deflateInto(data: *u8, length: long, level: int, out: *Array<u8>) {
    if (level <= 0) {
        _deflateStored(data, length, out);
        return;
    }
    local chainLimit: int = 4;
    if (level >= 9) {
        chainLimit = 1024;
    } else if (level >= 6) {
        chainLimit = 64;
    } else if (level >= 3) {
        chainLimit = 16;
    }
    local writer: _BitWriter = _BitWriter { out: out, buffer: 0, bits: 0 };
    _deflatePut(&writer, 1, 1);
    _deflatePut(&writer, 1, 2);
    # head: latest position per 15-bit hash; prev: older positions by window slot.
    local head: Array<int> = Array<int>.new(32768);
    local prev: Array<int> = Array<int>.new(32768);
    loop (local i: int = 0; i < 32768; i = i + 1) {
        head.push(-1);
        prev.push(-1);
    }
    local position: long = 0;
    loop (position < length) {
        local bestLength: int = 0;
        local bestDistance: int = 0;
        if ((position + 2) < length) {
            local hash: int = ((cast<int>(data[position]) << 10) ^ (cast<int>(data[position + 1]) << 5) ^ cast<int>(data[position + 2])) & 32767;
            local candidate: int = head.data[hash];
            local chain: int = 0;
            local maxLength: long = length - position;
            if (maxLength > cast<long>(258)) {
                maxLength = 258;
            }
            loop ((candidate >= 0) && (chain < chainLimit)) {
                local distance: long = position - cast<long>(candidate);
                if (distance > cast<long>(32768)) {
                    break;
                }
                local matched: int = 0;
                loop ((cast<long>(matched) < maxLength) && (data[cast<long>(candidate) + cast<long>(matched)] == data[position + cast<long>(matched)])) {
                    matched = matched + 1;
                }
                if (matched > bestLength) {
                    bestLength = matched;
                    bestDistance = cast<int>(distance);
                    if (cast<long>(matched) == maxLength) {
                        break;
                    }
                }
                local older: int = prev.data[candidate & 32767];
                if (older >= candidate) {
                    break;
                }
                candidate = older;
                chain = chain + 1;
            }
        }
        local advance: int = 1;
        if (bestLength >= 3) {
            _deflateMatch(&writer, bestLength, bestDistance);
            advance = bestLength;
        } else {
            _deflateLiteral(&writer, cast<int>(data[position]));
        }
        # Insert every passed position into the hash chains.
        loop (local k: int = 0; k < advance; k = k + 1) {
            local at: long = position + cast<long>(k);
            if ((at + 2) < length) {
                local h: int = ((cast<int>(data[at]) << 10) ^ (cast<int>(data[at + 1]) << 5) ^ cast<int>(data[at + 2])) & 32767;
                prev.data[cast<int>(at & cast<long>(32767))] = head.data[h];
                head.data[h] = cast<int>(at);
            }
        }
        position = position + cast<long>(advance);
    }
    _deflateLiteral(&writer, 256);
    _deflateFlush(&writer);
    head.destroy();
    prev.destroy();
}

frame _deflatePushU32BE(out: *Array<u8>, value: uint) {
    out.push(cast<u8>((value >> cast<uint>(24)) & cast<uint>(255)));
    out.push(cast<u8>((value >> cast<uint>(16)) & cast<uint>(255)));
    out.push(cast<u8>((value >> cast<uint>(8)) & cast<uint>(255)));
    out.push(cast<u8>(value & cast<uint>(255)));
}

frame _deflatePushU32LE(out: *Array<u8>, value: uint) {
    out.push(cast<u8>(value & cast<uint>(255)));
    out.push(cast<u8>((value >> cast<uint>(8)) & cast<uint>(255)));
    out.push(cast<u8>((value >> cast<uint>(16)) & cast<uint>(255)));
    out.push(cast<u8>((value >> cast<uint>(24)) & cast<uint>(255)));
}

frame _deflateReadU32LE(data: *u8) ret uint {
    return cast<uint>(data[0]) | (cast<uint>(data[1]) << cast<uint>(8)) | (cast<uint>(data[2]) << cast<uint>(16)) | (cast<uint>(data[3]) << cast<uint>(24));
}

# Initial output capacity: proportional to the input, capped at 1 MiB.
frame _deflateGuess(bytes: long) ret int {
    if (bytes > cast<long>(1048576)) {
        return 1048576;
    }
    return cast<int>(bytes) + 32;
}

struct Deflate {
    # Decompresses a raw DEFLATE stream.
    frame inflate(data: *u8, length: long) ret Array<u8> {
        local out: Array<u8> = Array<u8>.new(_deflateGuess(length * 3));
        try {
            _inflateInto(data, length, &out);
        } catch (message: string) {
            out.destroy();
            throw message;
        }
        return out;
    }

    # Compresses into a raw DEFLATE stream; `level` 0 stores, 1-9 trade
    # speed for longer match searches.
    frame deflate(data: *u8, length: long, level: int) ret Array<u8> {
        local out: Array<u8> = Array<u8>.new(_deflateGuess(length / 2));
        _deflateInto(data, length, level, &out);
        return out;
    }

    # zlib stream (RFC 1950): 2-byte header, DEFLATE data, Adler-32.
    frame zlibCompress(data: *u8, length: long, level: int) ret Array<u8> {
        local out: Array<u8> = Array<u8>.new(_deflateGuess(length / 2));
        out.push(cast<u8>(0x78));
        # FLG makes the header a multiple of 31 and records the level.
        if (level <= 1) {
            out.push(cast<u8>(0x01));
        } else if (level < 6) {
            out.push(cast<u8>(0x5E));
        } else if (level < 9) {
            out.push(cast<u8>(0x9C));
        } else {
            out.push(cast<u8>(0xDA));
        }
        _deflateInto(data, length, level, &out);
        _deflatePushU32BE(&out, Hash.adler32(data, length));
        return out;
    }

    frame zlibDecompress(data: *u8, length: long) ret Array<u8> {
        if (length < cast<long>(6)) {
            throw "Zlib: input too short";
        }
        local cmf: int = cast<int>(data[0]);
        local flg: int = cast<int>(data[1]);
        if (((cmf & 15) != 8) || ((((cmf * 256) + flg) % 31) != 0)) {
            throw "Zlib: invalid header";
        }
        if ((flg & 32) != 0) {
            throw "Zlib: preset dictionaries are not supported";
        }
        local out: Array<u8> = Array<u8>.new(_deflateGuess(length * 3));
        local consumed: long = 0;
        try {
            consumed = _inflateInto(data + 2, length - 2, &out);
        } catch (message: string) {
            out.destroy();
            throw message;
        }
        local trailer: long = 2 + consumed;
        if ((trailer + 4) > length) {
            out.destroy();
            throw "Zlib: missing Adler-32 trailer";
        }
        local expected: uint = (cast<uint>(data[trailer]) << cast<uint>(24)) | (cast<uint>(data[trailer + 1]) << cast<uint>(16)) | (cast<uint>(data[trailer + 2]) << cast<uint>(8)) | cast<uint>(data[trailer + 3]);
        if (expected != Hash.adler32(out.data, cast<long>(out.length))) {
            out.destroy();
            throw "Zlib: Adler-32 mismatch";
        }
        return out;
    }

    # gzip member (RFC 1952) with no file name and modification time 0.
    frame gzipCompress(data: *u8, length: long, level: int) ret Array<u8> {
        local out: Array<u8> = Array<u8>.new(_deflateGuess(length / 2));
        out.push(cast<u8>(0x1f));
        out.push(cast<u8>(0x8b));
        out.push(cast<u8>(8));
        out.push(cast<u8>(0));
        _deflatePushU32LE(&out, 0);
        if (level >= 9) {
            out.push(cast<u8>(2));
        } else if (level <= 1) {
            out.push(cast<u8>(4));
        } else {
            out.push(cast<u8>(0));
        }
        # OS: 255 (unknown).
        out.push(cast<u8>(255));
        _deflateInto(data, length, level, &out);
        _deflatePushU32LE(&out, Hash.crc32(data, length));
        _deflatePushU32LE(&out, cast<uint>(length & cast<long>(0xFFFFFFFF)));
        return out;
    }

    # Decompresses every gzip member in `data` (concatenated members are
    # joined, as gunzip does), verifying each CRC-32 and size.
    frame gzipDecompress(data: *u8, length: long) ret Array<u8> {
        local out: Array<u8> = Array<u8>.new(_deflateGuess(length * 3));
        local position: long = 0;
        local members: int = 0;
        loop ((position < length) && ((members == 0) || ((length - position) >= cast<long>(18)))) {
            try {
                position = Deflate._gzipMember(data, length, position, &out);
            } catch (message: string) {
                out.destroy();
                throw message;
            }
            members = members + 1;
        }
        return out;
    }

    frame _gzipMember(data: *u8, length: long, start: long, out: *Array<u8>) ret long {
        if ((length - start) < cast<long>(18)) {
            throw "Gzip: input too short";
        }
        if ((data[start] != cast<u8>(0x1f)) || (data[start + 1] != cast<u8>(0x8b)) || (data[start + 2] != cast<u8>(8))) {
            throw "Gzip: invalid header";
        }
        local flags: int = cast<int>(data[start + 3]);
        local position: long = start + 10;
        if ((flags & 4) != 0) {
            if ((position + 2) > length) {
                throw "Gzip: truncated extra field";
            }
            local extra: long = cast<long>(cast<int>(data[position]) | (cast<int>(data[position + 1]) << 8));
            position = position + 2 + extra;
        }
        # FNAME and FCOMMENT are zero-terminated.
        loop (local field: int = 8; field <= 16; field = field * 2) {
            if ((flags & field) != 0) {
                loop ((position < length) && (data[position] != cast<u8>(0))) {
                    position = position + 1;
                }
                position = position + 1;
            }
        }
        if ((flags & 2) != 0) {
            position = position + 2;
        }
        if (position >= length) {
            throw "Gzip: truncated header";
        }
        local before: int = out.length;
        local consumed: long = _inflateInto(data + position, length - position, out);
        position = position + consumed;
        if ((position + 8) > length) {
            throw "Gzip: missing trailer";
        }
        local produced: long = cast<long>(out.length - before);
        local crc: uint = _deflateReadU32LE(data + position);
        local size: uint = _deflateReadU32LE(data + position + 4);
        if (crc != Hash.crc32(out.data + before, produced)) {
            throw "Gzip: CRC-32 mismatch";
        }
        if (size != cast<uint>(produced & cast<long>(0xFFFFFFFF))) {
            throw "Gzip: size mismatch";
        }
        return position + 8;
    }

    # Convenience: gzip a null-terminated string.
    frame gzipString(text: string, level: int) ret Array<u8> {
        if (text == nullptr) {
            return Deflate.gzipCompress(cast<*u8>(""), 0, level);
        }
        return Deflate.gzipCompress(cast<*u8>(text), strlen(text), level);
    }
}
