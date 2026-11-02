import printf, free from "std/c.bpl";
import [Date], [DateTime] from "std/date.bpl";

frame date(text: string) {
    local d: Date = Date.new(1, 1, 1);
    if (Date.tryParse(text, &d)) {
        local shown: string = d.format();
        printf("date [%s] -> %s\n", text, shown);
        free(cast<*void>(shown));
    } else {
        printf("date [%s] -> invalid\n", text);
    }
}

frame dateTime(text: string) {
    local d: DateTime = DateTime.new(1, 1, 1, 0, 0, 0);
    if (DateTime.tryParse(text, &d)) {
        local shown: string = d.formatISO();
        printf("datetime [%s] -> %s\n", text, shown);
        free(cast<*void>(shown));
    } else {
        printf("datetime [%s] -> invalid\n", text);
    }
}

frame main() ret int {
    date("2026-11-01");
    date("2024-02-29");
    date("2026-02-29");
    date("2026-13-01");
    date("2026-1-01");
    date("2026-11-01x");
    dateTime("2026-11-01T12:34:56");
    dateTime("2026-11-01 12:34:56");
    dateTime("2026-11-01t12:34:56.789Z");
    dateTime("2026-11-01T01:30:00+02:00");
    dateTime("2026-11-01T23:30:00-0130");
    dateTime("2026-12-31T23:59:59-01:00");
    dateTime("2026-11-01T24:00:00");
    dateTime("2026-11-01T12:34");
    dateTime("2026-11-01T12:34:56.");
    dateTime("2026-11-01T12:34:56+2");
    dateTime("2026-11-01T12:34:56Zjunk");
    return 0;
}
