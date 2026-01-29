import [Rand] from "std/rand.bpl";
import [Math] from "std/math.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    IO.log("=== Rand/Math Demo ===");
    local r: Rand = Rand.seed(cast<ulong>(12345));
    IO.printInt(r.nextInt());
    IO.printInt(cast<int>(r.nextFloat() * 100.0));
    IO.printInt(Math.abs(-7));
    IO.printInt(cast<int>(Math.sqrt(9.0)));
    return 0;
}
