import [IO] from "std/io.bpl";

import [printf] from "std/c.bpl";

frame main() {
    # Char (char)
    local c: char = 'A';
    IO.printString(c.toString());
    local c2: char = 66;
    IO.printString(c2.toString());

    # UChar (uchar)
    local uc: uchar = 67;
    IO.printString(uc.toString());
    local uc2: uchar = 68;
    IO.printString(uc2.toString());

    # Short (short)
    local s: short = -12345;
    IO.printString(s.toString());
    local s2: short = 12345;
    IO.printString(s2.toString());

    # UShort (ushort)
    local us: ushort = 60000;
    IO.printString(us.toString());
    printf("%d - Debug\n", cast<int>(us));
    local us2: ushort = 65535;
    IO.printString(us2.toString());

    # UInt (uint)
    local ui: uint = cast<uint>(3000000000);
    IO.printString(ui.toString());
    printf("%lld - Debug\n", cast<long>(ui));
    local ui2: uint = cast<uint>(4000000000);
    IO.printString(ui2.toString());

    # ULong (ulong)
    local ul: ulong = cast<ulong>(10000000000000000000);
    IO.printString(ul.toString());
    printf("%llu - Debug\n", ul);
    local ul2: ulong = cast<ulong>(18446744073708551015);
    IO.printString(ul2.toString());
}
