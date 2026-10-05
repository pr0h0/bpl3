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

# A pointer to an array of row pointers, owned by the caller.
type Row = long[2];
type RowPointers = *Row[2];
@[c_export]
frame interop_rows(rows: *RowPointers) ret long {
    local sum: long = rows[0][1] + rows[1][0];
    rows[1][1] = sum * 2;
    return sum;
}
