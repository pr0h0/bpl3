import printf, free from "std/c.bpl";
import [Duration] from "std/time.bpl";

frame show(ms: long) {
    local d: Duration = Duration.fromMs(ms);
    local text: string = d.format();
    printf("%ld -> %s\n", ms, text);
    free(cast<*void>(text));
}

frame main() ret int {
    show(0);
    show(450);
    show(999);
    show(1000);
    show(1500);
    show(1250);
    show(1125);
    show(61000);
    show(3600000);
    show(3723456);
    show(90061250);
    show(-2500);
    show(-450);
    show(-9223372036854775807 - 1);
    return 0;
}
