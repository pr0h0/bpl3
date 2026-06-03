import [Queue] from "std/queue.bpl";
import [printf] from "std/c.bpl";

frame main() {
    printf("--- Queue Example: Print Jobs ---\n");

    local printQueue: Queue<int> = Queue<int>.new(5);

    # Add jobs
    printf("Submitting Job 101\n");
    printQueue.enqueue(101);

    printf("Submitting Job 102\n");
    printQueue.enqueue(102);

    printf("Submitting Job 103\n");
    printQueue << 103; # Using the new shift operator

    printf("Queue size: %d\n", printQueue.size());

    # Process jobs
    printf("Processing jobs:\n");

    loop (!printQueue.isEmpty()) {
        local jobId: int = printQueue.dequeue().unwrap();
        printf("Printing Job ID: %d\n", jobId);
    }

    printQueue.destroy();
}
