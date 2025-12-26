# import [Int], [String], [Bool], [Double], [Long], [IO] from "std";
import [IO] from "std";

frame main() {
    local x: int = 42;
    IO.printString(x.toString());

    IO.printString(123.toString());

    local b: bool = true;
    IO.printString(b.toString());

    IO.printString(false.toString());

    local d: double = 3.14;
    IO.printString(d.toString());
}
