import [LinkedList] from "std/linked_list.bpl";
extern printf(fmt: *i8, ...) ret i32;

frame main() {
    printf("--- LinkedList Example: Integers ---\n");

    local list: LinkedList<int> = LinkedList<int>.new();

    list.pushBack(10);
    list.pushBack(20);
    list.pushBack(30);
    list.pushFront(5);

    printf("List size: %d\n", list.len());

    printf("Popping:\n");

    loop (!list.isEmpty()) {
        local val: int = list.popFront().unwrap();
        printf("Value: %d\n", val);
    }

    list.destroy();
}
