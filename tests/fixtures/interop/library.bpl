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
