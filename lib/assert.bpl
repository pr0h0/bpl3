# Assertions for tests (`bpl test`) and runtime checks. Each failure prints
# a message and throws 1, which fails the test or, outside a try block, ends
# the program.

export [Assert];

extern printf(format: string, ...) ret int;
extern strcmp(left: string, right: string) ret int;
extern fabs(value: double) ret double;

import [IO] from "std/io.bpl";

struct Assert {
    frame that(condition: bool, message: string) {
        if (condition) {
            return;
        }
        IO.log(message);
        # Throw standard error code for assertion failure
        throw 1;
    }

    frame isTrue(condition: bool, message: string) {
        Assert.that(condition, message);
    }

    frame isFalse(condition: bool, message: string) {
        Assert.that(!condition, message);
    }

    # Fails unconditionally, for code that should not be reached.
    frame fail(message: string) {
        Assert.that(false, message);
    }

    frame equalLong(actual: long, expected: long, message: string) {
        if (actual == expected) {
            return;
        }
        printf("%s: expected %ld, got %ld\n", message, expected, actual);
        throw 1;
    }

    frame equalInt(actual: int, expected: int, message: string) {
        Assert.equalLong(cast<long>(actual), cast<long>(expected), message);
    }

    # Two strings with the same bytes; null equals only null.
    frame equalString(actual: string, expected: string, message: string) {
        local same: bool = actual == expected;
        if (!same && (actual != nullptr) && (expected != nullptr)) {
            same = strcmp(actual, expected) == 0;
        }
        if (same) {
            return;
        }
        local shownActual: string = actual;
        if (shownActual == nullptr) {
            shownActual = "(null)";
        }
        local shownExpected: string = expected;
        if (shownExpected == nullptr) {
            shownExpected = "(null)";
        }
        printf("%s: expected \"%s\", got \"%s\"\n", message, shownExpected, shownActual);
        throw 1;
    }

    # Within `tolerance` of each other, for floating-point results.
    frame near(actual: double, expected: double, tolerance: double, message: string) {
        if (fabs(actual - expected) <= tolerance) {
            return;
        }
        printf("%s: expected %g within %g, got %g\n", message, expected, tolerance, actual);
        throw 1;
    }
}
