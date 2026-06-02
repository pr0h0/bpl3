import [printf] from "std/c.bpl";

struct Item {
    value: int,

    frame init(this: *Item, val: int) {
        this.value = val;
    }

    frame getValue(this: *Item) ret int {
        return this.value;
    }

    frame print(this: *Item) {
        printf("Item value: %d\n", this.value);
    }
}

struct ItemWithNew {
    value: int,

    frame new(this: *ItemWithNew) {
        this.value = 42;
    }

    frame print(this: *ItemWithNew) {
        printf("ItemWithNew value: %d\n", this.value);
    }
}

frame main() ret int {
    # Test 1: Direct array element method call (this is what causes BUG-136)
    local items: Item[3];

    # Initialize with direct assignment
    items[0].value = 10;
    items[1].value = 20;
    items[2].value = 30;

    printf("Test 1: Direct array access works\n");
    printf("items[0].value = %d\n", items[0].value);
    printf("items[1].value = %d\n", items[1].value);
    printf("items[2].value = %d\n", items[2].value);

    # Test 2: User's suggested workaround - save to local variable first
    printf("\nTest 2: Workaround - save to local variable then call method\n");
    local el0: *Item = &items[0];
    el0.print();

    local el1: *Item = &items[1];
    el1.print();

    local el2: *Item = &items[2];
    el2.print();

    # Test 3: Try direct method call (this might crash with BUG-136)
    printf("\nTest 3: Direct method call items[i].print()\n");
    items[0].print();
    items[1].print();
    items[2].print();

    # Test 4: Array of structs WITH new() constructor
    printf("\nTest 4: Array with new() constructor\n");
    local itemsWithNew: ItemWithNew[3];
    itemsWithNew[0].print();
    itemsWithNew[1].print();
    itemsWithNew[2].print();

    # Test 5: Modify values and call methods again
    printf("\nTest 5: Modify and call\n");
    itemsWithNew[0].value = 100;
    itemsWithNew[1].value = 200;
    itemsWithNew[0].print();
    itemsWithNew[1].print();

    # Test 6: Loop access pattern (common in real code)
    printf("\nTest 6: Loop access pattern\n");
    loop (local i: int = 0; i < 3; i = i + 1) {
        items[i].print();
    }

    # Test 7: Modify in loop then print
    printf("\nTest 7: Modify in loop\n");
    loop (local i: int = 0; i < 3; i = i + 1) {
        items[i].value = i * 100;
    }
    loop (local i: int = 0; i < 3; i = i + 1) {
        items[i].print();
    }

    printf("\nAll tests passed!\n");
    return 0;
}
