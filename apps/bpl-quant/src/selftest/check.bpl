# Self-test reporting.
#
# Every line the self-test prints is deterministic: values are rounded to a
# fixed number of decimals and only seeded generators are used. `near` checks
# compare against tolerances and count failures, so the exit status reports
# correctness even when the printed digits are not compared.

import printf from "std/c.bpl";
import [Math] from "std/math.bpl";

export [Check];

struct Check {
    passed: int,
    failed: int,
    section: string,

    frame new() ret Check {
        return Check { passed: 0, failed: 0, section: "" };
    }

    frame begin(this: *Check, name: string) {
        this.section = name;
        printf("== %s\n", name);
    }

    frame value(this: *Check, name: string, v: float, decimals: int) {
        printf("%s.%s = %.*f\n", this.section, name, decimals, v);
    }

    frame integer(this: *Check, name: string, v: long) {
        printf("%s.%s = %lld\n", this.section, name, v);
    }

    frame text(this: *Check, name: string, v: string) {
        printf("%s.%s = %s\n", this.section, name, v);
    }

    frame ok(this: *Check, name: string, condition: bool) {
        if (condition) {
            this.passed = this.passed + 1;
        } else {
            this.failed = this.failed + 1;
            printf("FAIL %s.%s\n", this.section, name);
        }
    }

    # Absolute-or-relative tolerance comparison.
    frame near(this: *Check, name: string, actual: float, expected: float, tol: float) {
        local diff: float = Math.abs(actual - expected);
        local scale: float = Math.max(1.0, Math.abs(expected));
        if (diff <= (tol * scale)) {
            this.passed = this.passed + 1;
        } else {
            this.failed = this.failed + 1;
            printf("FAIL %s.%s actual=%.10f expected=%.10f tol=%g\n", this.section, name, actual, expected, tol);
        }
    }

    frame equalInt(this: *Check, name: string, actual: long, expected: long) {
        if (actual == expected) {
            this.passed = this.passed + 1;
        } else {
            this.failed = this.failed + 1;
            printf("FAIL %s.%s actual=%lld expected=%lld\n", this.section, name, actual, expected);
        }
    }

    frame summary(this: *Check) ret int {
        printf("selftest: %d passed, %d failed\n", this.passed, this.failed);
        return this.failed;
    }
}
