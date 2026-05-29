enum Visit {
    Start,
    Value(int),
    Pair { left: int, right: int },
}

struct Accumulator {
    value: int,

    frame add(this: *Accumulator, amount: int) {
        this.value = this.value + amount;
    }

    frame score(this: *Accumulator, visit: Visit) ret int {
        return match (visit) {
            Visit.Start => this.value,
            Visit.Value(amount) => this.value + amount,
            Visit.Pair { left: l, right: r } => this.value + l + r,
        };
    }
}

frame fib(n: int) ret int {
    if (n < 2) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
}

frame main() ret int {
    local acc: Accumulator = Accumulator { value: 0 };
    local values: int[5] = [2, 3, 5, 8, 13];

    loop (local i: int = 0; i < 5; i = i + 1) {
        acc.add(values[i]);
    }

    if (acc.score(Visit.Start) != 31) {
        return 1;
    }
    if (acc.score(Visit.Value(9)) != 40) {
        return 2;
    }
    if (acc.score(Visit.Pair { left: fib(5), right: 7 }) != 43) {
        return 3;
    }

    return 0;
}
