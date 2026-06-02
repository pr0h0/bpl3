import [MainTODO] from "./todo.bpl";

import [printf] from "std/c.bpl";

frame main() {
    printf("TODO Application Initialized\n");
    local app: MainTODO = MainTODO.new();
    local shouldExit: bool = false;
    loop {
        app.printMenu();
        local input: char = app.promptChar("Enter your choice: ");
        shouldExit = app.handleInput(input);
        if (shouldExit) {
            break;
        }
    }

    printf("Exiting TODO Application\n");
}
