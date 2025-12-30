import [PriorityQueue] from "std/priority_queue.bpl";
extern printf(fmt: *i8, ...) ret i32;

frame main() {
    printf("--- PriorityQueue Example: Integers ---\n");

    local pq: PriorityQueue<int> = PriorityQueue<int>.new(10);

    printf("Pushing 30\n");
    pq.push(30);

    printf("Pushing 10\n");
    pq.push(10);

    printf("Pushing 20\n");
    pq.push(20);

    printf("Popping:\n");

    loop (!pq.isEmpty()) {
        local val: int = pq.pop().unwrap();
        printf("Value: %d\n", val);
    }

    pq.destroy();
}
