import printf from "std/c.bpl";
import run, runWith, [RunResult] from "std/process.bpl";

frame report(label: string, result: *RunResult) {
    printf("%s: exit=%d timedOut=%d stdout=[%s] stderr=[%s]\n", label, result.exitCode, cast<int>(result.timedOut), result.stdout.data, result.stderr.data);
}

frame main() ret int {
    # Arguments reach the program unchanged: no shell, no quoting.
    local echoed: RunResult = run("printf", "%s|", "a b", "$HOME", "x;y");
    report("args", &echoed);
    echoed.stdout.destroy();
    echoed.stderr.destroy();

    # stdout and stderr are captured separately, with the exit code.
    local both: RunResult = run("sh", "-c", "echo out; echo err >&2; exit 3");
    report("streams", &both);
    both.stdout.destroy();
    both.stderr.destroy();

    # Input is written to stdin.
    local sorted: RunResult = runWith("pear\napple\nfig\n", 0, "sort");
    report("stdin", &sorted);
    sorted.stdout.destroy();
    sorted.stderr.destroy();

    # A timeout kills the whole process group, including grandchildren.
    local slow: RunResult = runWith(cast<string>(nullptr), 200, "sh", "-c", "echo started; sleep 5 & sleep 5");
    report("timeout", &slow);
    slow.stdout.destroy();
    slow.stderr.destroy();

    # A missing program reports -1 and the reason.
    local missing: RunResult = run("bpl-no-such-program");
    report("missing", &missing);
    missing.stdout.destroy();
    missing.stderr.destroy();
    return 0;
}
