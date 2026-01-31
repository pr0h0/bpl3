# Bug Hunt: Enum Edge Cases
extern printf(fmt: string, ...);

# Test 1: Empty enum (no variants)
enum Empty {}

# Test 2: Enum with only one variant
enum Single {
    Only,
}

# Test 3: Enum variant with same name as enum
enum SameName {
    SameName,
}

# Test 4: Match without all variants (exhaustiveness)
enum Color {
    Red,
    Green,
    Blue,
}

frame test_non_exhaustive() {
    local c: Color = Color.Red;
    match (c) {
        Color.Red => printf("Red\n"),
        # Missing Green and Blue - should this error?
    }
}

# Test 5: Enum method accessing variant data
enum Option<T> {
    Some(T),
    None,
    
    frame unwrap(this: *Option<T>) ret T {
        match (*this) {
            Option.Some(val) => return val,
            Option.None => {
                printf("Called unwrap on None!\n");
                # What happens here? No return statement
            },
        }
    }
}

frame test_unwrap_none() {
    local opt: Option<int> = Option<int>.None;
    # local val: int = opt.unwrap();  # This would crash/return garbage
    printf("Skipping unwrap on None\n");
}

frame main() {
    test_non_exhaustive();
    test_unwrap_none();
    printf("Enum edge tests done\n");
}
