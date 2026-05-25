import [Rand] from "std/rand.bpl";
import [Math] from "std/math.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    IO.log("=== Rand/Math Demo ===");
    local r: Rand = Rand.seed(cast<ulong>(12345));
    IO.printIntLn(r.nextInt());
    IO.printIntLn(cast<int>(r.nextFloat() * 100.0));
    IO.printIntLn(Math.abs(-7));
    IO.printIntLn(cast<int>(Math.sqrt(9.0)));
    return 0;
}
