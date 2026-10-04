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
