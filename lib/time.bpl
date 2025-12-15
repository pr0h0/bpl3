# Time

export [Time];

extern time(ptr: *i64) ret i64;
extern usleep(usec: int) ret int;

struct Time {
    frame now() ret int {
        local t: i64 = 0;
        return cast<int>(time(&t));
    }
    frame sleep(ms: int) {
        local usec: int = ms * 1000;
        usleep(usec);
    }
}
