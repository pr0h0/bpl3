using System;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential)]
struct Packet { public long Count; public double Score; }

unsafe class Program
{
    const string Library = "bpl_interop";
    [DllImport(Library, EntryPoint = "interop_add", CallingConvention = CallingConvention.Cdecl)]
    static extern long Add(long a, long b);
    [DllImport(Library, EntryPoint = "interop_scale", CallingConvention = CallingConvention.Cdecl)]
    static extern float Scale(float value);
    [DllImport(Library, EntryPoint = "interop_update", CallingConvention = CallingConvention.Cdecl)]
    static extern void Update(Packet* packet);
    [DllImport(Library, EntryPoint = "interop_rows", CallingConvention = CallingConvention.Cdecl)]
    static extern long Rows(long** rows);
    [DllImport(Library, EntryPoint = "interop_run", CallingConvention = CallingConvention.Cdecl)]
    static extern long Run(delegate* unmanaged[Cdecl]<long, long> callback, long value);
    [DllImport(Library, EntryPoint = "interop_factory", CallingConvention = CallingConvention.Cdecl)]
    static extern delegate* unmanaged[Cdecl]<long, long> Factory();
    [DllImport(Library, EntryPoint = "interop_checked", CallingConvention = CallingConvention.Cdecl)]
    static extern long Checked(delegate* unmanaged[Cdecl]<long, long> callback, long value);
    [DllImport(Library, EntryPoint = "interop_text_length", CallingConvention = CallingConvention.Cdecl)]
    static extern ulong TextLength([MarshalAs(UnmanagedType.LPUTF8Str)] string text);
    [DllImport(Library, EntryPoint = "interop_message", CallingConvention = CallingConvention.Cdecl)]
    static extern byte* Message();
    [DllImport(Library, EntryPoint = "interop_buffer", CallingConvention = CallingConvention.Cdecl)]
    static extern ulong Buffer(byte* data, ulong length);
    [DllImport(Library, EntryPoint = "interop_alloc", CallingConvention = CallingConvention.Cdecl)]
    static extern byte* Alloc(ulong length);
    [DllImport(Library, EntryPoint = "interop_free", CallingConvention = CallingConvention.Cdecl)]
    static extern void Free(byte* data);

    [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
    static long Twice(long value) => value * 2;

    [DllImport(Library, EntryPoint = "interop_threaded", CallingConvention = CallingConvention.Cdecl)]
    static extern long Threaded(long value);

    sealed class Holder { public int Value = 7; }
    [MethodImpl(MethodImplOptions.NoInlining)]
    static int ReadValue(Holder value) => value.Value;

    static int Main()
    {
        Packet packet = new Packet { Count = 35, Score = 1.25 };
        Update(&packet);
        if (Add(4294967296, -7) != 4294967289 || Scale(2.5f) != 3.75f) return 1;
        if (packet.Count != 42 || packet.Score != 2.5) return 2;
        if (Run(&Twice, 20) != 41 || Factory()(21) != 42) return 3;
        if (Checked(null, 20) != -7 || Checked(&Twice, 21) != 42) return 4;
        long* first = stackalloc long[] { 10, 11 };
        long* second = stackalloc long[] { 31, 32 };
        long** rows = stackalloc long*[2];
        rows[0] = first; rows[1] = second;
        if (Rows(rows) != 42 || first[1] != 11 || second[1] != 84) return 5;
        if (TextLength("héλ") != 5 || Marshal.PtrToStringUTF8((nint)Message()) != "héλ") return 6;
        byte* bytes = stackalloc byte[] { 0, 127, 255 };
        if (Buffer(bytes, 3) != 292 || bytes[0] != 90 || bytes[1] != 37 || bytes[2] != 165) return 7;
        if (Buffer(null, 0) != 0) return 8;
        byte* owned = Alloc(3);
        if (owned == null) return 9;
        try { if (owned[0] != 10 || owned[2] != 12) return 10; }
        finally { Free(owned); }
        // Loading the BPL runtime must leave the CLR's exception handling intact.
        bool caught = false;
        try { _ = ReadValue(null!); }
        catch (NullReferenceException) { caught = true; }
        if (!caught) return 11;
        Parallel.For(1, 9, value => {
            for (int iteration = 0; iteration < 100; iteration++) {
                if (Threaded(value) != value * 10 + 1 || Run(&Twice, 20) != 41)
                    throw new Exception("thread state");
            }
        });
        Console.WriteLine("interop-ok");
        return 0;
    }
}
