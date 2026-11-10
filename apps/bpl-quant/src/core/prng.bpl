# Deterministic pseudo-random number generators.
#
# Xoshiro256** is the main generator. SplitMix64 seeds it, so a single 64-bit
# seed always produces the same stream on every platform and optimization
# level. Normal variates use the Marsaglia polar method with a cached spare.

import [Math] from "std/math.bpl";

export [SplitMix64];
export [Xoshiro];
export [Pcg32];

struct SplitMix64 {
    state: u64,

    frame new(seed: u64) ret SplitMix64 {
        return SplitMix64 { state: seed };
    }

    frame next(this: *SplitMix64) ret u64 {
        this.state = this.state + 0x9E3779B97F4A7C15;
        local z: u64 = this.state;
        z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9;
        z = (z ^ (z >> 27)) * 0x94D049BB133111EB;
        return z ^ (z >> 31);
    }
}

struct Xoshiro {
    s0: u64,
    s1: u64,
    s2: u64,
    s3: u64,
    has_spare: bool,
    spare: float,

    frame new(seed: u64) ret Xoshiro {
        local sm: SplitMix64 = SplitMix64.new(seed);
        local r: Xoshiro;
        r.s0 = sm.next();
        r.s1 = sm.next();
        r.s2 = sm.next();
        r.s3 = sm.next();
        r.has_spare = false;
        r.spare = 0.0;
        return r;
    }

    frame rotl(x: u64, k: int) ret u64 {
        local kk: u64 = cast<u64>(k);
        return (x << kk) | (x >> (cast<u64>(64) - kk));
    }

    frame nextU64(this: *Xoshiro) ret u64 {
        local result: u64 = Xoshiro.rotl(this.s1 * cast<u64>(5), 7) * cast<u64>(9);
        local t: u64 = this.s1 << cast<u64>(17);
        this.s2 = this.s2 ^ this.s0;
        this.s3 = this.s3 ^ this.s1;
        this.s1 = this.s1 ^ this.s2;
        this.s0 = this.s0 ^ this.s3;
        this.s2 = this.s2 ^ t;
        this.s3 = Xoshiro.rotl(this.s3, 45);
        return result;
    }

    # Advances the stream by 2^128 calls: gives independent sub-streams.
    frame jump(this: *Xoshiro) {
        local table: u64[4] = [0x180EC6D33CFD0ABA, 0xD5A61266F0C9392C, 0xA9582618E03FC9AA, 0x39ABDC4529B1661C];
        local a0: u64 = cast<u64>(0);
        local a1: u64 = cast<u64>(0);
        local a2: u64 = cast<u64>(0);
        local a3: u64 = cast<u64>(0);
        loop (local i: int = 0; i < 4; i = i + 1) {
            loop (local b: int = 0; b < 64; b = b + 1) {
                local bit: u64 = cast<u64>(1) << cast<u64>(b);
                if ((table[i] & bit) != cast<u64>(0)) {
                    a0 = a0 ^ this.s0;
                    a1 = a1 ^ this.s1;
                    a2 = a2 ^ this.s2;
                    a3 = a3 ^ this.s3;
                }
                this.nextU64();
            }
        }
        this.s0 = a0;
        this.s1 = a1;
        this.s2 = a2;
        this.s3 = a3;
        this.has_spare = false;
    }

    # Uniform double in [0, 1) using the top 53 bits.
    frame nextFloat(this: *Xoshiro) ret float {
        local bits: u64 = this.nextU64() >> cast<u64>(11);
        return cast<float>(bits) * (1.0 / 9007199254740992.0);
    }

    # Uniform double in (0, 1): never returns zero, safe for log().
    frame nextOpenFloat(this: *Xoshiro) ret float {
        local bits: u64 = this.nextU64() >> cast<u64>(12);
        return (cast<float>(bits) + 0.5) * (1.0 / 4503599627370496.0);
    }

    frame uniform(this: *Xoshiro, lo: float, hi: float) ret float {
        return lo + ((hi - lo) * this.nextFloat());
    }

    # Unbiased integer in [0, bound) by rejection sampling.
    frame nextBounded(this: *Xoshiro, bound: u64) ret u64 {
        if (bound == cast<u64>(0)) {
            return cast<u64>(0);
        }
        local threshold: u64 = (cast<u64>(0) - bound) % bound;
        loop {
            local r: u64 = this.nextU64();
            if (r >= threshold) {
                return r % bound;
            }
        }
        return cast<u64>(0);
    }

    frame range(this: *Xoshiro, lo: int, hi: int) ret int {
        if (hi <= lo) {
            return lo;
        }
        local span: u64 = cast<u64>(cast<long>(hi) - cast<long>(lo));
        return lo + cast<int>(this.nextBounded(span));
    }

    frame chance(this: *Xoshiro, p: float) ret bool {
        return this.nextFloat() < p;
    }

    # Standard normal variate (Marsaglia polar method).
    frame normal(this: *Xoshiro) ret float {
        if (this.has_spare) {
            this.has_spare = false;
            return this.spare;
        }
        loop {
            local u: float = (this.nextFloat() * 2.0) - 1.0;
            local v: float = (this.nextFloat() * 2.0) - 1.0;
            local s: float = (u * u) + (v * v);
            if ((s > 0.0) && (s < 1.0)) {
                local m: float = Math.sqrt((-2.0 * Math.log(s)) / s);
                this.spare = v * m;
                this.has_spare = true;
                return u * m;
            }
        }
        return 0.0;
    }

    frame gaussian(this: *Xoshiro, mean: float, stddev: float) ret float {
        return mean + (stddev * this.normal());
    }

    frame exponential(this: *Xoshiro, rate: float) ret float {
        return -Math.log(this.nextOpenFloat()) / rate;
    }

    # Knuth's algorithm for small means, normal approximation for large ones.
    frame poisson(this: *Xoshiro, lambda: float) ret int {
        if (lambda > 30.0) {
            local x: float = this.gaussian(lambda, Math.sqrt(lambda));
            if (x < 0.0) {
                return 0;
            }
            return cast<int>(Math.round(x));
        }
        local limit: float = Math.exp(-lambda);
        local k: int = 0;
        local p: float = 1.0;
        loop {
            p = p * this.nextFloat();
            if (p <= limit) {
                return k;
            }
            k = k + 1;
        }
        return k;
    }

    # Fisher-Yates shuffle of an int buffer.
    frame shuffle(this: *Xoshiro, data: *int, count: int) {
        local i: int = count - 1;
        loop (i > 0) {
            local j: int = cast<int>(this.nextBounded(cast<u64>(i + 1)));
            local tmp: int = data[i];
            data[i] = data[j];
            data[j] = tmp;
            i = i - 1;
        }
    }
}

# PCG32 (XSH-RR): a second, independent generator used to cross-check streams.
struct Pcg32 {
    state: u64,
    inc: u64,

    frame new(seed: u64, sequence: u64) ret Pcg32 {
        local p: Pcg32 = Pcg32 { state: cast<u64>(0), inc: (sequence << cast<u64>(1)) | cast<u64>(1) };
        p.next();
        p.state = p.state + seed;
        p.next();
        return p;
    }

    frame next(this: *Pcg32) ret u32 {
        local old: u64 = this.state;
        this.state = (old * 6364136223846793005) + this.inc;
        local xorshifted: u32 = cast<u32>(((old >> cast<u64>(18)) ^ old) >> cast<u64>(27));
        local rot: u32 = cast<u32>(old >> cast<u64>(59));
        return (xorshifted >> rot) | (xorshifted << ((cast<u32>(0) - rot) & cast<u32>(31)));
    }

    frame nextFloat(this: *Pcg32) ret float {
        return cast<float>(this.next()) / 4294967296.0;
    }
}
