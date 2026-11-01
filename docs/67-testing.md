# Testing

`bpl test` runs the tests of a project. This guide shows how to write them,
run them, and read their results. The command's options are listed in
[Compiler Options](39-compiler-options.md#bpl-test-paths).

## Writing tests

A test file is a source file whose name ends in `_test.bpl`. Every top-level
frame in it named `testSomething` or `test_something`, with no parameters, is
a test. Other frames are ordinary helpers.

```bpl
# lib/math_test.bpl
import [Assert] from "std/assert.bpl";
import clamp from "./math.bpl";

frame testClampKeepsValuesInRange() {
    Assert.equalInt(clamp(5, 0, 10), 5, "a value in range");
    Assert.equalInt(clamp(-1, 0, 10), 0, "a low value");
    Assert.equalInt(clamp(11, 0, 10), 10, "a high value");
}

frame test_clamp_accepts_equal_bounds() ret int {
    # An int-returning test fails when it returns anything but 0.
    return clamp(3, 3, 3) - 3;
}
```

A test fails when it:

- throws, which is what every `Assert` helper does when its check fails;
- returns a nonzero `int` (tests may also return nothing);
- crashes, for example on a null dereference or an out-of-bounds index;
- runs longer than 60 seconds.

A test file must not define `main`. `bpl test` builds each file once with a
generated `main` and runs every test in its own process, so a test that
crashes does not stop the others, and tests cannot affect each other through
globals.

## Assertions

`std/assert.bpl` provides the checks. The comparison helpers print the
expected and actual values when they fail:

| Helper                                          | Fails when                         |
| ----------------------------------------------- | ---------------------------------- |
| `Assert.that(condition, message)`, `isTrue`     | the condition is false             |
| `Assert.isFalse(condition, message)`            | the condition is true              |
| `Assert.equalInt(actual, expected, message)`    | the ints differ                    |
| `Assert.equalLong(actual, expected, message)`   | the longs differ                   |
| `Assert.equalString(actual, expected, message)` | the strings' bytes differ          |
| `Assert.near(actual, expected, tolerance, ...)` | the doubles are further apart      |
| `Assert.fail(message)`                          | always; for code that must not run |

## Running tests

```bash
bpl test                     # every *_test.bpl under the current directory
bpl test lib/ tests/         # only these directories (or files)
bpl test --filter Clamp      # only tests whose name contains "Clamp"
bpl test --list              # print the tests without building them
bpl test --fail-fast         # stop after the first failure
bpl test --verbose           # also show the output of passing tests
bpl test --json              # a machine-readable report
```

Discovery skips `bpl_modules`, `node_modules`, hidden directories and the
patterns in `.bplignore`, as `bpl check` and `bpl format` do. A project made
with `bpl new` already has a test file.

## Reading results

Each test prints `PASS` or `FAIL` with its file, name and duration, and the
run ends with a summary. A failing test also shows what it printed and its
exit status. If `clamp` returned its input below the range, the example above
would report:

```text
FAIL lib/math_test.bpl testClampKeepsValuesInRange (2ms)
      a low value: expected 0, got -1
      Uncaught exception
      exit status 1
PASS lib/math_test.bpl test_clamp_accepts_equal_bounds (1ms)

1 passed, 1 failed (412ms)
```

A file that does not compile is reported with its diagnostics as `ERROR`,
and its tests do not run. The command exits with status 1 when any test fails
or any file cannot be built, so it can gate CI directly.

With `--json`, the report has `check: "test"`, the totals (`totalTests`,
`passed`, `failed`, `fileErrors`) and, for each file, its tests with `name`,
`passed`, `exitCode`, `durationMs` and `output`.
