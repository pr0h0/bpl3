# Common C/runtime declarations used by BPL examples and stdlib modules.
#
# This module intentionally exports thin extern declarations instead of wrapper
# functions so imports lower to the same direct call shape as local externs.

export [printf];
export [fprintf];
export [dprintf];
export [sprintf];
export [snprintf];
export [puts];
export [putchar];
export [scanf];
export [gets];
export [write];

export [malloc];
export [free];
export [memcpy];
export [memmove];
export [memset];

export [strlen];
export [strcmp];
export [strncmp];
export [strcpy];
export [strcat];
export [atoi];

extern printf(fmt: string, ...) ret int;
extern fprintf(stream: *void, fmt: string, ...) ret int;
extern dprintf(fd: int, fmt: string, ...) ret int;
extern sprintf(dest: string, fmt: string, ...) ret int;
extern snprintf(dest: string, size: long, fmt: string, ...) ret int;
extern puts(value: string) ret int;
extern putchar(value: int) ret int;
extern scanf(fmt: string, ...) ret int;
extern gets(buf: string) ret string;
extern write(fd: int, buf: *char, count: int) ret int;

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern memcpy(dest: *void, src: *void, n: long) ret *void;
extern memmove(dest: *void, src: *void, n: long) ret *void;
extern memset(dest: *void, value: int, n: long) ret *void;

extern strlen(s: string) ret int;
extern strcmp(left: string, right: string) ret int;
extern strncmp(left: string, right: string, count: long) ret int;
extern strcpy(dest: string, src: string) ret string;
extern strcat(dest: string, src: string) ret string;
extern atoi(s: string) ret int;
