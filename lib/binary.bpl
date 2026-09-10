# Checked, non-owning cursors over caller-provided byte buffers.
export [ByteReader];
export [ByteWriter];

import [Option] from "std/option.bpl";

struct ByteReader {
    data: *u8,
    length: int,
    offset: int,

    # The buffer must remain alive and cover length bytes while this cursor is used.
    frame new(data: *u8, length: int) ret ByteReader {
        if ((data == nullptr) || (length < 0)) {
            length = 0;
        }
        return ByteReader { data: data, length: length, offset: 0 };
    }

    frame position(this: *ByteReader) ret int {
        return this.offset;
    }

    frame remaining(this: *ByteReader) ret int {
        return this.length - this.offset;
    }

    frame seek(this: *ByteReader, position: int) ret bool {
        if ((position < 0) || (position > this.length)) {
            return false;
        }
        this.offset = position;
        return true;
    }

    frame skip(this: *ByteReader, count: int) ret bool {
        if ((count < 0) || (count > this.remaining())) {
            return false;
        }
        this.offset = this.offset + count;
        return true;
    }

    # Width is 1..8 bytes. Failure leaves the cursor unchanged.
    frame readUnsigned(this: *ByteReader, width: int, littleEndian: bool) ret Option<u64> {
        if ((width < 1) || (width > 8) || (width > this.remaining())) {
            return Option<u64>.None;
        }
        local value: u64 = cast<u64>(0);
        loop (local i: int = 0; i < width; i = i + 1) {
            local byte: u64 = cast<u64>(this.data[this.offset + i]);
            local shift: int = i * 8;
            if (!littleEndian) {
                shift = (width - 1 - i) * 8;
            }
            value = value | (byte << cast<u64>(shift));
        }
        this.offset = this.offset + width;
        return Option<u64>.Some(value);
    }

    frame readU8(this: *ByteReader) ret Option<u8> {
        local value: Option<u64> = this.readUnsigned(1, true);
        if (value.isNone()) {
            return Option<u8>.None;
        }
        return Option<u8>.Some(cast<u8>(value.unwrap()));
    }

    frame readU16LE(this: *ByteReader) ret Option<u16> {
        local value: Option<u64> = this.readUnsigned(2, true);
        if (value.isNone()) {
            return Option<u16>.None;
        }
        return Option<u16>.Some(cast<u16>(value.unwrap()));
    }

    frame readU16BE(this: *ByteReader) ret Option<u16> {
        local value: Option<u64> = this.readUnsigned(2, false);
        if (value.isNone()) {
            return Option<u16>.None;
        }
        return Option<u16>.Some(cast<u16>(value.unwrap()));
    }

    frame readU32LE(this: *ByteReader) ret Option<u32> {
        local value: Option<u64> = this.readUnsigned(4, true);
        if (value.isNone()) {
            return Option<u32>.None;
        }
        return Option<u32>.Some(cast<u32>(value.unwrap()));
    }

    frame readU32BE(this: *ByteReader) ret Option<u32> {
        local value: Option<u64> = this.readUnsigned(4, false);
        if (value.isNone()) {
            return Option<u32>.None;
        }
        return Option<u32>.Some(cast<u32>(value.unwrap()));
    }

    frame readU64LE(this: *ByteReader) ret Option<u64> {
        local value: Option<u64> = this.readUnsigned(8, true);
        if (value.isNone()) {
            return Option<u64>.None;
        }
        return Option<u64>.Some(cast<u64>(value.unwrap()));
    }

    frame readU64BE(this: *ByteReader) ret Option<u64> {
        local value: Option<u64> = this.readUnsigned(8, false);
        if (value.isNone()) {
            return Option<u64>.None;
        }
        return Option<u64>.Some(cast<u64>(value.unwrap()));
    }
}

struct ByteWriter {
    data: *u8,
    length: int,
    offset: int,

    # The buffer must remain alive and cover length bytes while this cursor is used.
    frame new(data: *u8, length: int) ret ByteWriter {
        if ((data == nullptr) || (length < 0)) {
            length = 0;
        }
        return ByteWriter { data: data, length: length, offset: 0 };
    }

    frame position(this: *ByteWriter) ret int {
        return this.offset;
    }

    frame remaining(this: *ByteWriter) ret int {
        return this.length - this.offset;
    }

    frame seek(this: *ByteWriter, position: int) ret bool {
        if ((position < 0) || (position > this.length)) {
            return false;
        }
        this.offset = position;
        return true;
    }

    frame skip(this: *ByteWriter, count: int) ret bool {
        if ((count < 0) || (count > this.remaining())) {
            return false;
        }
        this.offset = this.offset + count;
        return true;
    }

    # Reject overflow and insufficient space before touching the destination.
    frame writeUnsigned(this: *ByteWriter, value: u64, width: int, littleEndian: bool) ret bool {
        if ((width < 1) || (width > 8) || (width > this.remaining())) {
            return false;
        }
        if ((width < 8) && ((value >> cast<u64>(width * 8)) != cast<u64>(0))) {
            return false;
        }
        loop (local i: int = 0; i < width; i = i + 1) {
            local shift: int = i * 8;
            if (!littleEndian) {
                shift = (width - 1 - i) * 8;
            }
            this.data[this.offset + i] = cast<u8>(value >> cast<u64>(shift));
        }
        this.offset = this.offset + width;
        return true;
    }

    frame writeU8(this: *ByteWriter, value: u8) ret bool {
        return this.writeUnsigned(cast<u64>(value), 1, true);
    }

    frame writeU16LE(this: *ByteWriter, value: u16) ret bool {
        return this.writeUnsigned(cast<u64>(value), 2, true);
    }

    frame writeU16BE(this: *ByteWriter, value: u16) ret bool {
        return this.writeUnsigned(cast<u64>(value), 2, false);
    }

    frame writeU32LE(this: *ByteWriter, value: u32) ret bool {
        return this.writeUnsigned(cast<u64>(value), 4, true);
    }

    frame writeU32BE(this: *ByteWriter, value: u32) ret bool {
        return this.writeUnsigned(cast<u64>(value), 4, false);
    }

    frame writeU64LE(this: *ByteWriter, value: u64) ret bool {
        return this.writeUnsigned(cast<u64>(value), 8, true);
    }

    frame writeU64BE(this: *ByteWriter, value: u64) ret bool {
        return this.writeUnsigned(cast<u64>(value), 8, false);
    }
}
