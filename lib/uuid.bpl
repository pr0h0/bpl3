# UUID generation and parsing (v4 random UUIDs)

export [UUID];

import [Rand] from "std/rand.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(str: string) ret long;

struct UUID {
    bytes: u8[16],
    # Generate a new random UUID (v4)
    frame v4() ret UUID {
        local uuid: UUID;
        local rng: Rand = Rand.seedFromTime();

        # Fill with random bytes
        local i: int = 0;
        loop (i < 16) {
            uuid.bytes[i] = cast<u8>(rng.nextInt() & 255);
            i = i + 1;
        }

        # Set version to 4 (random)
        # Version is in bits 12-15 of time_hi_and_version (byte 6)
        uuid.bytes[6] = (uuid.bytes[6] & cast<u8>(0x0F)) | cast<u8>(0x40);

        # Set variant to RFC 4122 (10xx xxxx in byte 8)
        uuid.bytes[8] = (uuid.bytes[8] & cast<u8>(0x3F)) | cast<u8>(0x80);

        return uuid;
    }

    # Create a UUID from raw bytes
    frame fromBytes(data: *u8) ret UUID {
        local uuid: UUID;
        local i: int = 0;
        loop (i < 16) {
            uuid.bytes[i] = *(data + i);
            i = i + 1;
        }
        return uuid;
    }

    # Create a nil/zero UUID
    frame nil() ret UUID {
        local uuid: UUID;
        local i: int = 0;
        loop (i < 16) {
            uuid.bytes[i] = cast<u8>(0);
            i = i + 1;
        }
        return uuid;
    }

    # Convert UUID to string format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    # Returns a newly allocated string (caller must free)
    frame toString(this: *UUID) ret string {
        local output: *u8 = cast<*u8>(malloc(cast<long>(37)));
        local hexChars: string = "0123456789abcdef";
        local hexPtr: *u8 = cast<*u8>(hexChars);

        local outIdx: int = 0;
        local i: int = 0;

        loop (i < 16) {
            local b: u8 = this.bytes[i];
            local hi: int = cast<int>(b >> cast<u8>(4));
            local lo: int = cast<int>(b & cast<u8>(0x0F));

            *(output + outIdx) = *(hexPtr + hi);
            outIdx = outIdx + 1;
            *(output + outIdx) = *(hexPtr + lo);
            outIdx = outIdx + 1;

            # Add dashes at positions 4, 6, 8, 10 (after bytes 4, 6, 8, 10)
            if ((i == 3) || (i == 5) || (i == 7) || (i == 9)) {
                *(output + outIdx) = cast<u8>(45); # '-'
                outIdx = outIdx + 1;
            }
            i = i + 1;
        }

        *(output + 36) = cast<u8>(0);
        return cast<string>(output);
    }

    # Parse a UUID from string
    # Accepts formats: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx or xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    frame fromString(str: string) ret UUID {
        local uuid: UUID = UUID.nil();

        if (str == nullptr) {
            return uuid;
        }
        local ptr: *u8 = cast<*u8>(str);
        local len: int = cast<int>(strlen(str));

        local byteIdx: int = 0;
        local i: int = 0;

        loop ((i < len) && (byteIdx < 16)) {
            local c1: u8 = *(ptr + i);

            # Skip dashes
            if (c1 == cast<u8>(45)) {
                i = i + 1;
                continue;
            }
            # Need two hex chars
            if ((i + 1) >= len) {
                break;
            }
            local c2: u8 = *(ptr + i + 1);

            local hi: int = UUID.hexCharToValue(c1);
            local lo: int = UUID.hexCharToValue(c2);

            if ((hi < 0) || (lo < 0)) {
                return UUID.nil();
            }
            uuid.bytes[byteIdx] = cast<u8>((hi << 4) | lo);
            byteIdx = byteIdx + 1;
            i = i + 2;
        }

        return uuid;
    }

    # Helper: convert hex char to value
    frame hexCharToValue(c: u8) ret int {
        if ((c >= cast<u8>(48)) && (c <= cast<u8>(57))) {
            return cast<int>(c) - 48;
        }
        if ((c >= cast<u8>(65)) && (c <= cast<u8>(70))) {
            return (cast<int>(c) - 65) + 10;
        }
        if ((c >= cast<u8>(97)) && (c <= cast<u8>(102))) {
            return (cast<int>(c) - 97) + 10;
        }
        return -1;
    }

    # Check if this UUID is nil (all zeros)
    frame isNil(this: *UUID) ret bool {
        local i: int = 0;
        loop (i < 16) {
            if (this.bytes[i] != cast<u8>(0)) {
                return false;
            }
            i = i + 1;
        }
        return true;
    }

    # Get the version of this UUID (0-15, typically 4 for random)
    frame version(this: *UUID) ret int {
        return cast<int>((this.bytes[6] >> cast<u8>(4)) & cast<u8>(0x0F));
    }

    # Get the variant of this UUID
    # Returns 0 for NCS, 1 for RFC 4122, 2 for Microsoft, 3 for future
    frame variant(this: *UUID) ret int {
        local b: u8 = this.bytes[8];
        if ((b & cast<u8>(0x80)) == cast<u8>(0)) {
            return 0; # NCS
        }
        if ((b & cast<u8>(0xC0)) == cast<u8>(0x80)) {
            return 1; # RFC 4122
        }
        if ((b & cast<u8>(0xE0)) == cast<u8>(0xC0)) {
            return 2; # Microsoft
        }
        # Future
        return 3;
    }

    # Compare two UUIDs for equality
    frame equals(this: *UUID, other: *UUID) ret bool {
        local i: int = 0;
        loop (i < 16) {
            if (this.bytes[i] != other.bytes[i]) {
                return false;
            }
            i = i + 1;
        }
        return true;
    }

    # Compare two UUIDs (for sorting)
    # Returns -1 if this < other, 0 if equal, 1 if this > other
    frame compare(this: *UUID, other: *UUID) ret int {
        local i: int = 0;
        loop (i < 16) {
            if (this.bytes[i] < other.bytes[i]) {
                return -1;
            }
            if (this.bytes[i] > other.bytes[i]) {
                return 1;
            }
            i = i + 1;
        }
        return 0;
    }

    # Validate a UUID string
    frame isValid(str: string) ret bool {
        if (str == nullptr) {
            return false;
        }
        local ptr: *u8 = cast<*u8>(str);
        local len: int = cast<int>(strlen(str));

        # Check for standard format with dashes
        if (len == 36) {
            # Check dash positions
            if ((*(ptr + 8) != cast<u8>(45)) || (*(ptr + 13) != cast<u8>(45)) || (*(ptr + 18) != cast<u8>(45)) || (*(ptr + 23) != cast<u8>(45))) {
                return false;
            }
            # Check hex characters
            local i: int = 0;
            loop (i < 36) {
                if ((i == 8) || (i == 13) || (i == 18) || (i == 23)) {
                    i = i + 1;
                    continue;
                }
                if (UUID.hexCharToValue(*(ptr + i)) < 0) {
                    return false;
                }
                i = i + 1;
            }
            return true;
        }
        # Check for compact format without dashes
        if (len == 32) {
            local i: int = 0;
            loop (i < 32) {
                if (UUID.hexCharToValue(*(ptr + i)) < 0) {
                    return false;
                }
                i = i + 1;
            }
            return true;
        }
        return false;
    }

    # Clone this UUID
    frame clone(this: *UUID) ret UUID {
        local uuid: UUID;
        local i: int = 0;
        loop (i < 16) {
            uuid.bytes[i] = this.bytes[i];
            i = i + 1;
        }
        return uuid;
    }

    # Copy bytes to output buffer
    frame toBytes(this: *UUID, output: *u8) {
        local i: int = 0;
        loop (i < 16) {
            *(output + i) = this.bytes[i];
            i = i + 1;
        }
    }
}
