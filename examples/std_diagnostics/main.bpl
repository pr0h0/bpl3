import [DiagnosticReporter] from "std/diagnostics.bpl";
import [DiagnosticLevel] from "std/diagnostics.bpl";
import [Span] from "std/diagnostics.bpl";
extern printf(fmt: string, ...) ret int;

frame main() ret int {
    local reporter: DiagnosticReporter = DiagnosticReporter.new();

    local source: string = "frame main() {\n    local x: int = ;\n}";

    # Simulate an error at line 2, column 20 (index 27)
    # "local x: int = ;"
    #                 ^
    # Indices:
    # frame main() {\n  (15 chars)
    #     local x: int = ; (20 chars)

    local span: Span = Span.new("main.bpl", 38, 39, 2, 20);

    reporter.report(DiagnosticLevel.Error, "Unexpected token", span);

    reporter.printAll(source);

    reporter.destroy();
    span.destroy(); # Original span needs to be destroyed as copy was made in report

    return 0;
}
