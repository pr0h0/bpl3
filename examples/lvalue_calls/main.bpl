import [printf] from "std/c.bpl";

struct Inner {
    value: int,
}

struct Box {
    x: int,
    inner: Inner,
}

frame getBoxPtr(b: *Box) ret *Box {
    return b;
}

frame getBoxVal(b: Box) ret Box {
    return b;
}

frame getInnerPtr(b: *Box) ret *Inner {
    return &b.inner;
}

struct Item {
    value: int,
}

import [Array] from "../..//lib/array.bpl";

frame main() {
    printf("-- lvalue call tests --\n");
    local box: Box = Box { x: 0, inner: Inner { value: 0 } };

    # 1) Assignment via pointer-returning call
    getBoxPtr(&box).x = 42;
    printf("ptr assign: x=%d\n", box.x);

    # 2) Chained member access on pointer-returning call
    getBoxPtr(&box).inner.value = 7;
    printf("ptr chain assign: inner.value=%d\n", box.inner.value);

    # 3) Comparison via value-returning call (reads from call result)
    local tmp: Box = getBoxVal(box);
    local isSeven: bool = tmp.inner.value == 7;
    printf("val read compare (==7): %d\n", isSeven);

    # 4) More chaining: pointer-returning again
    getInnerPtr(&box).value = 99;
    printf("innerPtr assign: value=%d\n", box.inner.value);

    # 5) Ensure comparisons on pointer-returning call also work
    local isNinetyNine: bool = getInnerPtr(&box).value == 99;
    printf("ptr read compare (==99): %d\n", isNinetyNine);

    # 6) Array getRef and get validations
    local arr: Array<Item> = Array<Item>.new(0);
    arr.push(Item { value: 0 });
    arr.push(Item { value: 0 });
    getBoxPtr(&box).x = 100; # unrelated write to ensure no side-effect issues
    arr.getRef(0).value = 5; # lvalue on call returning pointer
    printf("arr ref assign: %d\n", arr.get(0).value);
    local eqFive: bool = arr.get(0).value == 5; # read from value-returning call
    printf("arr get compare (==5): %d\n", eqFive);
}
