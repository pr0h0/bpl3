# Bug Hunt: Type System Edge Cases
extern printf(fmt: string, ...);

# Test 1: Duplicate struct field names (should error)
struct DuplicateField {
    x: int,
    x: int,
}

# Test 2: Struct inheriting from itself (should error)
struct SelfInherit: SelfInherit {
    x: int,
}

# Test 3: Circular inheritance A -> B -> A (should error)
struct CircleA: CircleB {
    a: int,
}
struct CircleB: CircleA {
    b: int,
}

# Test 4: Generic with same name as type parameter
struct T<T> {
    value: T,
}

# Test 5: Void pointer dereference into non-void
frame test_void_ptr() {
    local ptr: *void = nullptr;
    local val: int = *ptr; # Should this be allowed?
}

# Test 6: Negative number as array size in type alias
type NegArray = int[-5];

# Test 7: Function returning itself (recursive function type)
type RecFunc = Func<RecFunc>();

# Test 8: Spec implementing itself
spec SelfSpec: SelfSpec {
    frame method(this: *SelfSpec);
}

# Test 9: Empty struct
struct Empty {
}

# Test 10: Type alias cycle
type AliasA = AliasB;
type AliasB = AliasA;

frame main() {
    printf("Type edge case tests\n");
}
