extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(value: string) ret long;
extern strcmp(left: string, right: string) ret int;
extern strcpy(dest: string, src: string) ret string;
extern strcat(dest: string, src: string) ret string;
extern strncmp(left: string, right: string, count: long) ret int;
extern atoi(value: string) ret int;

frame main() ret int {
    local buffer: string = cast<string>(malloc(64));
    strcpy(buffer, "was");
    strcat(buffer, "m");

    if (strlen(buffer) != 4) {
        free(cast<*void>(buffer));
        return 1;
    }
    if (strcmp(buffer, "wasm") != 0) {
        free(cast<*void>(buffer));
        return 2;
    }
    if (strncmp(buffer, "wasp", 3) != 0) {
        free(cast<*void>(buffer));
        return 3;
    }
    if (strncmp(buffer, "wasa", 4) <= 0) {
        free(cast<*void>(buffer));
        return 4;
    }
    if (atoi("-38") != -38) {
        free(cast<*void>(buffer));
        return 5;
    }
    if (atoi("42tools") != 42) {
        free(cast<*void>(buffer));
        return 6;
    }

    free(cast<*void>(buffer));
    return 0;
}
