import exec, execStatus, execOutput, execShell, execSilent, sleep, [ProcessResult] from "std/process.bpl";
extern printf(fmt: string, ...) ret int;
import [String] from "std/string.bpl";

frame main() {
    printf("--- Process Test Start ---\n");

    # 1. Simple exec
    exec("echo", "Hello", "from", "exec");

    # 2. execStatus
    local s1: int = execStatus("true");
    printf("Status true: %d\n", s1);

    local s2: int = execStatus("false");
    if (s2 != 0) {
        printf("Status false: nonzero\n");
    } else {
        printf("Status false: zero\n");
    }

    # 3. execOutput
    local res: ProcessResult = execOutput("echo", "Captured", "Output");
    defer res.output.destroy();
    printf("Output: %s", res.output.data);

    # 4. Injection protection
    # Should print: hello; echo INJECTED
    local res2: ProcessResult = execOutput("echo", "hello;", "echo", "INJECTED");
    defer res2.output.destroy();
    printf("Injection Output: %s", res2.output.data);

    # 5. execShell (Unsafe, but allows features)
    printf("Testing execShell with pipe...\n");
    local shellRes: ProcessResult = execShell("echo 'Pipe Works' | grep Works");
    defer shellRes.output.destroy();
    printf("%s", shellRes.output.data);

    # 6. execSilent
    printf("Testing execSilent (should see no output below)...\n");
    execSilent("echo", "This", "should", "be", "hidden");

    # 7. Sleep
    printf("Sleeping for 1 second...\n");
    sleep(1000);
    printf("Awake!\n");

    printf("--- Process Test End ---\n");
}
