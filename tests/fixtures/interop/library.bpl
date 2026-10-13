# Stable C ABI exports; no handwritten adapter required.
struct Packet { count: long, score: double, }
@[c_export]
frame interop_add(a: long, b: long) ret long { return a + b; }
@[c_export]
frame interop_scale(value: f32) ret f32 { return value * cast<f32>(1.5); }
@[c_export]
frame interop_update(packet: *Packet) { packet.count = packet.count + 7; packet.score = packet.score * 2.0; }
@[c_export]
frame interop_run(callback: Func<long>(long), value: long) ret long { return callback(value) + 1; }
frame doubled(value: long) ret long { return value * 2; }
@[c_export]
frame interop_factory() ret Func<long>(long) { return doubled; }
@[c_export]
frame interop_checked(callback: Func<long>(long), value: long) ret long {
    try { return callback(value); }
    catch(e: NullAccessError) { return -cast<long>(e.code); }
    return -99;
}

# A pointer to an array of row pointers, owned by the caller.
type Row = long[2];
type RowPointers = *Row[2];
@[c_export]
frame interop_rows(rows: *RowPointers) ret long {
    local sum: long = rows[0][1] + rows[1][0];
    rows[1][1] = sum * 2;
    return sum;
}

extern strlen(text: string) ret ulong;
extern malloc(size: ulong) ret *uchar;
extern free(data: *uchar);
@[c_export]
frame interop_text_length(text: string) ret ulong { return strlen(text); }
@[c_export]
frame interop_message() ret string { return "héλ"; }
@[c_export]
frame interop_buffer(data: *uchar, length: ulong) ret ulong {
    local sum: ulong = 0;
    local index: ulong = 0;
    loop(index < length) {
        data[index] = data[index] ^ cast<uchar>(0x5a);
        sum += cast<ulong>(data[index]);
        index++;
    }
    return sum;
}
@[c_export]
frame interop_alloc(length: ulong) ret *uchar {
    local data: *uchar = malloc(length);
    if(data == nullptr) { return data; }
    local index: ulong = 0;
    loop(index < length) { data[index] = cast<uchar>(index + 10); index++; }
    return data;
}
@[c_export]
frame interop_free(data: *uchar) { free(data); }

@[c_export]
frame interop_threaded(value: long) ret long {
    local total: long = 0;
    local cleaned: long = 0;
    local cleanup: *long = &cleaned;
    try {
        defer { *cleanup = *cleanup + 1; }
        loop(local index: int = 0; index < 10; index++) { total += value; }
        throw total;
    }
    catch(result: long) { return result + cleaned; }
    return -99;
}

# Foreign callers widen narrow results and invoke a returned private callback.
type SignedByte = i8;
@[c_export]
frame interop_signed_byte() ret SignedByte {return cast<SignedByte>(-7);}
@[c_export]
frame interop_signed_short() ret short {return cast<short>(-300);}
@[c_export]
frame interop_unsigned_byte() ret u8 {return cast<u8>(255);}
@[c_export]
frame interop_unsigned_short() ret ushort {return cast<ushort>(65535);}
@[c_export]
frame interop_boolean() ret bool {return true;}
frame narrow_result() ret SignedByte {return cast<SignedByte>(-7);}
@[c_export]
frame interop_narrow_factory() ret Func<SignedByte>() {return narrow_result;}
