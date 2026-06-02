import [printf] from "std/c.bpl";

enum Operation {
    Add(int),
    Sub(int),
    Mul(int),
    Clear,
}

type OpFunc = Lambda<int>(int);

frame main() ret int {
    # Scenario 1: Lambda matching on Enum
    local processor: Lambda<int>(int, Operation) = |current: int, op: Operation| ret int {
        return match (op) {
            Operation.Add(x) => current + x,
            Operation.Sub(x) => current - x,
            Operation.Mul(x) => current * x,
            Operation.Clear => 0,
        };
    };

    local val: int = 10;
    val = processor(val, Operation.Add(5));
    printf("10 + 5 = %d\n", val); # 15
    val = processor(val, Operation.Mul(2));
    printf("15 * 2 = %d\n", val); # 30
    val = processor(val, Operation.Clear);
    printf("Clear = %d\n", val); # 0

    # Scenario 2: Match returning Lambda (Capturing match pattern variables)
    # This tests if we can capture 'x' which is bound in the match arm
    local op1: Operation = Operation.Add(100);
    local op2: Operation = Operation.Sub(50);

    local func1: OpFunc = match (op1) {
        Operation.Add(x) => |v: int| ret int {
            return v + x;
        },
        Operation.Sub(x) => |v: int| ret int {
            return v - x;
        },
        Operation.Mul(x) => |v: int| ret int {
            return v * x;
        },
        Operation.Clear => |v: int| ret int {
            return 0;
        },
    };

    local func2: OpFunc = match (op2) {
        Operation.Add(x) => |v: int| ret int {
            return v + x;
        },
        Operation.Sub(x) => |v: int| ret int {
            return v - x;
        },
        Operation.Mul(x) => |v: int| ret int {
            return v * x;
        },
        Operation.Clear => |v: int| ret int {
            return 0;
        },
    };

    printf("func1(10) = %d\n", func1(10)); # 10 + 100 = 110
    printf("func2(100) = %d\n", func2(100)); # 100 - 50 = 50

    # Scenario 3: Lambda inside match guard (if supported?)
    # BPL supports pattern guards: Pattern if expr => ...
    # Can expr use a lambda?
    local op3: Operation = Operation.Add(20);
    match (op3) {
        Operation.Add(x) if |val: int| ret bool {
            return val > 10;
        }(x) => {
            printf("Add > 10: %d\n", x);
        },
        Operation.Add(x) => {
            printf("Add <= 10: %d\n", x);
        },
        _ => {
            printf("Other\n");
        },
    };

    return 0;
}
