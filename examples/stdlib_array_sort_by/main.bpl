import printf, strcmp from "std/c.bpl";
import [Array] from "std/array.bpl";
import [Algorithm] from "std/algorithm.bpl";

struct Task {
    name: string,
    priority: int,
}

frame main() ret int {
    local numbers: Array<int> = Array<int>.new(0);
    local values: int[9] = [5, -2, 9, 0, 5, 3, -7, 8, 1];
    loop (local i: int = 0; i < 9; i = i + 1) {
        numbers.push(values[i]);
    }
    numbers.sortBy(|a: int, b: int| ret int {
        return b - a;
    });
    printf("descending:");
    loop (local i: int = 0; i < numbers.len(); i = i + 1) {
        printf(" %d", numbers.get(i));
    }
    printf("\n");
    numbers.destroy();

    local words: Array<string> = Array<string>.new(0);
    words.push("pear");
    words.push("apple");
    words.push("fig");
    words.push("banana");
    words.sortBy(|a: string, b: string| ret int {
        return strcmp(a, b);
    });
    printf("words:");
    loop (local i: int = 0; i < words.len(); i = i + 1) {
        printf(" %s", words.get(i));
    }
    printf("\n");
    words.destroy();

    # Equal priorities keep their original order.
    local tasks: Array<Task> = Array<Task>.new(0);
    tasks.push(Task { name: "write", priority: 2 });
    tasks.push(Task { name: "test", priority: 1 });
    tasks.push(Task { name: "review", priority: 2 });
    tasks.push(Task { name: "plan", priority: 1 });
    tasks.push(Task { name: "ship", priority: 3 });
    tasks.sortBy(|a: Task, b: Task| ret int {
        return a.priority - b.priority;
    });
    printf("tasks:");
    loop (local i: int = 0; i < tasks.len(); i = i + 1) {
        local task: Task = tasks.get(i);
        printf(" %s(%d)", task.name, task.priority);
    }
    printf("\n");
    tasks.destroy();

    # 1000 pseudo-random values sort like Algorithm.sortAsc.
    local mine: Array<int> = Array<int>.new(0);
    local reference: Array<int> = Array<int>.new(0);
    local seed: int = 12345;
    loop (local i: int = 0; i < 1000; i = i + 1) {
        seed = ((seed * 1103515245) + 12345) & 2147483647;
        mine.push(seed % 1000);
        reference.push(seed % 1000);
    }
    mine.sortBy(|a: int, b: int| ret int {
        return a - b;
    });
    Algorithm.sortAsc(&reference);
    local same: bool = true;
    loop (local i: int = 0; i < 1000; i = i + 1) {
        if (mine.get(i) != reference.get(i)) {
            same = false;
        }
    }
    printf("1000 values match sortAsc: %d\n", cast<int>(same));
    mine.destroy();
    reference.destroy();

    # A throwing comparator propagates the exception.
    local throwing: Array<int> = Array<int>.new(0);
    throwing.push(2);
    throwing.push(1);
    try {
        throwing.sortBy(|_a: int, _b: int| ret int {
            throw "no comparison";
        });
    } catch (message: string) {
        printf("comparator threw: %s\n", message);
    }
    throwing.destroy();

    local single: Array<int> = Array<int>.new(0);
    single.push(4);
    single.sortBy(|a: int, b: int| ret int {
        return a - b;
    });
    printf("single: %d, empty sort ok\n", single.get(0));
    single.destroy();
    local empty: Array<int> = Array<int>.new(0);
    empty.sortBy(|a: int, b: int| ret int {
        return a - b;
    });
    empty.destroy();
    return 0;
}
