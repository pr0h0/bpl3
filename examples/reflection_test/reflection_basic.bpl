import [TypeInfo], [FieldInfo] from "std/reflection.bpl";

struct Point {
    x: int,
    y: int,
}

struct Node {
    val: int,
    next: *Node,
}

struct VTableTest {
    val: int,
    frame foo(this: *VTableTest) {
    }
}

# Any struct matching the new compiler definition
struct Any {
    type_info: *TypeInfo,
    data: u64,
}

extern printf(fmt: string, ...) ret int;

enum Color {
    Red,
    Green,
    Blue,
}

frame main() {
    printf("Offset of Point.x: %ld\n", offsetof(Point, x));
    printf("Offset of Point.y: %ld\n", offsetof(Point, y));

    printf("Offset of Node.val: %ld\n", offsetof(Node, val));
    printf("Offset of Node.next: %ld\n", offsetof(Node, next));

    printf("Offset of VTableTest.val: %ld\n", offsetof(VTableTest, val));
    # vtable should be at 0, val at 8 (on 64-bit)

    # Test typeof
    local info: *TypeInfo = typeof<Point>();
    if (info == nullptr) {
        printf("typeof(Point) is null (as expected for now)\n");
    } else {
        printf("typeof(Point) is NOT null\n");
        printf("Type Name: %s\n", info.name);
        printf("Type Size: %ld\n", info.size);
        printf("Type Kind: %d (Expected 1 for Struct)\n", cast<int>(info.kind));
        printf("Num Fields: %d\n", info.num_fields);

        local i: int = 0;
        loop (i < info.num_fields) {
            # BPL supports array indexing on pointers!
            local f: FieldInfo = info.fields[i];
            printf("  Field %d: %s (Offset: %ld)\n", i, f.name, f.offset);

            i = i + 1;
        }
    }

    # Test Array
    local arrInfo: *TypeInfo = typeof<int[5]>();
    printf("\nArray Info:\n");
    printf("Type Kind: %d (Expected 2 for Array)\n", cast<int>(arrInfo.kind));
    if (arrInfo.element_type != nullptr) {
        printf("Element Kind: %d (Expected 0 for Primitive int)\n", cast<int>(arrInfo.element_type.kind));
        printf("Element Name: %s\n", arrInfo.element_type.name);
    }
    # Test Enum
    local enumInfo: *TypeInfo = typeof<Color>();
    printf("\nEnum Info:\n");
    printf("Type Name: %s\n", enumInfo.name);
    printf("Type Kind: %d (Expected 4 for Enum)\n", cast<int>(enumInfo.kind));

    # Test Any
    local val: int = 12345;
    local anyVal: Any = cast<Any>(val);

    printf("\nAny Test:\n");
    if (anyVal.type_info != nullptr) {
        printf("Any Type Name: %s\n", anyVal.type_info.name);
    }
    if (anyVal is int) {
        printf("anyVal is int (Success)\n");
    } else {
        printf("anyVal is NOT int (Fail)\n");
    }

    if (anyVal is float) {
        printf("anyVal is float (Fail)\n");
    } else {
        printf("anyVal is NOT float (Success)\n");
    }
}
