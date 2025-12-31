extern socket(domain: int, sock_type: int, protocol: int) ret int;
extern bind(sockfd: int, addr: *sockaddr_in, addrlen: uint) ret int;
extern listen(sockfd: int, backlog: int) ret int;
extern accept(sockfd: int, addr: *sockaddr_in, addrlen: *uint) ret int;
extern read(fd: int, buf: string, count: ulong) ret long;
extern write(fd: int, buf: string, count: ulong) ret long;
extern close(fd: int) ret int;
extern open(pathname: string, flags: int) ret int;
extern printf(fmt: string, ...) ret int;
extern exit(status: int) ret void;
extern memset(s: *void, c: int, n: ulong) ret *void;
extern setsockopt(sockfd: int, level: int, optname: int, optval: *void, optlen: uint) ret int;
extern atoi(s: string) ret int;
extern lseek(fd: int, offset: long, whence: int) ret long;
extern sprintf(str: string, format: string, ...) ret int;
extern strlen(s: string) ret ulong;
extern strstr(haystack: string, needle: string) ret string;
extern strncmp(s1: string, s2: string, n: ulong) ret int;
extern strcpy(dest: string, src: string) ret string;
extern strcat(dest: string, src: string) ret string;
extern strtok(str: string, delim: string) ret string;
extern strchr(s: string, c: int) ret string;
extern strcmp(s1: string, s2: string) ret int;

struct sockaddr_in {
    sin_family: short,
    sin_port: ushort,
    sin_addr: uint,
    sin_zero: ulong,
}

frame htons(v: ushort) ret ushort {
    return ((v & 0xFF) << cast<ushort>(8)) | ((v & 0xFF00) >> cast<ushort>(8));
}

export sprintf;
export atoi;
export strcpy;
export strcat;
export strlen;

export write;
export close;
export socket;
export bind;
export listen;
export accept;
export setsockopt;
export htons;
export printf;
export exit;
export memset;
export strncmp;
export strchr;
export strstr;
export read;
export [sockaddr_in];
export strtok;
export strcmp;

extern malloc(size: ulong) ret string;
extern free(ptr: string) ret void;
export malloc;
export free;

export open;
export lseek;
