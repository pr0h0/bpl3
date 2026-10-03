import ctypes
import sys

library = ctypes.CDLL(sys.argv[1])
class Packet(ctypes.Structure):
    _fields_ = [("count", ctypes.c_int64), ("score", ctypes.c_double)]
callback_type = ctypes.CFUNCTYPE(ctypes.c_int64, ctypes.c_int64)
library.interop_add.argtypes = [ctypes.c_int64, ctypes.c_int64]
library.interop_add.restype = ctypes.c_int64
library.interop_scale.argtypes = [ctypes.c_float]
library.interop_scale.restype = ctypes.c_float
library.interop_update.argtypes = [ctypes.POINTER(Packet)]
library.interop_update.restype = None
library.interop_run.argtypes = [callback_type, ctypes.c_int64]
library.interop_run.restype = ctypes.c_int64
packet = Packet(35, 1.25)
library.interop_update(ctypes.byref(packet))
assert library.interop_add(4294967296, -7) == 4294967289
assert library.interop_scale(2.5) == 3.75
assert (packet.count, packet.score) == (42, 2.5)
callback = callback_type(lambda value: value * 2)
assert library.interop_run(callback, 20) == 41
print("interop-ok")
