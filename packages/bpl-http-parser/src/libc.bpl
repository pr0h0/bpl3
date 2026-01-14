extern strchr(s: string, c: int) ret string;
extern strstr(haystack: string, needle: string) ret string;
extern strlen(s: string) ret int;
extern strncmp(s1: string, s2: string, n: long) ret int;
extern strcmp(s1: string, s2: string) ret int;
extern strcpy(dest: string, src: string) ret string;
extern strncpy(dest: string, src: string, n: long) ret string;
extern malloc(size: long) ret string;
extern free(ptr: string) ret void;
extern atoi(s: string) ret int;
extern memset(s: string, c: int, n: long) ret string;

export strchr;
export strstr;
export strlen;
export strncmp;
export strcmp;
export strcpy;
export strncpy;
export malloc;
export free;
export atoi;
export memset;

extern printf(fmt: string, ...) ret int;
export printf;

extern fflush(stream: *void) ret int;
export fflush;
