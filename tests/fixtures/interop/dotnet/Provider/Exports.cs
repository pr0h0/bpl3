using System.Runtime.CompilerServices;
using System.Threading.Tasks;
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
    [UnmanagedCallersOnly(EntryPoint = "foreign_mixed_signed", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static int MixedSigned(sbyte value, Pair pair) => value + pair.X + pair.Y;
    [UnmanagedCallersOnly(EntryPoint = "foreign_mixed_unsigned", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static int MixedUnsigned(byte value, Pair pair) => value + pair.X + pair.Y;
    [UnmanagedCallersOnly(EntryPoint = "foreign_triple", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static Triple Double(Triple value) => new Triple { X = value.X * 2, Y = value.Y * 2, Z = value.Z * 2 };
    [UnmanagedCallersOnly(EntryPoint = "foreign_callback", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static long Callback(delegate* unmanaged[Cdecl]<long, long> callback, long value) => callback(value) + 1;
    [UnmanagedCallersOnly(EntryPoint = "foreign_signed_probe", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static int Signed(sbyte value) => value;
    [UnmanagedCallersOnly(EntryPoint = "foreign_unsigned_probe", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static int Unsigned(byte value) => value;
    [UnmanagedCallersOnly(EntryPoint = "foreign_small_callback", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static int SmallCallback(delegate* unmanaged[Cdecl]<sbyte, int> callback, sbyte value) => callback(value);
    [UnmanagedCallersOnly(EntryPoint = "foreign_callback_factory", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static delegate* unmanaged[Cdecl]<sbyte, int> Factory() => &Signed;
    [UnmanagedCallersOnly(EntryPoint = "foreign_owned_message", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static byte* OwnedMessage()
    {
        byte* text = (byte*)NativeMemory.Alloc(6);
        if (text == null) return null;
        text[0] = 0x68; text[1] = 0xc3; text[2] = 0xa9;
        text[3] = 0xce; text[4] = 0xbb; text[5] = 0;
        return text;
    }
    [UnmanagedCallersOnly(EntryPoint = "foreign_release_message", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static void ReleaseMessage(byte* text) => NativeMemory.Free(text);
    [UnmanagedCallersOnly(EntryPoint = "foreign_buffer", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static ulong Buffer(byte* data, ulong length)
    {
        ulong sum = 0;
        for (ulong i = 0; i < length; ++i) { data[i] ^= 0x5a; sum += data[i]; }
        return sum;
    }
    [UnmanagedCallersOnly(EntryPoint = "foreign_alloc", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static byte* Alloc(ulong length)
    {
        byte* data = (byte*)NativeMemory.Alloc((nuint)length);
        if (data != null) for (ulong i = 0; i < length; ++i) data[i] = (byte)(i + 10);
        return data;
    }
    [UnmanagedCallersOnly(EntryPoint = "foreign_free", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static void Free(byte* data, ulong length) => NativeMemory.Free(data);
    [UnmanagedCallersOnly(EntryPoint = "foreign_thread_callback", CallConvs = new[] { typeof(CallConvCdecl) })]
    public static long ThreadCallback(delegate* unmanaged[Cdecl]<long, long> callback, long value)
    {
        try {
            nint address = (nint)callback;
            return Task.Run(() => ((delegate* unmanaged[Cdecl]<long, long>)address)(value)).GetAwaiter().GetResult() + 1;
        }
        catch { return long.MinValue; }
    }

}
