# Native threads built on POSIX threads (pthreads).
#
# `Thread.spawn` runs a `Lambda<void>()` (or, via `spawnFunc`, a plain
# `Func<void>()`) on a new operating-system thread. `JoinHandle<T>` runs a
# `Lambda<T>()` and returns its value from `join`. An exception that escapes
# the entry point is caught on the worker thread and reported by `join`
# (`panicked()`, `panicMessage()`), so it never unwinds into the C runtime.
#
# Threads are native-only: WebAssembly targets have no pthread support.
# Lambda captures are shared between threads exactly as written; protect
# shared mutable state with the primitives in std/sync.bpl.

export [Thread];
export [JoinHandle];

extern pthread_create(thread: *ulong, attr: *void, start: Func<*void>(*void), arg: *void) ret int;
extern pthread_join(thread: ulong, result: **void) ret int;
extern pthread_detach(thread: ulong) ret int;
extern pthread_self() ret ulong;
extern sched_yield() ret int;
extern sysconf(name: int) ret long;
extern __bpl_sleep_us(microseconds: long) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

# Shared between the spawning thread and the worker. The worker writes
# `panicked`/`message` before it exits; pthread_join orders those writes
# before the joiner reads them.
struct ThreadState {
    body: Lambda<void>(),
    panicked: bool,
    message: string,
}

frame _threadTrampoline(arg: *void) ret *void {
    local state: *ThreadState = cast<*ThreadState>(arg);
    local body: Lambda<void>() = state.body;
    try {
        body();
    } catch (error: string) {
        state.panicked = true;
        state.message = error;
    } catch {
        state.panicked = true;
        state.message = "thread entry threw a non-string value";
    }
    return nullptr;
}

frame _spawnState(state: *ThreadState) ret ulong {
    local handle: ulong = 0;
    local status: int = pthread_create(&handle, nullptr, _threadTrampoline, cast<*void>(state));
    if (status != 0) {
        free(cast<*void>(state));
        throw "Thread creation failed";
    }
    return handle;
}

/#
    Thread
    A handle to a native thread. Every spawned thread must be joined or
    detached exactly once; `join` and `detach` release the handle.
#/
struct Thread {
    handle: ulong,
    state: *ThreadState,
    finished: bool,
    /#
        Starts a thread that runs `body`. Throws when the thread cannot be
        created.
    #/
    frame spawn(body: Lambda<void>()) ret Thread {
        local state: *ThreadState = cast<*ThreadState>(malloc(sizeof<ThreadState>()));
        if (state == nullptr) {
            throw "Thread state allocation failed";
        }
        state.body = body;
        state.panicked = false;
        state.message = "";
        local thread: Thread;
        thread.state = state;
        thread.finished = false;
        thread.handle = _spawnState(state);
        return thread;
    }

    # Starts a thread that runs a plain function pointer.
    frame spawnFunc(body: Func<void>()) ret Thread {
        local wrapped: Lambda<void>() = cast<Lambda<void>()>(body);
        return Thread.spawn(wrapped);
    }

    /#
        Waits for the thread to finish. Returns true when the entry point
        returned normally and false when it threw (see `panicMessage`).
        Throws when the thread was already joined or detached.
    #/
    frame join(this: *Thread) ret bool {
        if (this.finished) {
            throw "Thread already joined or detached";
        }
        local status: int = pthread_join(this.handle, nullptr);
        this.finished = true;
        if (status != 0) {
            throw "Thread join failed";
        }
        return !this.state.panicked;
    }

    # True after `join` when the entry point threw.
    frame panicked(this: *Thread) ret bool {
        if (!this.finished || (this.state == nullptr)) {
            return false;
        }
        return this.state.panicked;
    }

    # The string the entry point threw, or "" when it did not throw.
    frame panicMessage(this: *Thread) ret string {
        if (!this.finished || (this.state == nullptr) || !this.state.panicked) {
            return "";
        }
        return this.state.message;
    }

    /#
        Lets the thread run to completion without being joined. Its state is
        intentionally not reclaimed, because the worker may still read it.
    #/
    frame detach(this: *Thread) {
        if (this.finished) {
            throw "Thread already joined or detached";
        }
        pthread_detach(this.handle);
        this.finished = true;
        this.state = nullptr;
    }

    # Releases the join state of a joined thread. Detached threads need no
    # destroy call.
    frame destroy(this: *Thread) {
        if (this.finished && (this.state != nullptr)) {
            free(cast<*void>(this.state));
            this.state = nullptr;
        }
    }

    # The native thread identifier of this handle.
    frame id(this: *Thread) ret ulong {
        return this.handle;
    }

    # The native identifier of the calling thread.
    frame currentId() ret ulong {
        return pthread_self();
    }

    # Suspends the calling thread for at least `ms` milliseconds.
    frame sleepMs(ms: long) {
        if (ms > cast<long>(0)) {
            __bpl_sleep_us(ms * 1000);
        }
    }

    # Suspends the calling thread for at least `us` microseconds.
    frame sleepUs(us: long) {
        if (us > cast<long>(0)) {
            __bpl_sleep_us(us);
        }
    }

    # Offers the processor to another runnable thread.
    frame yieldNow() {
        sched_yield();
    }

    # The number of online processors, or 1 when it cannot be determined.
    frame hardwareConcurrency() ret int {
        # _SC_NPROCESSORS_ONLN is 84 on Linux and 58 on Apple platforms.
        local count: long = sysconf(84);
        if (count <= cast<long>(0)) {
            count = sysconf(58);
        }
        if ((count <= cast<long>(0)) || (count > cast<long>(65536))) {
            return 1;
        }
        return cast<int>(count);
    }
}

# Result slot of a JoinHandle<T>; lives on the heap so the worker can write
# it after `spawn` returned.
struct JoinSlot<T> {
    work: Lambda<T>(),
    value: T,
}

/#
    JoinHandle<T>
    Runs a value-producing `Lambda<T>()` on a new thread and returns the value
    from `join`. `join` rethrows the worker's string exception message.
#/
struct JoinHandle<T> {
    thread: Thread,
    slot: *JoinSlot<T>,
    frame spawn(work: Lambda<T>()) ret JoinHandle<T> {
        local slot: *JoinSlot<T> = cast<*JoinSlot<T>>(malloc(sizeof<JoinSlot<T>>()));
        if (slot == nullptr) {
            throw "Thread state allocation failed";
        }
        slot.work = work;
        local body: Lambda<void>() = || {
            local run: Lambda<T>() = slot.work;
            slot.value = run();
        };
        local handle: JoinHandle<T>;
        handle.slot = slot;
        try {
            handle.thread = Thread.spawn(body);
        } catch (error: string) {
            free(cast<*void>(slot));
            throw error;
        }
        return handle;
    }

    /#
        Waits for the worker and returns its value. Throws the worker's
        exception message when it threw. The handle is released either way.
    #/
    frame join(this: *JoinHandle<T>) ret T {
        local ok: bool = this.thread.join();
        local message: string = this.thread.panicMessage();
        this.thread.destroy();
        local value: T = this.slot.value;
        free(cast<*void>(this.slot));
        this.slot = nullptr;
        if (!ok) {
            throw message;
        }
        return value;
    }

    # The native identifier of the worker thread.
    frame id(this: *JoinHandle<T>) ret ulong {
        return this.thread.handle;
    }
}
