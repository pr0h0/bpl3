# Scalar and pointer entry points used through the C adapter in bridge.c.
struct Packet { count: long, score: double, }
frame bpl_add(a: long, b: long) ret long { return a + b; }
frame bpl_scale(value: f32) ret f32 { return value * cast<f32>(1.5); }
frame bpl_update(packet: *Packet) { packet.count = packet.count + 7; packet.score = packet.score * 2.0; }
frame bpl_run(callback: Func<long>(long), value: long) ret long { return callback(value) + 1; }
