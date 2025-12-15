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
    Algorithm.reverseInt(&arr);
    IO.printInt(arr.get(0));
    Algorithm.sortIntAsc(&arr);
    IO.printInt(arr.get(0));
    IO.printInt(Algorithm.binarySearchInt(&arr, 4));
    IO.printInt(Algorithm.binarySearchInt(&arr, 9));
    return 0;
}
