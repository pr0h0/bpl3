# Synchronization primitives for std/thread.bpl.
#
# Atomics (`AtomicInt`, `AtomicLong`, `AtomicBool`) lower to LLVM atomic
# instructions with sequentially consistent ordering. `Mutex`, `RwLock` and
# `Condvar` wrap POSIX threads objects held on the heap, so copying a handle
# shares the same lock; call `destroy` once, after every thread is done with
# it. `Once`, `Semaphore`, `WaitGroup`, `Barrier`, `SpinLock` and the bounded
# `Channel<T>` are built from those.
#
# Share primitives between threads by pointer (capture `*Mutex`, not a
# `Mutex` copy, for atomics). Native-only: WebAssembly has no pthreads.

export [AtomicInt];
export [AtomicLong];
export [AtomicBool];
export [SpinLock];
export [Mutex];
export [RwLock];
export [Condvar];
export [Once];
export [Semaphore];
export [WaitGroup];
export [Barrier];
export [Channel];
export fence;

import [Option] from "std/option.bpl";

extern pthread_mutex_init(mutex: *void, attr: *void) ret int;
extern pthread_mutex_destroy(mutex: *void) ret int;
extern pthread_mutex_lock(mutex: *void) ret int;
extern pthread_mutex_trylock(mutex: *void) ret int;
extern pthread_mutex_unlock(mutex: *void) ret int;
extern pthread_cond_init(cond: *void, attr: *void) ret int;
extern pthread_cond_destroy(cond: *void) ret int;
extern pthread_cond_wait(cond: *void, mutex: *void) ret int;
extern pthread_cond_signal(cond: *void) ret int;
extern pthread_cond_broadcast(cond: *void) ret int;
extern pthread_rwlock_init(lock: *void, attr: *void) ret int;
extern pthread_rwlock_destroy(lock: *void) ret int;
extern pthread_rwlock_rdlock(lock: *void) ret int;
extern pthread_rwlock_tryrdlock(lock: *void) ret int;
extern pthread_rwlock_wrlock(lock: *void) ret int;
extern pthread_rwlock_trywrlock(lock: *void) ret int;
extern pthread_rwlock_unlock(lock: *void) ret int;
extern sched_yield() ret int;
extern malloc(size: long) ret *void;
extern calloc(count: long, size: long) ret *void;
extern free(ptr: *void) ret void;

# Opaque pthread object storage. The largest supported layout is the Apple
# pthread_rwlock_t (200 bytes); Linux objects need at most 56.
global _SYNC_OBJECT_BYTES: long = 256;

frame _syncAlloc() ret *void {
    local storage: *void = calloc(1, _SYNC_OBJECT_BYTES);
    if (storage == nullptr) {
        throw "Synchronization object allocation failed";
    }
    return storage;
}

# A full sequentially consistent memory fence.
frame fence() {
    asm("llvm") {
        "fence seq_cst"
    }
}

/#
    AtomicInt
    A 32-bit integer updated with atomic instructions. Every `fetch*`
    operation returns the value held before the update.
#/
struct AtomicInt {
    value: int,
    frame new(initial: int) ret AtomicInt {
        return AtomicInt { value: initial };
    }

    frame load(this: *AtomicInt) ret int {
        local cell: *int = &this.value;
        local result: int = 0;
        asm("llvm") {
            "%atomic_loaded = load atomic i32, ptr (cell) seq_cst, align 4"
            "store i32 %atomic_loaded, ptr (result)"
        }
        return result;
    }

    frame store(this: *AtomicInt, value: int) {
        local cell: *int = &this.value;
        asm("llvm") {
            "%atomic_value = load i32, ptr (value)"
            "store atomic i32 %atomic_value, ptr (cell) seq_cst, align 4"
        }
    }

    frame swap(this: *AtomicInt, value: int) ret int {
        local cell: *int = &this.value;
        local result: int = 0;
        asm("llvm") {
            "%atomic_value = load i32, ptr (value)"
            "%atomic_old = atomicrmw xchg ptr (cell), i32 %atomic_value seq_cst"
            "store i32 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchAdd(this: *AtomicInt, delta: int) ret int {
        local cell: *int = &this.value;
        local result: int = 0;
        asm("llvm") {
            "%atomic_value = load i32, ptr (delta)"
            "%atomic_old = atomicrmw add ptr (cell), i32 %atomic_value seq_cst"
            "store i32 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchSub(this: *AtomicInt, delta: int) ret int {
        local cell: *int = &this.value;
        local result: int = 0;
        asm("llvm") {
            "%atomic_value = load i32, ptr (delta)"
            "%atomic_old = atomicrmw sub ptr (cell), i32 %atomic_value seq_cst"
            "store i32 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchAnd(this: *AtomicInt, mask: int) ret int {
        local cell: *int = &this.value;
        local result: int = 0;
        asm("llvm") {
            "%atomic_value = load i32, ptr (mask)"
            "%atomic_old = atomicrmw and ptr (cell), i32 %atomic_value seq_cst"
            "store i32 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchOr(this: *AtomicInt, mask: int) ret int {
        local cell: *int = &this.value;
        local result: int = 0;
        asm("llvm") {
            "%atomic_value = load i32, ptr (mask)"
            "%atomic_old = atomicrmw or ptr (cell), i32 %atomic_value seq_cst"
            "store i32 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchXor(this: *AtomicInt, mask: int) ret int {
        local cell: *int = &this.value;
        local result: int = 0;
        asm("llvm") {
            "%atomic_value = load i32, ptr (mask)"
            "%atomic_old = atomicrmw xor ptr (cell), i32 %atomic_value seq_cst"
            "store i32 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchMax(this: *AtomicInt, value: int) ret int {
        local cell: *int = &this.value;
        local result: int = 0;
        asm("llvm") {
            "%atomic_value = load i32, ptr (value)"
            "%atomic_old = atomicrmw max ptr (cell), i32 %atomic_value seq_cst"
            "store i32 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchMin(this: *AtomicInt, value: int) ret int {
        local cell: *int = &this.value;
        local result: int = 0;
        asm("llvm") {
            "%atomic_value = load i32, ptr (value)"
            "%atomic_old = atomicrmw min ptr (cell), i32 %atomic_value seq_cst"
            "store i32 %atomic_old, ptr (result)"
        }
        return result;
    }

    /#
        Stores `desired` when the current value equals `expected`. Returns the
        value observed before the operation; the exchange happened exactly
        when that equals `expected`.
    #/
    frame compareExchange(this: *AtomicInt, expected: int, desired: int) ret int {
        local cell: *int = &this.value;
        local result: int = 0;
        asm("llvm") {
            "%atomic_expected = load i32, ptr (expected)"
            "%atomic_desired = load i32, ptr (desired)"
            "%atomic_pair = cmpxchg ptr (cell), i32 %atomic_expected, i32 %atomic_desired seq_cst seq_cst"
            "%atomic_old = extractvalue { i32, i1 } %atomic_pair, 0"
            "store i32 %atomic_old, ptr (result)"
        }
        return result;
    }

    # Stores `desired` when the value equals `expected`; returns whether it did.
    frame compareAndSet(this: *AtomicInt, expected: int, desired: int) ret bool {
        return this.compareExchange(expected, desired) == expected;
    }

    # Adds one and returns the new value.
    frame increment(this: *AtomicInt) ret int {
        return this.fetchAdd(1) + 1;
    }

    # Subtracts one and returns the new value.
    frame decrement(this: *AtomicInt) ret int {
        return this.fetchSub(1) - 1;
    }

    # Applies `update` in a compare-and-set loop and returns the new value.
    frame update(this: *AtomicInt, transform: Lambda<int>(int)) ret int {
        loop {
            local current: int = this.load();
            local next: int = transform(current);
            if (this.compareAndSet(current, next)) {
                return next;
            }
        }
        return 0;
    }
}

/#
    AtomicLong
    A 64-bit integer updated with atomic instructions.
#/
struct AtomicLong {
    value: long,
    frame new(initial: long) ret AtomicLong {
        return AtomicLong { value: initial };
    }

    frame load(this: *AtomicLong) ret long {
        local cell: *long = &this.value;
        local result: long = 0;
        asm("llvm") {
            "%atomic_loaded = load atomic i64, ptr (cell) seq_cst, align 8"
            "store i64 %atomic_loaded, ptr (result)"
        }
        return result;
    }

    frame store(this: *AtomicLong, value: long) {
        local cell: *long = &this.value;
        asm("llvm") {
            "%atomic_value = load i64, ptr (value)"
            "store atomic i64 %atomic_value, ptr (cell) seq_cst, align 8"
        }
    }

    frame swap(this: *AtomicLong, value: long) ret long {
        local cell: *long = &this.value;
        local result: long = 0;
        asm("llvm") {
            "%atomic_value = load i64, ptr (value)"
            "%atomic_old = atomicrmw xchg ptr (cell), i64 %atomic_value seq_cst"
            "store i64 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchAdd(this: *AtomicLong, delta: long) ret long {
        local cell: *long = &this.value;
        local result: long = 0;
        asm("llvm") {
            "%atomic_value = load i64, ptr (delta)"
            "%atomic_old = atomicrmw add ptr (cell), i64 %atomic_value seq_cst"
            "store i64 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchSub(this: *AtomicLong, delta: long) ret long {
        local cell: *long = &this.value;
        local result: long = 0;
        asm("llvm") {
            "%atomic_value = load i64, ptr (delta)"
            "%atomic_old = atomicrmw sub ptr (cell), i64 %atomic_value seq_cst"
            "store i64 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchAnd(this: *AtomicLong, mask: long) ret long {
        local cell: *long = &this.value;
        local result: long = 0;
        asm("llvm") {
            "%atomic_value = load i64, ptr (mask)"
            "%atomic_old = atomicrmw and ptr (cell), i64 %atomic_value seq_cst"
            "store i64 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchOr(this: *AtomicLong, mask: long) ret long {
        local cell: *long = &this.value;
        local result: long = 0;
        asm("llvm") {
            "%atomic_value = load i64, ptr (mask)"
            "%atomic_old = atomicrmw or ptr (cell), i64 %atomic_value seq_cst"
            "store i64 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame fetchXor(this: *AtomicLong, mask: long) ret long {
        local cell: *long = &this.value;
        local result: long = 0;
        asm("llvm") {
            "%atomic_value = load i64, ptr (mask)"
            "%atomic_old = atomicrmw xor ptr (cell), i64 %atomic_value seq_cst"
            "store i64 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame compareExchange(this: *AtomicLong, expected: long, desired: long) ret long {
        local cell: *long = &this.value;
        local result: long = 0;
        asm("llvm") {
            "%atomic_expected = load i64, ptr (expected)"
            "%atomic_desired = load i64, ptr (desired)"
            "%atomic_pair = cmpxchg ptr (cell), i64 %atomic_expected, i64 %atomic_desired seq_cst seq_cst"
            "%atomic_old = extractvalue { i64, i1 } %atomic_pair, 0"
            "store i64 %atomic_old, ptr (result)"
        }
        return result;
    }

    frame compareAndSet(this: *AtomicLong, expected: long, desired: long) ret bool {
        return this.compareExchange(expected, desired) == expected;
    }

    frame increment(this: *AtomicLong) ret long {
        return this.fetchAdd(1) + 1;
    }

    frame decrement(this: *AtomicLong) ret long {
        return this.fetchSub(1) - 1;
    }
}

/#
    AtomicBool
    A boolean flag updated atomically (stored as a 32-bit 0/1).
#/
struct AtomicBool {
    cell: AtomicInt,
    frame new(initial: bool) ret AtomicBool {
        local flag: AtomicBool;
        flag.cell = AtomicInt.new(0);
        if (initial) {
            flag.cell.value = 1;
        }
        return flag;
    }

    frame load(this: *AtomicBool) ret bool {
        return this.cell.load() != 0;
    }

    frame store(this: *AtomicBool, value: bool) {
        if (value) {
            this.cell.store(1);
        } else {
            this.cell.store(0);
        }
    }

    # Stores `value` and returns the previous flag.
    frame swap(this: *AtomicBool, value: bool) ret bool {
        if (value) {
            return this.cell.swap(1) != 0;
        }
        return this.cell.swap(0) != 0;
    }

    # Stores `desired` when the flag equals `expected`; returns whether it did.
    frame compareAndSet(this: *AtomicBool, expected: bool, desired: bool) ret bool {
        local expectedValue: int = 0;
        local desiredValue: int = 0;
        if (expected) {
            expectedValue = 1;
        }
        if (desired) {
            desiredValue = 1;
        }
        return this.cell.compareAndSet(expectedValue, desiredValue);
    }
}

/#
    SpinLock
    A busy-waiting lock for very short critical sections. Prefer `Mutex`
    when a section may block or run long.
#/
struct SpinLock {
    state: AtomicInt,
    frame new() ret SpinLock {
        local lock: SpinLock;
        lock.state = AtomicInt.new(0);
        return lock;
    }

    frame lock(this: *SpinLock) {
        loop (!this.state.compareAndSet(0, 1)) {
            sched_yield();
        }
    }

    frame tryLock(this: *SpinLock) ret bool {
        return this.state.compareAndSet(0, 1);
    }

    frame unlock(this: *SpinLock) {
        this.state.store(0);
    }
}

/#
    Mutex
    A mutual-exclusion lock. Unlock it from the thread that locked it.
#/
struct Mutex {
    handle: *void,
    frame new() ret Mutex {
        local mutex: Mutex;
        mutex.handle = _syncAlloc();
        if (pthread_mutex_init(mutex.handle, nullptr) != 0) {
            free(mutex.handle);
            throw "Mutex initialization failed";
        }
        return mutex;
    }

    frame lock(this: *Mutex) {
        if (pthread_mutex_lock(this.handle) != 0) {
            throw "Mutex lock failed";
        }
    }

    # Locks without waiting; returns whether the lock was acquired.
    frame tryLock(this: *Mutex) ret bool {
        return pthread_mutex_trylock(this.handle) == 0;
    }

    frame unlock(this: *Mutex) {
        if (pthread_mutex_unlock(this.handle) != 0) {
            throw "Mutex unlock failed";
        }
    }

    # Runs `action` while holding the lock, unlocking even when it throws.
    frame withLock(this: *Mutex, action: Lambda<void>()) {
        this.lock();
        local handle: *void = this.handle;
        defer pthread_mutex_unlock(handle);
        action();
    }

    frame destroy(this: *Mutex) {
        if (this.handle != nullptr) {
            pthread_mutex_destroy(this.handle);
            free(this.handle);
            this.handle = nullptr;
        }
    }
}

/#
    RwLock
    Many readers or one writer.
#/
struct RwLock {
    handle: *void,
    frame new() ret RwLock {
        local lock: RwLock;
        lock.handle = _syncAlloc();
        if (pthread_rwlock_init(lock.handle, nullptr) != 0) {
            free(lock.handle);
            throw "RwLock initialization failed";
        }
        return lock;
    }

    frame readLock(this: *RwLock) {
        if (pthread_rwlock_rdlock(this.handle) != 0) {
            throw "RwLock read lock failed";
        }
    }

    frame tryReadLock(this: *RwLock) ret bool {
        return pthread_rwlock_tryrdlock(this.handle) == 0;
    }

    frame writeLock(this: *RwLock) {
        if (pthread_rwlock_wrlock(this.handle) != 0) {
            throw "RwLock write lock failed";
        }
    }

    frame tryWriteLock(this: *RwLock) ret bool {
        return pthread_rwlock_trywrlock(this.handle) == 0;
    }

    # Releases a read or write lock held by the calling thread.
    frame unlock(this: *RwLock) {
        if (pthread_rwlock_unlock(this.handle) != 0) {
            throw "RwLock unlock failed";
        }
    }

    frame destroy(this: *RwLock) {
        if (this.handle != nullptr) {
            pthread_rwlock_destroy(this.handle);
            free(this.handle);
            this.handle = nullptr;
        }
    }
}

/#
    Condvar
    A condition variable used together with a `Mutex`. `wait` may wake
    spuriously; always re-check the condition in a loop.
#/
struct Condvar {
    handle: *void,
    frame new() ret Condvar {
        local condvar: Condvar;
        condvar.handle = _syncAlloc();
        if (pthread_cond_init(condvar.handle, nullptr) != 0) {
            free(condvar.handle);
            throw "Condvar initialization failed";
        }
        return condvar;
    }

    # Atomically unlocks `mutex` and waits; the mutex is locked again on return.
    frame wait(this: *Condvar, mutex: *Mutex) {
        if (pthread_cond_wait(this.handle, mutex.handle) != 0) {
            throw "Condvar wait failed";
        }
    }

    # Waits until `ready` returns true; `mutex` must be locked by the caller.
    frame waitUntil(this: *Condvar, mutex: *Mutex, ready: Lambda<bool>()) {
        loop (!ready()) {
            this.wait(mutex);
        }
    }

    frame notifyOne(this: *Condvar) {
        pthread_cond_signal(this.handle);
    }

    frame notifyAll(this: *Condvar) {
        pthread_cond_broadcast(this.handle);
    }

    frame destroy(this: *Condvar) {
        if (this.handle != nullptr) {
            pthread_cond_destroy(this.handle);
            free(this.handle);
            this.handle = nullptr;
        }
    }
}

/#
    Once
    Runs an initializer exactly once even when many threads call `call`.
    Callers that lose the race wait until the initializer finished. If the
    initializer throws, the Once returns to its initial state and the
    exception propagates to that caller.
#/
struct Once {
    state: AtomicInt,
    frame new() ret Once {
        local once: Once;
        once.state = AtomicInt.new(0);
        return once;
    }

    frame call(this: *Once, init: Lambda<void>()) {
        loop {
            local current: int = this.state.load();
            if (current == 2) {
                return;
            }
            if ((current == 0) && this.state.compareAndSet(0, 1)) {
                try {
                    init();
                } catch (error: string) {
                    this.state.store(0);
                    throw error;
                }
                this.state.store(2);
                return;
            }
            sched_yield();
        }
    }

    frame isCompleted(this: *Once) ret bool {
        return this.state.load() == 2;
    }
}

/#
    Semaphore
    A counting semaphore.
#/
struct Semaphore {
    mutex: Mutex,
    condvar: Condvar,
    permits: *int,
    frame new(permits: int) ret Semaphore {
        if (permits < 0) {
            throw "Semaphore permits must be non-negative";
        }
        local semaphore: Semaphore;
        semaphore.permits = cast<*int>(malloc(sizeof<int>()));
        if (semaphore.permits == nullptr) {
            throw "Semaphore allocation failed";
        }
        *semaphore.permits = permits;
        semaphore.mutex = Mutex.new();
        semaphore.condvar = Condvar.new();
        return semaphore;
    }

    # Waits for a permit and takes it.
    frame acquire(this: *Semaphore) {
        this.mutex.lock();
        loop (*this.permits <= 0) {
            this.condvar.wait(&this.mutex);
        }
        *this.permits = *this.permits - 1;
        this.mutex.unlock();
    }

    # Takes a permit without waiting; returns whether one was available.
    frame tryAcquire(this: *Semaphore) ret bool {
        this.mutex.lock();
        local taken: bool = false;
        if (*this.permits > 0) {
            *this.permits = *this.permits - 1;
            taken = true;
        }
        this.mutex.unlock();
        return taken;
    }

    frame release(this: *Semaphore) {
        this.mutex.lock();
        *this.permits = *this.permits + 1;
        this.mutex.unlock();
        this.condvar.notifyOne();
    }

    frame available(this: *Semaphore) ret int {
        this.mutex.lock();
        local count: int = *this.permits;
        this.mutex.unlock();
        return count;
    }

    frame destroy(this: *Semaphore) {
        this.mutex.destroy();
        this.condvar.destroy();
        if (this.permits != nullptr) {
            free(cast<*void>(this.permits));
            this.permits = nullptr;
        }
    }
}

/#
    WaitGroup
    Waits for a collection of tasks: `add(n)` before starting them, `done()`
    as each finishes, and `wait()` until the count reaches zero.
#/
struct WaitGroup {
    mutex: Mutex,
    condvar: Condvar,
    count: *int,
    frame new() ret WaitGroup {
        local group: WaitGroup;
        group.count = cast<*int>(malloc(sizeof<int>()));
        if (group.count == nullptr) {
            throw "WaitGroup allocation failed";
        }
        *group.count = 0;
        group.mutex = Mutex.new();
        group.condvar = Condvar.new();
        return group;
    }

    frame add(this: *WaitGroup, delta: int) {
        this.mutex.lock();
        local next: int = *this.count + delta;
        if (next < 0) {
            this.mutex.unlock();
            throw "WaitGroup counter went negative";
        }
        *this.count = next;
        this.mutex.unlock();
        if (next == 0) {
            this.condvar.notifyAll();
        }
    }

    frame done(this: *WaitGroup) {
        this.add(-1);
    }

    frame wait(this: *WaitGroup) {
        this.mutex.lock();
        loop (*this.count > 0) {
            this.condvar.wait(&this.mutex);
        }
        this.mutex.unlock();
    }

    frame destroy(this: *WaitGroup) {
        this.mutex.destroy();
        this.condvar.destroy();
        if (this.count != nullptr) {
            free(cast<*void>(this.count));
            this.count = nullptr;
        }
    }
}

struct _BarrierState {
    parties: int,
    waiting: int,
    generation: long,
}

/#
    Barrier
    Blocks `parties` threads until all of them have called `wait`, then
    releases them together. Reusable. `wait` returns true for exactly one
    thread per generation (the last to arrive).
#/
struct Barrier {
    mutex: Mutex,
    condvar: Condvar,
    state: *_BarrierState,
    frame new(parties: int) ret Barrier {
        if (parties < 1) {
            throw "Barrier needs at least one party";
        }
        local barrier: Barrier;
        barrier.state = cast<*_BarrierState>(malloc(sizeof<_BarrierState>()));
        if (barrier.state == nullptr) {
            throw "Barrier allocation failed";
        }
        barrier.state.parties = parties;
        barrier.state.waiting = 0;
        barrier.state.generation = 0;
        barrier.mutex = Mutex.new();
        barrier.condvar = Condvar.new();
        return barrier;
    }

    frame wait(this: *Barrier) ret bool {
        this.mutex.lock();
        local generation: long = this.state.generation;
        this.state.waiting = this.state.waiting + 1;
        if (this.state.waiting == this.state.parties) {
            this.state.waiting = 0;
            this.state.generation = generation + 1;
            this.mutex.unlock();
            this.condvar.notifyAll();
            return true;
        }
        loop (this.state.generation == generation) {
            this.condvar.wait(&this.mutex);
        }
        this.mutex.unlock();
        return false;
    }

    frame destroy(this: *Barrier) {
        this.mutex.destroy();
        this.condvar.destroy();
        if (this.state != nullptr) {
            free(cast<*void>(this.state));
            this.state = nullptr;
        }
    }
}

struct _ChannelState<T> {
    buffer: *T,
    capacity: int,
    head: int,
    length: int,
    closed: bool,
}

/#
    Channel<T>
    A bounded multi-producer multi-consumer FIFO queue. `send` blocks while
    the channel is full and `recv` while it is empty. After `close`, sends
    fail and receivers drain the remaining values, then get `None`.
#/
struct Channel<T> {
    mutex: Mutex,
    notEmpty: Condvar,
    notFull: Condvar,
    state: *_ChannelState<T>,
    frame new(capacity: int) ret Channel<T> {
        if (capacity < 1) {
            throw "Channel capacity must be positive";
        }
        local channel: Channel<T>;
        channel.state = cast<*_ChannelState<T>>(malloc(sizeof<_ChannelState<T>>()));
        if (channel.state == nullptr) {
            throw "Channel allocation failed";
        }
        channel.state.buffer = cast<*T>(malloc(cast<long>(capacity) * sizeof<T>()));
        if (channel.state.buffer == nullptr) {
            free(cast<*void>(channel.state));
            throw "Channel allocation failed";
        }
        channel.state.capacity = capacity;
        channel.state.head = 0;
        channel.state.length = 0;
        channel.state.closed = false;
        channel.mutex = Mutex.new();
        channel.notEmpty = Condvar.new();
        channel.notFull = Condvar.new();
        return channel;
    }

    # Waits for space and enqueues `value`. Returns false when the channel
    # is closed (the value is not enqueued).
    frame send(this: *Channel<T>, value: T) ret bool {
        this.mutex.lock();
        loop ((this.state.length == this.state.capacity) && !this.state.closed) {
            this.notFull.wait(&this.mutex);
        }
        if (this.state.closed) {
            this.mutex.unlock();
            return false;
        }
        this._push(value);
        this.mutex.unlock();
        this.notEmpty.notifyOne();
        return true;
    }

    # Enqueues without waiting; false when full or closed.
    frame trySend(this: *Channel<T>, value: T) ret bool {
        this.mutex.lock();
        if (this.state.closed || (this.state.length == this.state.capacity)) {
            this.mutex.unlock();
            return false;
        }
        this._push(value);
        this.mutex.unlock();
        this.notEmpty.notifyOne();
        return true;
    }

    # Waits for a value. Returns None once the channel is closed and empty.
    frame recv(this: *Channel<T>) ret Option<T> {
        this.mutex.lock();
        loop ((this.state.length == 0) && !this.state.closed) {
            this.notEmpty.wait(&this.mutex);
        }
        if (this.state.length == 0) {
            this.mutex.unlock();
            return Option<T>.None;
        }
        local value: T = this._pop();
        this.mutex.unlock();
        this.notFull.notifyOne();
        return Option<T>.Some(value);
    }

    # Dequeues without waiting; None when empty.
    frame tryRecv(this: *Channel<T>) ret Option<T> {
        this.mutex.lock();
        if (this.state.length == 0) {
            this.mutex.unlock();
            return Option<T>.None;
        }
        local value: T = this._pop();
        this.mutex.unlock();
        this.notFull.notifyOne();
        return Option<T>.Some(value);
    }

    # Closes the channel and wakes every waiting sender and receiver.
    frame close(this: *Channel<T>) {
        this.mutex.lock();
        this.state.closed = true;
        this.mutex.unlock();
        this.notEmpty.notifyAll();
        this.notFull.notifyAll();
    }

    frame isClosed(this: *Channel<T>) ret bool {
        this.mutex.lock();
        local closed: bool = this.state.closed;
        this.mutex.unlock();
        return closed;
    }

    # The number of queued values.
    frame len(this: *Channel<T>) ret int {
        this.mutex.lock();
        local length: int = this.state.length;
        this.mutex.unlock();
        return length;
    }

    frame capacity(this: *Channel<T>) ret int {
        return this.state.capacity;
    }

    frame _push(this: *Channel<T>, value: T) {
        local tail: int = (this.state.head + this.state.length) % this.state.capacity;
        this.state.buffer[tail] = value;
        this.state.length = this.state.length + 1;
    }

    frame _pop(this: *Channel<T>) ret T {
        local value: T = this.state.buffer[this.state.head];
        this.state.head = (this.state.head + 1) % this.state.capacity;
        this.state.length = this.state.length - 1;
        return value;
    }

    # Releases the channel. Every thread must be done with it. Queued
    # values are not destroyed.
    frame destroy(this: *Channel<T>) {
        this.mutex.destroy();
        this.notEmpty.destroy();
        this.notFull.destroy();
        if (this.state != nullptr) {
            free(cast<*void>(this.state.buffer));
            free(cast<*void>(this.state));
            this.state = nullptr;
        }
    }
}
