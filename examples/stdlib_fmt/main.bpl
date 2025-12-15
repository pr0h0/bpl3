import [Fmt] from "std/fmt.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    IO.log("=== Fmt Demo ===");
    Fmt.printIntLn(123);
    Fmt.printHexLn(255);
    Fmt.printPaddedLeft("ok", 5);
    IO.log("");
    Fmt.printPaddedRight("ok", 3);
    IO.log("");
    return 0;
}
