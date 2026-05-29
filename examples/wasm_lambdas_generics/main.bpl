struct Box<T> {
    value: T,
}

enum Op {
    Add(int),
    Mul(int),
    Keep,
}

frame identity<T>(value: T) ret T {
    return value;
}

frame apply(op: Op, value: int) ret int {
    return match (op) {
        Op.Add(amount) => value + amount,
        Op.Mul(factor) => value * factor,
        Op.Keep => value,
    };
}

frame applyTwice(value: int, f: Lambda<int>(int)) ret int {
    return f(f(value));
}

frame main() ret int {
    local base: int = 5;
    local bump: Lambda<int>(int) = |x: int| ret int {
        return x + base;
    };

    local stepped: int = applyTwice(4, bump);
    local boxed: Box<int> = Box<int> { value: identity<int>(stepped) };
    local result: int = apply(Op.Mul(3), apply(Op.Add(2), boxed.value));

    if (stepped != 14) {
        return 1;
    }
    if (result != 48) {
        return 2;
    }
    if (apply(Op.Keep, result) != 48) {
        return 3;
    }

    return 0;
}
