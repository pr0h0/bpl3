import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const HEADER = `
import [Thread], [JoinHandle] from "std/thread.bpl";
import [AtomicInt], [AtomicLong], [AtomicBool], [SpinLock], [Mutex], [RwLock], [Condvar], [Once], [Semaphore], [WaitGroup], [Barrier], [Channel], fence from "std/sync.bpl";
import [Option] from "std/option.bpl";
extern printf(fmt: string, ...);
`;

it("updates atomics with every read-modify-write operation", () => {
  expectCorrectnessSuite([
    {
      name: "atomic operations",
      validateLlvm: true,
      expectedStdout: [
        "int 5 7 7 6 7 7",
        "bits 12 8 15 6",
        "minmax 6 9 2",
        "cas 2 2 false 2 true 9",
        "inc 10 9 18",
        "long 4294967296 4294967306 4294967296 1",
        "bool false true true false true",
        "",
      ].join("\n"),
      source: `${HEADER}
      frame main() ret int {
        local a: AtomicInt = AtomicInt.new(5);
        local first: int = a.fetchAdd(2);
        local second: int = a.load();
        local third: int = a.fetchSub(5);
        a.store(6);
        local swapped: int = a.swap(7);
        printf("int %d %d %d %d %d %d\\n", first, second, third, swapped, a.load(), a.fetchSub(4));
        local b: AtomicInt = AtomicInt.new(12);
        local andOld: int = b.fetchAnd(10);
        local orOld: int = b.fetchOr(7);
        local xorOld: int = b.fetchXor(9);
        printf("bits %d %d %d %d\\n", andOld, orOld, xorOld, b.load());
        local c: AtomicInt = AtomicInt.new(6);
        local maxOld: int = c.fetchMax(9);
        local minOld: int = c.fetchMin(2);
        printf("minmax %d %d %d\\n", maxOld, minOld, c.load());
        local seen: int = c.compareExchange(2, 2);
        local seenValue: int = c.load();
        local failed: bool = c.compareAndSet(5, 1);
        local kept: int = c.load();
        local ok: bool = c.compareAndSet(2, 9);
        printf("cas %d %d %s %d %s %d\\n", seen, seenValue, failed ? "true" : "false", kept, ok ? "true" : "false", c.load());
        local inc: int = c.increment();
        local dec: int = c.decrement();
        local doubled: int = c.update(|value: int| ret int { return value * 2; });
        printf("inc %d %d %d\\n", inc, dec, doubled);
        local l: AtomicLong = AtomicLong.new(cast<long>(4294967296));
        local lOld: long = l.fetchAdd(cast<long>(10));
        local lNow: long = l.load();
        local lSwap: long = l.compareExchange(lNow, cast<long>(4294967296));
        printf("long %ld %ld %ld %d\\n", lOld, lSwap, l.load(), l.compareAndSet(cast<long>(4294967296), cast<long>(1)));
        local flag: AtomicBool = AtomicBool.new(false);
        local initial: bool = flag.load();
        local previous: bool = flag.swap(true);
        flag.store(true);
        fence();
        printf("bool %s %s %s %s %s\\n", initial ? "true" : "false", flag.load() ? "true" : "false", flag.compareAndSet(true, false) ? "true" : "false", previous ? "true" : "false", flag.compareAndSet(false, true) ? "true" : "false");
        return 0;
      }
    `,
    },
  ]);
}, 120000);

it("counts concurrently under atomics, mutexes, spin locks and rw locks", () => {
  expectCorrectnessSuite([
    {
      name: "thread counters",
      validateLlvm: true,
      expectedStdout: "40000 40000 40000 40000 readers 4\n",
      source: `${HEADER}
      frame main() ret int {
        local counter: AtomicInt = AtomicInt.new(0);
        local cp: *AtomicInt = &counter;
        local mutex: Mutex = Mutex.new();
        local mp: *Mutex = &mutex;
        local spin: SpinLock = SpinLock.new();
        local sp: *SpinLock = &spin;
        local rw: RwLock = RwLock.new();
        local rp: *RwLock = &rw;
        local values: int[3];
        local vp: *int = &values[0];
        values[0] = 0; values[1] = 0; values[2] = 0;
        local readers: AtomicInt = AtomicInt.new(0);
        local readersPtr: *AtomicInt = &readers;
        local threads: Thread[4];
        loop (local i: int = 0; i < 4; i = i + 1) {
          threads[i] = Thread.spawn(|| {
            loop (local j: int = 0; j < 10000; j = j + 1) {
              cp.fetchAdd(1);
              mp.withLock(|| { vp[0] = vp[0] + 1; });
              sp.lock();
              vp[1] = vp[1] + 1;
              sp.unlock();
              rp.writeLock();
              vp[2] = vp[2] + 1;
              rp.unlock();
            }
            rp.readLock();
            readersPtr.increment();
            rp.unlock();
          });
        }
        loop (local i: int = 0; i < 4; i = i + 1) {
          if (!threads[i].join()) { return 1; }
          threads[i].destroy();
        }
        if (!rw.tryReadLock()) { return 2; }
        rw.unlock();
        if (!mutex.tryLock()) { return 3; }
        mutex.unlock();
        printf("%d %d %d %d readers %d\\n", counter.load(), values[0], values[1], values[2], readers.load());
        mutex.destroy();
        rw.destroy();
        return 0;
      }
    `,
    },
  ]);
}, 120000);

it("joins values, reports thrown entries, and rejects double joins", () => {
  expectCorrectnessSuite([
    {
      name: "thread results",
      validateLlvm: true,
      expectedStdout: [
        "value 42",
        "rethrown worker failed",
        "joined false boom",
        "double join Thread already joined or detached",
        "func ran 1",
        "ids differ true",
        "",
      ].join("\n"),
      source: `${HEADER}
      global FUNC_HITS: int = 0;
      frame bump() { FUNC_HITS = FUNC_HITS + 1; }
      frame main() ret int {
        local h: JoinHandle<long> = JoinHandle<long>.spawn(|| ret long { return cast<long>(6) * 7; });
        printf("value %ld\\n", h.join());
        local failing: JoinHandle<int> = JoinHandle<int>.spawn(|| ret int { throw "worker failed"; });
        try {
          failing.join();
          return 1;
        } catch (message: string) {
          printf("rethrown %s\\n", message);
        }
        local bad: Thread = Thread.spawn(|| { throw "boom"; });
        local ok: bool = bad.join();
        printf("joined %s %s\\n", ok ? "true" : "false", bad.panicMessage());
        try {
          bad.join();
          return 2;
        } catch (message: string) {
          printf("double join %s\\n", message);
        }
        bad.destroy();
        local f: Thread = Thread.spawnFunc(bump);
        f.join();
        f.destroy();
        printf("func ran %d\\n", FUNC_HITS);
        local main_id: ulong = Thread.currentId();
        local worker: JoinHandle<ulong> = JoinHandle<ulong>.spawn(|| ret ulong { Thread.yieldNow(); Thread.sleepMs(cast<long>(1)); return Thread.currentId(); });
        local worker_id: ulong = worker.join();
        printf("ids differ %s\\n", (worker_id != main_id) ? "true" : "false");
        if (Thread.hardwareConcurrency() < 1) { return 3; }
        return 0;
      }
    `,
    },
  ]);
}, 120000);

it("coordinates producers and consumers with channels and waiters", () => {
  expectCorrectnessSuite([
    {
      name: "channel and coordination",
      validateLlvm: true,
      expectedStdout: [
        "sum 20100 received 200",
        "closed true send false recv none",
        "try true true false 1 2",
        "waitgroup 8",
        "barrier leaders 1 after 3",
        "semaphore max 2 available 2",
        "once 1 true",
        "condvar 7",
        "",
      ].join("\n"),
      source: `${HEADER}
      frame main() ret int {
        local ch: Channel<int> = Channel<int>.new(3);
        local chp: *Channel<int> = &ch;
        local producers: Thread[2];
        loop (local p: int = 0; p < 2; p = p + 1) {
          local base: int = p * 100;
          producers[p] = Thread.spawn(|| {
            loop (local k: int = 1; k <= 100; k = k + 1) { chp.send(base + k); }
          });
        }
        local total: AtomicInt = AtomicInt.new(0);
        local count: AtomicInt = AtomicInt.new(0);
        local tp: *AtomicInt = &total;
        local countPtr: *AtomicInt = &count;
        local consumers: Thread[2];
        loop (local c: int = 0; c < 2; c = c + 1) {
          consumers[c] = Thread.spawn(|| {
            loop {
              local v: Option<int> = chp.recv();
              if (v.isNone()) { break; }
              tp.fetchAdd(v.unwrap());
              countPtr.increment();
            }
          });
        }
        loop (local p: int = 0; p < 2; p = p + 1) { producers[p].join(); producers[p].destroy(); }
        ch.close();
        loop (local c: int = 0; c < 2; c = c + 1) { consumers[c].join(); consumers[c].destroy(); }
        printf("sum %d received %d\\n", total.load(), count.load());
        printf("closed %s send %s recv %s\\n", ch.isClosed() ? "true" : "false", ch.send(1) ? "true" : "false", ch.recv().isNone() ? "none" : "some");
        ch.destroy();

        local small: Channel<int> = Channel<int>.new(2);
        local t1: bool = small.trySend(1);
        local t2: bool = small.trySend(2);
        local t3: bool = small.trySend(3);
        printf("try %s %s %s %d %d\\n", t1 ? "true" : "false", t2 ? "true" : "false", t3 ? "true" : "false", small.tryRecv().unwrap(), small.recv().unwrap());
        if (small.tryRecv().isSome() || (small.len() != 0) || (small.capacity() != 2)) { return 1; }
        small.destroy();

        local group: WaitGroup = WaitGroup.new();
        local gp: *WaitGroup = &group;
        local finished: AtomicInt = AtomicInt.new(0);
        local fp: *AtomicInt = &finished;
        local workers: Thread[8];
        group.add(8);
        loop (local w: int = 0; w < 8; w = w + 1) {
          workers[w] = Thread.spawn(|| { fp.increment(); gp.done(); });
        }
        group.wait();
        printf("waitgroup %d\\n", finished.load());
        loop (local w: int = 0; w < 8; w = w + 1) { workers[w].join(); workers[w].destroy(); }
        group.destroy();

        local barrier: Barrier = Barrier.new(3);
        local bp: *Barrier = &barrier;
        local leaders: AtomicInt = AtomicInt.new(0);
        local arrived: AtomicInt = AtomicInt.new(0);
        local lp: *AtomicInt = &leaders;
        local ap: *AtomicInt = &arrived;
        local parties: Thread[3];
        loop (local b: int = 0; b < 3; b = b + 1) {
          parties[b] = Thread.spawn(|| {
            ap.increment();
            if (bp.wait()) { lp.increment(); }
          });
        }
        loop (local b: int = 0; b < 3; b = b + 1) { parties[b].join(); parties[b].destroy(); }
        printf("barrier leaders %d after %d\\n", leaders.load(), arrived.load());
        barrier.destroy();

        local sem: Semaphore = Semaphore.new(2);
        local semPtr: *Semaphore = &sem;
        local inside: AtomicInt = AtomicInt.new(0);
        local peak: AtomicInt = AtomicInt.new(0);
        local ip: *AtomicInt = &inside;
        local pk: *AtomicInt = &peak;
        local users: Thread[6];
        loop (local u: int = 0; u < 6; u = u + 1) {
          users[u] = Thread.spawn(|| {
            semPtr.acquire();
            local now: int = ip.increment();
            pk.fetchMax(now);
            Thread.sleepMs(cast<long>(2));
            ip.decrement();
            semPtr.release();
          });
        }
        loop (local u: int = 0; u < 6; u = u + 1) { users[u].join(); users[u].destroy(); }
        printf("semaphore max %d available %d\\n", peak.load(), sem.available());
        if (!sem.tryAcquire()) { return 2; }
        sem.release();
        sem.destroy();

        local once: Once = Once.new();
        local op: *Once = &once;
        local hits: AtomicInt = AtomicInt.new(0);
        local hp: *AtomicInt = &hits;
        local callers: Thread[4];
        loop (local o: int = 0; o < 4; o = o + 1) {
          callers[o] = Thread.spawn(|| { op.call(|| { hp.increment(); }); });
        }
        loop (local o: int = 0; o < 4; o = o + 1) { callers[o].join(); callers[o].destroy(); }
        printf("once %d %s\\n", hits.load(), once.isCompleted() ? "true" : "false");

        local m: Mutex = Mutex.new();
        local cv: Condvar = Condvar.new();
        local mp: *Mutex = &m;
        local cvp: *Condvar = &cv;
        local shared: int = 0;
        local sharedPtr: *int = &shared;
        local signaller: Thread = Thread.spawn(|| {
          mp.lock();
          *sharedPtr = 7;
          mp.unlock();
          cvp.notifyAll();
        });
        m.lock();
        cv.waitUntil(&m, || ret bool { return *sharedPtr != 0; });
        m.unlock();
        signaller.join();
        signaller.destroy();
        printf("condvar %d\\n", shared);
        m.destroy();
        cv.destroy();
        return 0;
      }
    `,
    },
  ]);
}, 180000);
