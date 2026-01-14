extern socket(domain: int, sock_type: int, protocol: int) ret int;
extern connect(sockfd: int, addr: *sockaddr_in, addrlen: uint) ret int;
extern read(fd: int, buf: string, count: ulong) ret long;
extern write(fd: int, buf: string, count: ulong) ret long;
extern close(fd: int) ret int;
extern printf(fmt: string, ...) ret int;
extern exit(status: int) ret void;
extern memset(s: *void, c: int, n: ulong) ret *void;
extern memcpy(dest: *void, src: *void, n: ulong) ret *void;
extern sprintf(str: string, format: string, ...) ret int;
extern snprintf(str: string, size: ulong, format: string, ...) ret int;
extern strlen(s: string) ret ulong;
extern strstr(haystack: string, needle: string) ret string;
extern strncmp(s1: string, s2: string, n: ulong) ret int;
extern strcpy(dest: string, src: string) ret string;
extern strcat(dest: string, src: string) ret string;
extern strtok(str: string, delim: string) ret string;
extern strchr(s: string, c: int) ret string;
extern strcmp(s1: string, s2: string) ret int;
extern atoi(s: string) ret int;
extern strtol(nptr: string, endptr: **char, base: int) ret long;
extern malloc(size: ulong) ret string;
extern free(ptr: string) ret void;
extern gethostbyname(name: string) ret *hostent;

struct sockaddr_in {
    sin_family: short,
    sin_port: ushort,
    sin_addr: uint,
    sin_zero: ulong,
}

struct hostent {
    h_name: string,
    h_aliases: **char,
    h_addrtype: int,
    h_length: int,
    h_addr_list: **char,
}

frame htons(v: ushort) ret ushort {
    return ((v & 0xFF) << cast<ushort>(8)) | ((v & 0xFF00) >> cast<ushort>(8));
}

export sprintf;
export strcpy;
export strcat;
export strlen;

export write;
export close;
export socket;
export connect;
export htons;
export gethostbyname;
export printf;
export exit;
export memset;
export memcpy;
export strncmp;
export strchr;
export strstr;
export read;
export [sockaddr_in];
export [hostent];
export strtok;
export strcmp;
export malloc;
export free;
export atoi;
export strtol;
export snprintf;
