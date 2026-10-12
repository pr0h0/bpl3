using System;
using System.Runtime.CompilerServices;
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

    [UnmanagedCallersOnly(CallConvs = new[] { typeof(CallConvCdecl) })]
    static long Twice(long value) => value * 2;

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
        Console.WriteLine("interop-ok");
        return 0;
    }
}
