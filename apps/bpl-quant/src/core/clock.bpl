# Monotonic and wall clocks with nanosecond resolution.

# Shares bpl-tls's declaration: one extern signature reaches the linker.
import clock_gettime, [timespec] from "bpl-tls";

export [Clock];

global const CLOCK_REALTIME: int = 0;
global const CLOCK_MONOTONIC: int = 1;

struct Clock {
    frame nowNs() ret long {
        local ts: timespec;
        clock_gettime(CLOCK_MONOTONIC, &ts);
        return (ts.tv_sec * 1000000000) + ts.tv_nsec;
    }

    frame nowUs() ret long {
        return Clock.nowNs() / 1000;
    }

    frame nowMs() ret long {
        return Clock.nowNs() / 1000000;
    }

    frame wallSeconds() ret long {
        local ts: timespec;
        clock_gettime(CLOCK_REALTIME, &ts);
        return ts.tv_sec;
    }

    frame wallMs() ret long {
        local ts: timespec;
        clock_gettime(CLOCK_REALTIME, &ts);
        return (ts.tv_sec * 1000) + (ts.tv_nsec / 1000000);
    }

    frame elapsedMs(start_ns: long) ret float {
        return cast<float>(Clock.nowNs() - start_ns) / 1000000.0;
    }
}
