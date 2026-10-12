using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
public struct Pair { public int X; public int Y; }
[StructLayout(LayoutKind.Sequential)]
public struct Triple { public double X; public double Y; public double Z; }

public static unsafe class Exports
{
    [UnmanagedCallersOnly(EntryPoint = "foreign_add", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static long Add(long a, long b) => a + b;
    [UnmanagedCallersOnly(EntryPoint = "foreign_scale", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static float Scale(float value) => value * 1.5f;
    [UnmanagedCallersOnly(EntryPoint = "foreign_short", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static short Short(short value) => value;
    // Byte represents the C _Bool transport value: exactly 0 or 1, one byte.
    [UnmanagedCallersOnly(EntryPoint = "foreign_bool", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static byte Bool(byte value) => value == 0 ? (byte)1 : (byte)0;
    [UnmanagedCallersOnly(EntryPoint = "foreign_pair", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static Pair Swap(Pair value) => new Pair { X = value.Y, Y = value.X };
    [UnmanagedCallersOnly(EntryPoint = "foreign_triple", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static Triple Double(Triple value) => new Triple { X = value.X * 2, Y = value.Y * 2, Z = value.Z * 2 };
    [UnmanagedCallersOnly(EntryPoint = "foreign_callback", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static long Callback(delegate* unmanaged[Cdecl]<long, long> callback, long value) => callback(value) + 1;
}
