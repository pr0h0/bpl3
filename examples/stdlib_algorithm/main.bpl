import [Array] from "std/array.bpl";
import [Algorithm] from "std/algorithm.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    IO.log("=== Algorithm Demo ===");
    local arr: Array<int> = Array<int>.new(5);
    arr.push(5);
    arr.push(1);
    arr.push(4);
    arr.push(2);
    arr.push(3);
    Algorithm.reverse(&arr);
    IO.printIntLn(arr.get(0));
    Algorithm.sortAsc(&arr);
    IO.printIntLn(arr.get(0));
    IO.printIntLn(Algorithm.binarySearch(&arr, 4));
    IO.printIntLn(Algorithm.binarySearch(&arr, 9));
    return 0;
}
