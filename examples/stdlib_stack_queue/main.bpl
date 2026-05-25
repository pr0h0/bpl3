import [Stack] from "std/stack.bpl";
import [Queue] from "std/queue.bpl";
import [Option] from "std/option.bpl";
import [IO] from "std/io.bpl";

frame main() ret int {
    IO.log("=== Stack/Queue Demo ===");
    local s: Stack<int> = Stack<int>.new(2);
    s.push(1);
    s.push(2);
    s.push(3);
    IO.printIntLn(s.size());
    local p1: Option<int> = s.pop();
    IO.printIntLn(p1.unwrap());
    IO.printIntLn(s.size());

    local q: Queue<int> = Queue<int>.new(2);
    q.enqueue(10);
    q.enqueue(20);
    q.enqueue(30);
    IO.printIntLn(q.size());
    local d1: Option<int> = q.dequeue();
    IO.printIntLn(d1.unwrap());
    IO.printIntLn(q.size());
    return 0;
}
