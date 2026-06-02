import [printf] from "std/c.bpl";

import * as std from "std";

frame testAssignment() {
    printf("Testing assignment...\n");
    local opt: std.Option<int> = std.Option<int>.Some(10);
    if (opt.unwrap() == 10) {
        printf("Assignment OK\n");
    } else {
        printf("Assignment FAILED\n");
    }
}

frame testMatch(opt: std.Option<int>) {
    printf("Testing match...\n");
    match (opt) {
        std.Option<int>.Some(v) => printf("Match Some: %d\n", v),
        std.Option<int>.None => printf("Match None\n"),
    };
}

frame testMatchType(opt: std.Option<int>) {
    printf("Testing match<Type>...\n");
    if (match<std.Option.Some>(opt)) {
        printf("Is Some\n");
    } else {
        printf("Is None\n");
    }
}

frame testEquality() {
    printf("Testing equality...\n");
    local opt: std.Option<int> = std.Option<int>.Some(20);
    if (opt == std.Option<int>.Some(20)) {
        printf("Equality OK\n");
    } else {
        printf("Equality FAILED\n");
    }
}

frame getSome(v: int) ret std.Option<int> {
    return std.Option<int>.Some(v);
}

frame testCallAndReturn() {
    printf("Testing call and return...\n");
    local opt: std.Option<int> = getSome(30);
    if (opt.unwrap() == 30) {
        printf("Call/Return OK\n");
    }
}

frame testNested() {
    printf("Testing nested...\n");
    local nested: std.Option<std.Option<int>> = std.Option<std.Option<int>>.Some(std.Option<int>.Some(40));

    match (nested) {
        std.Option<std.Option<int>>.Some(inner) => {
            match (inner) {
                std.Option<int>.Some(v) => printf("Nested value: %d\n", v),
                std.Option<int>.None => printf("Nested None\n"),
            };
        },
        std.Option<std.Option<int>>.None => {
            printf("Outer None\n");
        },
    };
}

frame main() ret int {
    testAssignment();
    testMatch(std.Option<int>.Some(15));
    testMatch(std.Option<int>.None);
    testMatchType(std.Option<int>.Some(15));
    testEquality();
    testCallAndReturn();
    testNested();
    return 0;
}
