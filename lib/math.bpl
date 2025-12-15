# Math helpers

export [Math];

extern printf(fmt: string, ...) ret int;

struct Math {
    frame absInt(x: int) ret int {
        if (x < 0) {
            return -x;
        }
        return x;
    }
    frame absFloat(x: float) ret float {
        if (x < 0.0) {
            return -x;
        }
        return x;
    }
    frame minInt(a: int, b: int) ret int {
        if (a < b) {
            return a;
        }
        return b;
    }
    frame maxInt(a: int, b: int) ret int {
        if (a > b) {
            return a;
        }
        return b;
    }
    frame minFloat(a: float, b: float) ret float {
        if (a < b) {
            return a;
        }
        return b;
    }
    frame maxFloat(a: float, b: float) ret float {
        if (a > b) {
            return a;
        }
        return b;
    }
    frame sqrtFloat(x: float) ret float {
        if (x < 0.0) {
            # sqrt of negative
            throw -1;
        }
        if (x == 0.0) {
            return 0.0;
        }
        local guess: float = x / 2.0;
        local i: int = 0;
        loop (i < 20) {
            guess = 0.5 * (guess + (x / guess));
            i = i + 1;
        }
        return guess;
    }
}
