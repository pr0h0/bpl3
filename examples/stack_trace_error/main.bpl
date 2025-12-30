import [Error] from "std/errors.bpl";
import [Debug] from "std/debug.bpl";
extern printf(fmt: string, ...) ret int;

frame funcC() {
    local e: Error = Error.new("Something went wrong in funcC");

    printf("Printing via printStack():\n");
    e.printStack();

    printf("\nPrinting via getStackTrace():\n");
    local trace: string = e.getStackTrace();
    printf("%s", trace);

    printf("\nPrinting via toString():\n");
    printf("%s", e.toString());
}

frame funcB() {
    funcC();
}

frame funcA() {
    funcB();
}

frame main() {
    printf("--- Error Stack Trace Demo ---\n");
    funcA();

    printf("\n--- Debug.printStackTrace Demo ---\n");
    Debug.printStackTrace();
}
