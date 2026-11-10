import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("bpl-cache evicts least recently used entries within entry and byte limits", () => {
  native(String.raw`
    import [Cache] from "bpl-cache";
    import [Array] from "std/array.bpl";
    import [Option] from "std/option.bpl";
    import [String] from "std/string.bpl";
    extern strcmp(a: string, b: string) ret int;
    frame value(cache: *Cache, key: string) ret string {
        local found: Option<string> = cache.get(key);
        if (!found.isSome()) {
            return "<none>";
        }
        return found.unwrap();
    }
    frame main() ret int {
        local cache: Cache = Cache.new(3, 1000);
        cache.set("a", "1");
        cache.set("b", "2");
        cache.set("c", "3");
        # Touch "a" so "b" is now the least recently used.
        if (strcmp(value(&cache, "a"), "1") != 0) { return 1; }
        cache.set("d", "4");
        if (cache.has("b") || !cache.has("a") || cache.size() != 3) { return 2; }
        local order: Array<string> = cache.keys();
        if (order.len() != 3 || strcmp(order.get(0), "d") != 0 || strcmp(order.get(1), "a") != 0 || strcmp(order.get(2), "c") != 0) { return 3; }
        order.destroy();
        # Replacing keeps one entry per key and refreshes recency.
        cache.set("c", "three");
        if (cache.size() != 3 || strcmp(value(&cache, "c"), "three") != 0 || cache.byteSize() != 7) { return 4; }
        if (cache.stats.evictions != 1) { return 5; }
        if (!cache.delete("a") || cache.delete("a") || cache.size() != 2) { return 6; }
        cache.destroy();

        local bytes: Cache = Cache.new(100, 10);
        bytes.set("x", "12345");
        bytes.set("y", "12345");
        bytes.set("z", "1");
        if (bytes.has("x") || !bytes.has("y") || !bytes.has("z") || bytes.byteSize() != 6) { return 7; }
        if (bytes.set("big", "12345678901")) { return 8; }
        if (bytes.has("big") || bytes.size() != 2) { return 9; }
        # Binary values keep their length, including embedded NULs.
        if (!bytes.setBytes("bin", "a\0b", 3, 0)) { return 10; }
        local size: long = 0;
        local raw: string = bytes.getBytes("bin", &size);
        if (size != 3 || raw[2] != 'b') { return 11; }
        local copy: Option<String> = bytes.getCopy("z");
        local text: String = copy.unwrap();
        bytes.clear();
        if (bytes.size() != 0 || bytes.byteSize() != 0 || strcmp(text.data, "1") != 0) { return 12; }
        text.destroy();
        bytes.set("user:1", "a");
        bytes.set("user:2", "b");
        bytes.set("post:1", "c");
        if (bytes.deletePrefix("user:") != 2 || bytes.size() != 1 || !bytes.has("post:1")) { return 13; }
        bytes.destroy();

        local caught: int = 0;
        try { Cache.new(0, 1); } catch { caught = caught + 1; }
        try { Cache.new(1, 0); } catch { caught = caught + 1; }
        if (caught != 2) { return 14; }
        return 0;
    }
  `);
}, 90000);

test("bpl-cache expires entries with a pluggable clock and computes misses", () => {
  native(String.raw`
    import [Cache] from "bpl-cache";
    import [String] from "std/string.bpl";
    extern strcmp(a: string, b: string) ret int;
    global NOW: long = 1000;
    global CALLS: int = 0;
    frame clock() ret long {
        return NOW;
    }
    frame render(key: string) ret String {
        CALLS = CALLS + 1;
        return String.new(key);
    }
    frame main() ret int {
        local cache: Cache = Cache.new(10, 1000);
        cache.setClock(clock);
        cache.setFor("short", "s", 100);
        cache.set("forever", "f");
        cache.setDefaultTtl(500);
        cache.set("default", "d");
        if (cache.ttl("short") != 100 || cache.ttl("forever") != 0 || cache.ttl("default") != 500 || cache.ttl("none") != -1) { return 1; }
        NOW = 1099;
        if (!cache.has("short")) { return 2; }
        NOW = 1100;
        if (cache.has("short") || cache.get("short").isSome()) { return 3; }
        if (cache.stats.expirations != 1 || cache.size() != 2) { return 4; }
        NOW = 2000;
        if (cache.prune() != 1 || !cache.has("forever") || cache.size() != 1) { return 5; }
        local first: string = cache.getOrCompute("page:/", 50, render);
        local second: string = cache.getOrCompute("page:/", 50, render);
        if (strcmp(first, "page:/") != 0 || strcmp(second, "page:/") != 0 || CALLS != 1) { return 6; }
        NOW = 2050;
        cache.getOrCompute("page:/", 50, render);
        if (CALLS != 2) { return 7; }
        local hits: long = cache.stats.hits;
        local misses: long = cache.stats.misses;
        if (hits != 1 || misses != 3) { return 8; }
        local caught: bool = false;
        try { cache.setFor("k", "v", -1); } catch { caught = true; }
        if (!caught) { return 9; }
        cache.destroy();
        return 0;
    }
  `);
}, 90000);
