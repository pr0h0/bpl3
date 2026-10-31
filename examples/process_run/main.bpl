import printf, atoi, malloc, memset, free from "std/c.bpl";
import run, runWith, sleep, [RunResult] from "std/process.bpl";

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

    # The grandchild in the killed process group is gone afterwards.
    local group: RunResult = runWith(cast<string>(nullptr), 200, "sh", "-c", "sleep 5 & echo $!; wait");
    local tries: int = 0;
    local alive: bool = true;
    loop ((tries < 50) && alive) {
        local probe: RunResult = run("kill", "-0", group.stdout.data);
        alive = probe.exitCode == 0;
        probe.stdout.destroy();
        probe.stderr.destroy();
        if (alive) {
            sleep(20);
        }
        tries = tries + 1;
    }
    printf("grandchild: timedOut=%d pid>0=%d gone=%d\n", cast<int>(group.timedOut), cast<int>(atoi(group.stdout.data) > 0), cast<int>(!alive));
    group.stdout.destroy();
    group.stderr.destroy();

    # Closing stdout and stderr does not escape the timeout.
    local quiet: RunResult = runWith(cast<string>(nullptr), 200, "sh", "-c", "exec >&- 2>&-; sleep 5");
    report("closed-outputs", &quiet);
    quiet.stdout.destroy();
    quiet.stderr.destroy();

    # Input keeps flowing after the child closes both outputs.
    local size: long = 200000;
    local input: *u8 = cast<*u8>(malloc(size + cast<long>(1)));
    memset(cast<*void>(input), 120, size);
    *(input + size) = cast<u8>(0);
    local counted: RunResult = runWith(cast<string>(input), 0, "sh", "-c", "exec >/dev/null 2>&1; n=$(wc -c); [ $n -eq 200000 ] && exit 5; exit 6");
    printf("late-stdin: exit=%d\n", counted.exitCode);
    counted.stdout.destroy();
    counted.stderr.destroy();
    free(cast<*void>(input));

    # A missing program reports -1 and the reason.
    local missing: RunResult = run("bpl-no-such-program");
    report("missing", &missing);
    missing.stdout.destroy();
    missing.stderr.destroy();
    return 0;
}
