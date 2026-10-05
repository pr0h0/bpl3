import { dlopen, FFIType, JSCallback, ptr } from "bun:ffi";
const library = dlopen(process.argv[2], {
  interop_add: { args: [FFIType.i64, FFIType.i64], returns: FFIType.i64 },
  interop_rows: { args: [FFIType.ptr], returns: FFIType.i64 },
  interop_scale: { args: [FFIType.f32], returns: FFIType.f32 },
  interop_update: { args: [FFIType.ptr], returns: FFIType.void },
  interop_run: { args: [FFIType.ptr, FFIType.i64], returns: FFIType.i64 },
});
const callback = new JSCallback((value) => value * 2n, {
  args: [FFIType.i64],
  returns: FFIType.i64,
});
try {
  const packet = new Uint8Array(16);
  const view = new DataView(packet.buffer);
  view.setBigInt64(0, 35n, true);
  view.setFloat64(8, 1.25, true);
  const api = library.symbols;
  api.interop_update(ptr(packet));
  if (api.interop_add(4294967296n, -7n) !== 4294967289n) throw Error("int64");
  if (api.interop_scale(2.5) !== 3.75) throw Error("float32");
  if (view.getBigInt64(0, true) !== 42n || view.getFloat64(8, true) !== 2.5)
    throw Error("struct pointer");
  if (api.interop_run(callback.ptr, 20n) !== 41n) throw Error("callback");
  const first = new BigInt64Array([10n, 11n]);
  const second = new BigInt64Array([31n, 32n]);
  const rows = new BigUint64Array([BigInt(ptr(first)), BigInt(ptr(second))]);
  if (api.interop_rows(ptr(rows)) !== 42n || first[1] !== 11n || second[1] !== 84n)
    throw Error("nested array pointers");
  console.log("interop-ok");
} finally {
  callback.close();
  library.close();
}
