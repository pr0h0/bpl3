# Deterministic PCG32 generator (fixed stream 54)

export [Rand];
export [SplitMix64];
export [Xoshiro256];

import [Array] from "std/array.bpl";
import [Math] from "std/math.bpl";

extern time(ptr: *long) ret long;

struct Rand {
    state: ulong,

    frame seed(seed: ulong) ret Rand {
        local r: Rand;
        r.state = cast<ulong>(0);
        r.nextUInt();
        r.state = r.state + seed;
        r.nextUInt();
        return r;
    }

    frame seedFromTime() ret Rand {
        local t: long = 0;
        time(&t);
        return Rand.seed(cast<ulong>(t));
    }

    frame nextInt(this: *Rand) ret int {
        return cast<int>(this.nextUInt());
    }

    # PCG-XSH-RR: 64-bit state, 32-bit permuted output, fixed odd stream.
    frame nextUInt(this: *Rand) ret uint {
        local previous: ulong = this.state;
        this.state = (previous * 6364136223846793005) + cast<ulong>(109);
        local mixed: uint = cast<uint>(((previous >> 18) ^ previous) >> 27);
        local rotation: uint = cast<uint>(previous >> 59);
        return (mixed >> rotation) | (mixed << ((cast<uint>(0) - rotation) & cast<uint>(31)));
    }

    frame nextLong(this: *Rand) ret long {
        local high: long = cast<long>(this.nextInt());
        local low: long = cast<long>(this.nextInt());
        return (high << cast<long>(32)) | (low & cast<long>(0xFFFFFFFF));
    }

    frame nextFloat(this: *Rand) ret float {
        # Every unsigned 32-bit value maps exactly into [0, 1).
        return cast<float>(this.nextUInt()) / 4294967296.0;
    }

    frame nextBool(this: *Rand) ret bool {
        return (this.nextInt() & 1) == 1;
    }

    frame range(this: *Rand, min: int, max: int) ret int {
        if (max <= min) {
            return min;
        }
        local span: ulong = cast<ulong>(cast<long>(max) - cast<long>(min));
        local domain: ulong = cast<ulong>(0x100000000);
        local limit: ulong = domain - (domain % span);
        local value: ulong = cast<ulong>(this.nextUInt());
        loop (value >= limit) {
            value = cast<ulong>(this.nextUInt());
        }
        return cast<int>(cast<long>(min) + cast<long>(value % span));
    }

    frame range(this: *Rand, min: float, max: float) ret float {
        if (max <= min) {
            return min;
        }
        local fraction: float = this.nextFloat();
        # A convex combination avoids overflow in max-min for opposite signs.
        return (min * (1.0 - fraction)) + (max * fraction);
    }

    # Box-Muller transform; reject zero instead of clipping the distribution.
    frame nextGaussian(this: *Rand) ret float {
        local u1: float = this.nextFloat();
        loop (u1 == 0.0) {
            u1 = this.nextFloat();
        }
        local u2: float = this.nextFloat();
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(6.283185307179586 * u2);
    }

    # Shuffle an array of integers in place
    frame shuffleInt(this: *Rand, arr: *Array<int>) {
        local n: int = arr.len();
        local i: int = n - 1;
        loop (i > 0) {
            local j: int = this.range(0, i + 1);
            local temp: int = arr.get(i);
            arr.set(i, arr.get(j));
            arr.set(j, temp);
            i = i - 1;
        }
    }

    # Pick a random element from an array of integers
    frame choiceInt(this: *Rand, arr: *Array<int>) ret int {
        local n: int = arr.len();
        if (n == 0)
            return 0;
        local idx: int = this.range(0, n);
        return arr.get(idx);
    }

    # Shuffles the elements of any array in place (Fisher-Yates). It draws
    # the same numbers as `shuffleInt`, so a seeded generator gives the same
    # order for the same length.
    frame shuffle<T>(this: *Rand, arr: *Array<T>) {
        local i: int = arr.len() - 1;
        loop (i > 0) {
            local j: int = this.range(0, i + 1);
            local temp: T = arr.get(i);
            arr.set(i, arr.get(j));
            arr.set(j, temp);
            i = i - 1;
        }
    }

    # Stores a random element of `arr` in `output` and returns true, or
    # returns false, leaving `output` unchanged, when the array is empty.
    frame choice<T>(this: *Rand, arr: *Array<T>, output: *T) ret bool {
        local n: int = arr.len();
        if (n == 0) {
            return false;
        }
        *output = arr.get(this.range(0, n));
        return true;
    }

    # Generate random bytes into a buffer
    frame fillBytes(this: *Rand, buf: *u8, len: int) {
        local i: int = 0;
        loop (i < len) {
            buf[i] = cast<u8>(this.nextInt() & 0xFF);
            i = i + 1;
        }
    }

    # Weighted random selection (returns index)
    frame weightedChoice(this: *Rand, weights: *Array<int>) ret int {
        local total: int = 0;
        local n: int = weights.len();
        local i: int = 0;
        loop (i < n) {
            local weight: int = weights.get(i);
            if (weight < 0) {
                throw "Rand.weightedChoice requires nonnegative weights";
            }
            # Validate before addition so overflow cannot select a zero-weight
            # entry. Invalid input must not advance the generator state.
            if (weight > (2147483647 - total)) {
                throw "Rand.weightedChoice total exceeds int";
            }
            total = total + weight;
            i = i + 1;
        }

        if (total == 0) {
            throw "Rand.weightedChoice requires a positive total";
        }
        local target: int = this.range(0, total);
        local cumulative: int = 0;
        i = 0;
        loop (i < n) {
            cumulative = cumulative + weights.get(i);
            if (target < cumulative) {
                return i;
            }
            i = i + 1;
        }
        return n - 1;
    }
    # A uniform value in [0, bound) without modulo bias. Throws for bound 0.
    frame nextBelow(this: *Rand, bound: ulong) ret ulong {
        if (bound == cast<ulong>(0)) {
            throw "Rand.nextBelow requires a positive bound";
        }
        local limit: ulong = (cast<ulong>(0) - bound) % bound;
        loop {
            local value: ulong = cast<ulong>(this.nextLong());
            # Reject the first (2^64 mod bound) values so every residue is
            # equally likely.
            if (value >= limit) {
                return value % bound;
            }
        }
        return 0;
    }

    # A uniform long in [min, max); returns min when max <= min.
    frame rangeLong(this: *Rand, min: long, max: long) ret long {
        if (max <= min) {
            return min;
        }
        local span: ulong = cast<ulong>(max) - cast<ulong>(min);
        return cast<long>(cast<ulong>(min) + this.nextBelow(span));
    }

    # A double in [0, 1) using 53 random bits (every representable step).
    frame nextUnit(this: *Rand) ret float {
        local bits: ulong = cast<ulong>(this.nextLong()) >> cast<ulong>(11);
        return cast<float>(bits) / 9007199254740992.0;
    }

    # True with probability `p` (clamped to [0, 1]).
    frame nextBernoulli(this: *Rand, p: float) ret bool {
        if (p <= 0.0) {
            return false;
        }
        if (p >= 1.0) {
            return true;
        }
        return this.nextUnit() < p;
    }

    # Normal distribution with the given mean and standard deviation.
    frame nextNormal(this: *Rand, mean: float, stddev: float) ret float {
        return mean + (stddev * this.nextGaussian());
    }

    # Exponential distribution with rate `lambda` (> 0); mean 1 / lambda.
    frame nextExponential(this: *Rand, lambda: float) ret float {
        if (lambda <= 0.0) {
            throw "Rand.nextExponential requires a positive rate";
        }
        local u: float = this.nextUnit();
        loop (u == 0.0) {
            u = this.nextUnit();
        }
        return -Math.log(u) / lambda;
    }

    # Poisson-distributed count with the given mean (>= 0). Uses Knuth's
    # product method below 30 and a rounded normal approximation above.
    frame nextPoisson(this: *Rand, mean: float) ret int {
        if (mean <= 0.0) {
            return 0;
        }
        if (mean >= 30.0) {
            local approx: float = Math.round(this.nextNormal(mean, Math.sqrt(mean)));
            if (approx < 0.0) {
                return 0;
            }
            return cast<int>(approx);
        }
        local threshold: float = Math.exp(-mean);
        local count: int = 0;
        local product: float = this.nextUnit();
        loop (product > threshold) {
            count = count + 1;
            product = product * this.nextUnit();
        }
        return count;
    }

    # Number of successes in `trials` Bernoulli(p) draws.
    frame nextBinomial(this: *Rand, trials: int, p: float) ret int {
        local successes: int = 0;
        loop (local i: int = 0; i < trials; i = i + 1) {
            if (this.nextBernoulli(p)) {
                successes = successes + 1;
            }
        }
        return successes;
    }

    # Picks `count` distinct elements in random order (all of them when
    # `count` exceeds the length). The caller owns the result.
    frame sample<T>(this: *Rand, arr: *Array<T>, count: int) ret Array<T> {
        local pool: Array<T> = arr.clone();
        local n: int = pool.len();
        if (count > n) {
            count = n;
        }
        if (count < 0) {
            count = 0;
        }
        # Partial Fisher-Yates: the first `count` slots become the sample.
        loop (local i: int = 0; i < count; i = i + 1) {
            local j: int = this.range(i, n);
            local temp: T = pool.data[i];
            pool.data[i] = pool.data[j];
            pool.data[j] = temp;
        }
        pool.length = count;
        return pool;
    }
}

/#
    SplitMix64
    A tiny 64-bit generator (Steele, Lea and Flood). Every seed is valid; it
    is mainly used to expand one seed into the state of larger generators.
#/
struct SplitMix64 {
    state: ulong,
    frame seed(seed: ulong) ret SplitMix64 {
        return SplitMix64 { state: seed };
    }

    frame next(this: *SplitMix64) ret ulong {
        this.state = this.state + cast<ulong>(0x9E3779B97F4A7C15);
        local z: ulong = this.state;
        z = (z ^ (z >> cast<ulong>(30))) * cast<ulong>(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> cast<ulong>(27))) * cast<ulong>(0x94D049BB133111EB);
        return z ^ (z >> cast<ulong>(31));
    }
}

/#
    Xoshiro256
    xoshiro256** by Blackman and Vigna: a fast, high-quality 64-bit
    generator with period 2^256 - 1. Not cryptographically secure.
#/
struct Xoshiro256 {
    s0: ulong,
    s1: ulong,
    s2: ulong,
    s3: ulong,
    # Expands `seed` with SplitMix64, as the authors recommend.
    frame seed(seed: ulong) ret Xoshiro256 {
        local mixer: SplitMix64 = SplitMix64.seed(seed);
        local generator: Xoshiro256;
        generator.s0 = mixer.next();
        generator.s1 = mixer.next();
        generator.s2 = mixer.next();
        generator.s3 = mixer.next();
        return generator;
    }

    frame _rotl(value: ulong, count: ulong) ret ulong {
        return (value << count) | (value >> (cast<ulong>(64) - count));
    }

    frame nextULong(this: *Xoshiro256) ret ulong {
        local result: ulong = Xoshiro256._rotl(this.s1 * cast<ulong>(5), 7) * cast<ulong>(9);
        local t: ulong = this.s1 << cast<ulong>(17);
        this.s2 = this.s2 ^ this.s0;
        this.s3 = this.s3 ^ this.s1;
        this.s1 = this.s1 ^ this.s2;
        this.s0 = this.s0 ^ this.s3;
        this.s2 = this.s2 ^ t;
        this.s3 = Xoshiro256._rotl(this.s3, 45);
        return result;
    }

    frame nextLong(this: *Xoshiro256) ret long {
        return cast<long>(this.nextULong());
    }

    frame nextUInt(this: *Xoshiro256) ret uint {
        return cast<uint>(this.nextULong() >> cast<ulong>(32));
    }

    # A double in [0, 1) from the top 53 bits.
    frame nextFloat(this: *Xoshiro256) ret float {
        return cast<float>(this.nextULong() >> cast<ulong>(11)) / 9007199254740992.0;
    }

    frame nextBool(this: *Xoshiro256) ret bool {
        return (this.nextULong() >> cast<ulong>(63)) == cast<ulong>(1);
    }

    # A uniform value in [0, bound) without modulo bias. Throws for bound 0.
    frame nextBelow(this: *Xoshiro256, bound: ulong) ret ulong {
        if (bound == cast<ulong>(0)) {
            throw "Xoshiro256.nextBelow requires a positive bound";
        }
        local limit: ulong = (cast<ulong>(0) - bound) % bound;
        loop {
            local value: ulong = this.nextULong();
            if (value >= limit) {
                return value % bound;
            }
        }
        return 0;
    }

    # A uniform int in [min, max); returns min when max <= min.
    frame range(this: *Xoshiro256, min: int, max: int) ret int {
        if (max <= min) {
            return min;
        }
        local span: ulong = cast<ulong>(cast<long>(max) - cast<long>(min));
        return cast<int>(cast<long>(min) + cast<long>(this.nextBelow(span)));
    }

    # Advances the state by 2^128 steps; use to create non-overlapping
    # streams for parallel work.
    frame jump(this: *Xoshiro256) {
        local constants: ulong[4] = [cast<ulong>(0x180EC6D33CFD0ABA), cast<ulong>(0xD5A61266F0C9392C), cast<ulong>(0xA9582618E03FC9AA), cast<ulong>(0x39ABDC4529B1661C)];
        local a: ulong = 0;
        local b: ulong = 0;
        local c: ulong = 0;
        local d: ulong = 0;
        loop (local i: int = 0; i < 4; i = i + 1) {
            loop (local bit: int = 0; bit < 64; bit = bit + 1) {
                if (((constants[i] >> cast<ulong>(bit)) & cast<ulong>(1)) != cast<ulong>(0)) {
                    a = a ^ this.s0;
                    b = b ^ this.s1;
                    c = c ^ this.s2;
                    d = d ^ this.s3;
                }
                this.nextULong();
            }
        }
        this.s0 = a;
        this.s1 = b;
        this.s2 = c;
        this.s3 = d;
    }

    # Shuffles an array in place (Fisher-Yates).
    frame shuffle<T>(this: *Xoshiro256, arr: *Array<T>) {
        local i: int = arr.len() - 1;
        loop (i > 0) {
            local j: int = this.range(0, i + 1);
            local temp: T = arr.data[i];
            arr.data[i] = arr.data[j];
            arr.data[j] = temp;
            i = i - 1;
        }
    }
}
