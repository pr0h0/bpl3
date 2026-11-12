# Threads and Synchronization

`std/thread.bpl` runs code on native POSIX threads, and `std/sync.bpl`
provides the primitives to coordinate them. Both are native-only: WebAssembly
targets have no pthread support. On Linux with glibc 2.34 or newer and on
macOS no extra link flag is needed; on older glibc pass `-l pthread`.

## Threads

`Thread.spawn` takes a `Lambda<void>()` and starts it on a new thread.
`Thread.spawnFunc` accepts a plain `Func<void>()`. Every thread must be joined
or detached exactly once. `join` returns `true` when the entry point returned
normally and `false` when it threw; the thrown string is available from
`panicMessage()`. An exception never unwinds out of the thread. After a join,
`destroy` releases the handle's shared state.

`JoinHandle<T>` runs a `Lambda<T>()` and returns its value from `join`. When
the worker throws a string, `join` throws that string in the joining thread.

<!-- bpl-doc: run=thread-spawn -->

```bpl
import [Thread], [JoinHandle] from "std/thread.bpl";
import [AtomicInt] from "std/sync.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local hits: AtomicInt = AtomicInt.new(0);
    local hitsPtr: *AtomicInt = &hits;
    local workers: Thread[4];
    loop (local i: int = 0; i < 4; i = i + 1) {
        workers[i] = Thread.spawn(|| {
            loop (local j: int = 0; j < 1000; j = j + 1) {
                hitsPtr.fetchAdd(1);
            }
        });
    }
    loop (local i: int = 0; i < 4; i = i + 1) {
        workers[i].join();
        workers[i].destroy();
    }
    local answer: JoinHandle<int> = JoinHandle<int>.spawn(|| ret int {
        return 6 * 7;
    });
    printf("%d %d\n", hits.load(), answer.join()); # 4000 42
    return 0;
}
```

Lambdas capture by value, so share state between threads through pointers, as
`hitsPtr` does above. A captured copy of an `AtomicInt` would be a separate
counter.

Other `Thread` helpers: `id()`, `Thread.currentId()`, `Thread.sleepMs(ms)`,
`Thread.sleepUs(us)`, `Thread.yieldNow()` and `Thread.hardwareConcurrency()`
(online processors, at least 1). `detach()` lets a thread finish on its own;
its state is then intentionally not reclaimed.

## Atomics

`AtomicInt` (32-bit), `AtomicLong` (64-bit) and `AtomicBool` lower to LLVM
atomic instructions with sequentially consistent ordering. They offer `load`,
`store`, `swap`, `compareExchange` (returns the observed value),
`compareAndSet` (returns whether it stored), `increment`/`decrement` (return
the new value) and the `fetchAdd`, `fetchSub`, `fetchAnd`, `fetchOr`,
`fetchXor` family (return the previous value). `AtomicInt` also has
`fetchMax`, `fetchMin` and `update(transform)`, a compare-and-set loop.
`fence()` is a full memory fence.

## Locks and waiting

| Type        | Purpose                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `Mutex`     | `lock`, `tryLock`, `unlock`, and `withLock(action)` which unlocks even when `action` throws |
| `RwLock`    | `readLock`/`writeLock` (and `try` forms), `unlock`                                          |
| `SpinLock`  | Busy-waiting lock for very short sections                                                   |
| `Condvar`   | `wait(mutex)`, `waitUntil(mutex, ready)`, `notifyOne`, `notifyAll`                          |
| `Once`      | `call(init)` runs `init` exactly once; a throwing `init` resets it                          |
| `Semaphore` | Counting semaphore: `acquire`, `tryAcquire`, `release`, `available`                         |
| `WaitGroup` | `add(n)`, `done()`, `wait()` until the count is zero                                        |
| `Barrier`   | `wait()` blocks until `parties` threads arrive; it returns true for one of them             |

`Mutex`, `RwLock` and `Condvar` hold their pthread object on the heap, so a
copy of the struct refers to the same lock. Call `destroy` once, after every
thread has finished using it. `Condvar.wait` may wake spuriously; use
`waitUntil` or re-check the condition in a loop.

## Channels

`Channel<T>.new(capacity)` is a bounded multi-producer, multi-consumer FIFO.
`send` waits while the channel is full and `recv` while it is empty. `close`
wakes every waiter: sends then return `false`, and receivers drain the queued
values before `recv` returns `None`. `trySend` and `tryRecv` never wait.

<!-- bpl-doc: run=thread-channel -->

```bpl
import [Thread] from "std/thread.bpl";
import [Channel] from "std/sync.bpl";
import [Option] from "std/option.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local channel: Channel<int> = Channel<int>.new(4);
    local channelPtr: *Channel<int> = &channel;
    local producer: Thread = Thread.spawn(|| {
        loop (local i: int = 1; i <= 10; i = i + 1) {
            channelPtr.send(i);
        }
        channelPtr.close();
    });
    local total: int = 0;
    loop {
        local value: Option<int> = channel.recv();
        if (value.isNone()) {
            break;
        }
        total = total + value.unwrap();
    }
    producer.join();
    producer.destroy();
    channel.destroy();
    printf("%d\n", total); # 55
    return 0;
}
```

Queued values are not destroyed by `Channel.destroy`; drain owned values first.
