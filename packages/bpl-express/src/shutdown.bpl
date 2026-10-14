# Linux signalfd keeps termination handling out of asynchronous signal callbacks.
import [pollfd], poll, read, close, __errno_location from "./libc.bpl";
extern sigemptyset(set: *void) ret int;
extern sigaddset(set: *void, signal: int) ret int;
extern sigprocmask(how: int, set: *void, old: *void) ret int;
extern signalfd(fd: int, mask: *void, flags: int) ret int;
export [ShutdownSignals];
struct ShutdownSignals {
    fd: int,
    previous: char[128],
    stopping: bool,
    frame new() ret ShutdownSignals {
        local scope: ShutdownSignals;
        scope.fd = -1;
        scope.stopping = false;
        local mask: char[128];
        if ((sigemptyset(&mask[0]) != 0) || (sigaddset(&mask[0], 2) != 0) || (sigaddset(&mask[0], 15) != 0)) {
            throw "Cannot configure shutdown signals";
        }
        if (sigprocmask(0, &mask[0], &scope.previous[0]) != 0) {
            throw "Cannot block shutdown signals";
        }
        scope.fd = signalfd(-1, &mask[0], 526336);
        if (scope.fd < 0) {
            sigprocmask(2, &scope.previous[0], nullptr);
            throw "Cannot open shutdown signal descriptor";
        }
        return scope;
    }
    frame requested(this: *ShutdownSignals) ret bool {
        if (this.stopping) {
            return true;
        }
        local signal: char[128];
        loop {
            local n: long = read(this.fd, cast<string>(&signal[0]), 128);
            if (n > 0) {
                this.stopping = true;
                return true;
            }
            if (n < 0) {
                local error: *int = __errno_location();
                if (error[0] == 4) {
                    continue;
                }
            }
            return false;
        }
        return false;
    }
    # -1 means stopping; 0 timeout/interruption; 1 listener ready.
    frame wait(this: *ShutdownSignals, listener: int, timeout: int) ret int {
        if (this.requested()) {
            return -1;
        }
        local fds: pollfd[2];
        fds[0].fd = this.fd;
        fds[0].events = 1;
        fds[0].revents = 0;
        fds[1].fd = listener;
        fds[1].events = 1;
        fds[1].revents = 0;
        local result: int = poll(&fds[0], 2, timeout);
        if (this.requested()) {
            return -1;
        }
        if (result <= 0) {
            return 0;
        }
        if (fds[1].revents != 0) {
            return 1;
        }
        return 0;
    }
    frame destroy(this: *ShutdownSignals) {
        if (this.fd >= 0) {
            close(this.fd);
            this.fd = -1;
            sigprocmask(2, &this.previous[0], nullptr);
        }
    }
}
