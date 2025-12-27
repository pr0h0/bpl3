import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;
extern scanf(fmt: string, ...) ret int;
extern malloc(size: int) ret *void;
extern free(ptr: *void);
extern fopen(filename: string, mode: string) ret *void;
extern fwrite(ptr: *void, size: int, count: int, file: *void) ret int;
extern fread(ptr: *void, size: int, count: int, file: *void) ret int;
extern fclose(file: *void) ret int;
extern strlen(s: string) ret int;
extern strstr(haystack: string, needle: string) ret string;

# Input limits
global MAX_TITLE_LEN: int = 255;
global MAX_DESC_LEN: int = 511;
global MAX_PATH_LEN: int = 511;

# Screens
global SCREEN_MAIN: int = 0;
global SCREEN_ADD: int = 1;
global SCREEN_LIST: int = 2;
global SCREEN_EXPORT: int = 3;
global SCREEN_IMPORT: int = 4;

export [TODO];
struct TODO {
    id: int,
    title: String,
    description: String,
    completed: bool,
    frame new(id: int, title: String, description: String) ret TODO {
        local todo: TODO = TODO { id: id, title: title, description: description, completed: false };

        return todo;
    }

    frame updateCompleted(this: *TODO, completed: bool) {
        this.completed = completed;
    }

    frame updateTitle(this: *TODO, title: String) {
        this.title.assign(title.toString());
    }

    frame updateDescription(this: *TODO, description: String) {
        this.description.assign(description.toString());
    }

    frame update(this: *TODO, title: String, description: String, completed: bool) {
        this.updateTitle(title);
        this.updateDescription(description);
        this.updateCompleted(completed);
    }

    frame print(this: *TODO) {
        printf("ID: %d\n", this.id);
        printf("Title: %s\n", this.title.toString());
        printf("Description: %s\n", this.description.toString());
        printf("Completed: %s\n", this.completed != false ? "Yes" : "No");
        printf("------------------\n");
    }
}

export [MainTODO];
struct MainTODO {
    count: int,
    items: Array<TODO>,
    currentScreen: int,
    frame new() ret MainTODO {
        local mainTodo: MainTODO = MainTODO { count: 0, items: Array<TODO>.new(0), currentScreen: 0 };

        return mainTodo;
    }

    frame resetView(this: *MainTODO) {
        this.currentScreen = SCREEN_MAIN;
    }

    frame findById(this: *MainTODO, id: int) ret *TODO {
        local i: int = 0;
        loop (i < this.items.len()) {
            local item: *TODO = this.items.getRef(i);
            if (item.id == id) {
                return item;
            }
            i = i + 1;
        }
        return cast<*TODO>(0);
    }

    frame promptChar(this: *MainTODO, prompt: string) ret char {
        printf("%s", prompt);
        local buf: char;
        scanf(" %c", &buf);
        return buf;
    }

    frame promptTitle(this: *MainTODO) ret String {
        local raw: string = cast<string>(malloc(MAX_TITLE_LEN + 1));
        printf("Enter TODO Title: ");
        scanf("%255s", raw);
        local out: String = String.new(raw);
        free(cast<*void>(raw));
        return out;
    }

    frame promptDescription(this: *MainTODO) ret String {
        local raw: string = cast<string>(malloc(MAX_DESC_LEN + 1));
        printf("Enter TODO Description: ");
        scanf("%511s", raw);
        local out: String = String.new(raw);
        free(cast<*void>(raw));
        return out;
    }

    frame promptPath(this: *MainTODO, label: string) ret string {
        local raw: string = cast<string>(malloc(MAX_PATH_LEN + 1));
        printf("%s", label);
        scanf("%511s", raw);
        return raw;
    }

    frame promptSearch(this: *MainTODO) ret String {
        local raw: string = cast<string>(malloc(MAX_TITLE_LEN + 1));
        printf("Enter search term: ");
        scanf("%255s", raw);
        local out: String = String.new(raw);
        free(cast<*void>(raw));
        return out;
    }

    frame promptBool(this: *MainTODO, label: string) ret bool {
        local value: int = 0;
        printf("%s", label);
        scanf("%d", &value);
        return value != 0;
    }

    frame addTodo(this: *MainTODO, title: String, description: String) {
        local todo: TODO = TODO.new(this.count + 1, title, description);
        this.items.push(todo);
        this.count = this.count + 1;
    }

    frame addTodoInteractive(this: *MainTODO) {
        local title: String = this.promptTitle();
        local description: String = this.promptDescription();
        this.addTodo(title, description);
        printf("TODO added successfully!\n");
        this.resetView();
    }

    frame updateTodo(this: *MainTODO, id: int, newTitle: String, newDescription: String) {
        local item: *TODO = this.findById(id);
        if (item == cast<*TODO>(0)) {
            printf("ID not found.\n");
            return;
        }
        item.title.destroy();
        item.description.destroy();
        item.title = newTitle;
        item.description = newDescription;
        printf("TODO updated successfully!\n");
        this.resetView();
    }

    frame updateTodoInteractive(this: *MainTODO) {
        local id: int;
        printf("Enter TODO ID to update: ");
        scanf("%d", &id);
        local title: String = this.promptTitle();
        local description: String = this.promptDescription();
        this.updateTodo(id, title, description);
    }

    frame updateCompletionStatus(this: *MainTODO, id: int, completed: bool) {
        local item: *TODO = this.findById(id);
        if (item == cast<*TODO>(0)) {
            printf("ID not found.\n");
            return;
        }
        item.completed = completed;
        printf("TODO completion status updated successfully!\n");
        this.resetView();
    }

    frame toggleCompletionInteractive(this: *MainTODO) {
        local id: int;
        printf("Enter TODO ID to update completion status: ");
        scanf("%d", &id);
        local completed: bool = this.promptBool("Set completed? (1 = yes, 0 = no): ");
        this.updateCompletionStatus(id, completed);
    }

    frame searchTodo(this: *MainTODO, searchTerm: String) {
        printf("\n--- Search Results ---\n");
        local found: int = 0;
        local i: int = 0;
        loop (i < this.items.len()) {
            local item: TODO = this.items.get(i);
            local titleMatch: string = strstr(item.title.toString(), searchTerm.toString());
            local descMatch: string = strstr(item.description.toString(), searchTerm.toString());
            if ((titleMatch != nullptr) || (descMatch != nullptr)) {
                item.print();
                found = found + 1;
            }
            i = i + 1;
        }
        if (found == 0) {
            printf("No matching todos found.\n");
        } else {
            printf("Found %d matching todos.\n", found);
        }
        this.resetView();
    }

    frame searchInteractive(this: *MainTODO) {
        local term: String = this.promptSearch();
        this.searchTodo(term);
    }

    frame clearCompleted(this: *MainTODO) {
        local idx: int = 0;
        local removed: int = 0;
        loop (idx < this.items.len()) {
            local item: TODO = this.items.get(idx);
            if (item.completed) {
                this.items.removeAt(idx);
                removed = removed + 1;
                continue;
            }
            idx = idx + 1;
        }
        printf("=> Removed %d completed todos.\n", removed);
        this.resetView();
    }

    frame deleteTodo(this: *MainTODO, id: int) {
        local idx: int = 0;
        local found: bool = false;
        loop (idx < this.items.len()) {
            # local item: TODO = this.items.get(idx);
            if (this.items.getRef(idx).id == id) {
                this.items.removeAt(idx);
                found = true;
                break;
            }
            idx = idx + 1;
        }
        if (!found) {
            printf("ID not found.\n");
            return;
        }
        printf("=> Deleted TODO %d\n", id);
    }

    frame exportInteractive(this: *MainTODO) {
        printf("\n--- Export TODOs ---\n");
        printf("Current todos: %d\n", this.count);
        local path: string = this.promptPath("Enter file path: ");
        this.exportToBinary(path);
        free(cast<*void>(path));
        this.resetView();
    }

    frame importInteractive(this: *MainTODO) {
        printf("\n--- Import TODOs ---\n");
        printf("WARNING: This will REPLACE current todos (%d items)\n", this.count);
        local path: string = this.promptPath("Enter file path: ");
        this.importFromBinary(path);
        free(cast<*void>(path));
        this.resetView();
    }

    frame exportToBinary(this: *MainTODO, path: string) ret bool {
        local file: *void = fopen(path, "wb");
        if (file == cast<*void>(0)) {
            printf("Error: Could not open file for writing.\n");
            return false;
        }
        # Write magic: TODOBIN (7 bytes)
        local magic: string = "TODOBIN";
        fwrite(cast<*void>(magic), 1, 7, file);
        # Write version (4 bytes)
        local version: int = 1;
        fwrite(cast<*void>(&version), 4, 1, file);
        # Write count (4 bytes)
        local count32: int = this.count;
        fwrite(cast<*void>(&count32), 4, 1, file);
        # Write each TODO
        local i: int = 0;
        loop (i < this.items.len()) {
            local item: TODO = this.items.get(i);
            # Write id (4 bytes)
            local id32: int = item.id;
            fwrite(cast<*void>(&id32), 4, 1, file);
            # Write completed (1 byte)
            local completedByte: char = item.completed ? cast<char>(1) : cast<char>(0);
            fwrite(cast<*void>(&completedByte), 1, 1, file);
            # Write title length and bytes
            local titleLen: int = strlen(item.title.toString());
            fwrite(cast<*void>(&titleLen), 4, 1, file);
            fwrite(cast<*void>(item.title.toString()), 1, titleLen, file);
            # Write description length and bytes
            local descLen: int = strlen(item.description.toString());
            fwrite(cast<*void>(&descLen), 4, 1, file);
            fwrite(cast<*void>(item.description.toString()), 1, descLen, file);
            i = i + 1;
        }
        fclose(file);
        printf("=> Exported %d todos to '%s'\n", this.count, path);
        return true;
    }

    frame importFromBinary(this: *MainTODO, path: string) ret bool {
        local file: *void = fopen(path, "rb");
        if (file == cast<*void>(0)) {
            printf("Error: File not found.\n");
            return false;
        }
        # Read and validate magic
        local magic: string = cast<string>(malloc(8));
        fread(cast<*void>(magic), 1, 7, file);
        magic[7] = '\0';
        local expected: string = "TODOBIN";
        local idx: int = 0;
        loop (idx < 7) {
            if (magic[idx] != expected[idx]) {
                printf("Error: Invalid todo file format.\n");
                free(cast<*void>(magic));
                fclose(file);
                return false;
            }
            idx = idx + 1;
        }
        # Read version
        local version: int;
        fread(cast<*void>(&version), 4, 1, file);
        # Read count
        local count32: int;
        fread(cast<*void>(&count32), 4, 1, file);
        printf("Found %d todos. Replace current %d items? (y/n): ", count32, this.count);
        local confirm: char;
        scanf(" %c", &confirm);
        free(cast<*void>(magic));
        if ((confirm != 'y') && (confirm != 'Y')) {
            fclose(file);
            printf("Import cancelled.\n");
            return false;
        }
        # Clear current items
        this.items.destroy();
        this.items = Array<TODO>.new(0);
        this.count = 0;
        # Read each TODO
        local i: int = 0;
        loop (i < count32) {
            local id32: int;
            fread(cast<*void>(&id32), 4, 1, file);
            local completedByte: char;
            fread(cast<*void>(&completedByte), 1, 1, file);
            local titleLen: int;
            fread(cast<*void>(&titleLen), 4, 1, file);
            local titleBuf: string = cast<string>(malloc(titleLen + 1));
            fread(cast<*void>(titleBuf), 1, titleLen, file);
            titleBuf[titleLen] = '\0';
            local descLen: int;
            fread(cast<*void>(&descLen), 4, 1, file);
            local descBuf: string = cast<string>(malloc(descLen + 1));
            fread(cast<*void>(descBuf), 1, descLen, file);
            descBuf[descLen] = '\0';
            local todo: TODO = TODO.new(id32, String.new(titleBuf), String.new(descBuf));
            todo.completed = completedByte != cast<char>(0);
            this.items.push(todo);
            if (id32 > this.count) {
                this.count = id32;
            }
            i = i + 1;
        }
        fclose(file);
        printf("=> Imported %d todos from '%s'\n", count32, path);
        return true;
    }

    # 0: Main Menu, 2: View TODOs
    frame printMenu(this: *MainTODO) {
        if (this.currentScreen == SCREEN_MAIN) {
            printf("\n--- TODO Application Menu ---\n");
            printf("1. Add TODO\n");
            printf("2. View TODOs\n");
            printf("3. Export TODOs\n");
            printf("4. Import TODOs\n");
            printf("5. Exit\n");
            return;
        }
        if (this.currentScreen == SCREEN_LIST) {
            printf("\n--- TODO List ---\n");
            local i: int = 0;
            loop (i < this.items.len()) {
                local item: TODO = this.items.get(i);
                item.print();
                i = i + 1;
            }
            printf("------------------\n");
            printf("1. Update TODO\n");
            printf("2. Delete TODO\n");
            printf("3. Back to Main Menu\n");
            printf("4. Toggle Completed\n");
            printf("5. Search TODO\n");
            printf("6. Clear Completed\n");
            return;
        }
    }

    frame handleInput(this: *MainTODO, input: char) ret bool {
        if (this.currentScreen == SCREEN_MAIN) {
            if (input == '1') {
                this.addTodoInteractive();
                return false;
            }
            if (input == '2') {
                this.currentScreen = SCREEN_LIST;
                return false;
            }
            if (input == '3') {
                this.exportInteractive();
                return false;
            }
            if (input == '4') {
                this.importInteractive();
                return false;
            }
            if (input == '5') {
                return true;
            }
            printf("Invalid option. Please try again.\n");
            return false;
        }
        if (this.currentScreen == SCREEN_LIST) {
            if (input == '1') {
                this.updateTodoInteractive();
                return false;
            }
            if (input == '2') {
                local id: int;
                printf("Enter TODO ID to delete: ");
                scanf("%d", &id);
                this.deleteTodo(id);
                return false;
            }
            if (input == '3') {
                this.resetView();
                return false;
            }
            if (input == '4') {
                this.toggleCompletionInteractive();
                return false;
            }
            if (input == '5') {
                this.searchInteractive();
                return false;
            }
            if (input == '6') {
                this.clearCompleted();
                return false;
            }
            printf("Invalid option. Please try again.\n");
            return false;
        }
        return false;
    }
}
