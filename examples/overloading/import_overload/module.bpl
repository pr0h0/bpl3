frame add(a: int, b: int) ret int {
    return a + b;
}

frame add(a: double, b: double) ret double {
    return a + b;
}

struct Calculator {
    val: int,
    frame compute(this: Calculator, x: int) ret int {
        return this.val + x;
    }
    frame compute(this: Calculator, x: double) ret double {
        return cast<double>(this.val) + x;
    }
}

export add;
export Calculator;
