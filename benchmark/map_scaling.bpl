# Run at O3; timings cover each operation phase rather than compilation.
import [Map] from "std/map.bpl";
import [Time] from "std/time.bpl";
extern printf(fmt: string, ...);

frame measure(count: int) {
    local map: Map<int, int> = Map<int, int>.new();
    local start: long = Time.nowUs();
    loop (local i: int = 0; i < count; i = i + 1) { map.set(i, i); }
    local insertUs: long = Time.nowUs() - start;
    start = Time.nowUs();
    local hits: int = 0;
    loop (local i: int = 0; i < count; i = i + 1) {
        if (map.has(i)) { hits = hits + 1; }
    }
    local hitUs: long = Time.nowUs() - start;
    start = Time.nowUs();
    local misses: int = 0;
    loop (local i: int = count; i < count * 2; i = i + 1) {
        if (!map.has(i)) { misses = misses + 1; }
    }
    local missUs: long = Time.nowUs() - start;
    printf("entries=%d buckets=%d hits=%d misses=%d insert_us=%ld hit_us=%ld miss_us=%ld\n",
        map.size(), map.bucketCount(), hits, misses, insertUs, hitUs, missUs);
    map.destroy();
}

frame main() ret int {
    measure(1000);
    measure(10000);
    measure(100000);
    return 0;
}
