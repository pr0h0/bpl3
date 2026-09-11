import [Deque] from "std/deque.bpl";
import [printf] from "std/c.bpl";

frame main() ret int {
    local work: Deque<int> = Deque<int>.new(2);
    work.pushBack(20);
    work.pushFront(10);
    work.pushBack(30);
    printf("front=%d back=%d size=%d\n", work.peekFront().unwrap(), work.peekBack().unwrap(), work.size());
    loop (!work.isEmpty()) {
        printf("%d\n", work.popFront().unwrap());
    }
    work.destroy();
    return 0;
}
