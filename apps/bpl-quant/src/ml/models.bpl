# Statistical learning for return data.
#
# PCA of a return panel (eigen-decomposition of the correlation matrix),
# multi-factor OLS with standard errors and t-statistics, k-means with
# k-means++ seeding, logistic regression by iteratively reweighted least
# squares, bootstrap confidence intervals and Gaussian kernel density
# estimation with Silverman's bandwidth.

import malloc, free, memset from "std/c.bpl";
import [Math], PI from "std/math.bpl";
import [Matrix], [EigenResult] from "../math/matrix.bpl";
import [Stats] from "../math/stats.bpl";
import [Special] from "../math/special.bpl";
import [Sort] from "../math/sort.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [ReturnPanel], [Covariance] from "../risk/covariance.bpl";

export [Pca];
export [PcaResult];
export [Ols];
export [OlsResult];
export [KMeans];
export [KMeansResult];
export [Logistic];
export [LogisticResult];
export [Bootstrap];
export [Kde];

struct PcaResult {
    eigen: EigenResult,
    explained: *float,
    assets: int,

    frame destroy(this: *PcaResult) {
        this.eigen.destroy();
        free(cast<*void>(this.explained));
    }

    # Number of components needed to explain `share` of the variance.
    frame componentsFor(this: *PcaResult, share: float) ret int {
        local cum: float = 0.0;
        loop (local i: int = 0; i < this.assets; i = i + 1) {
            cum = cum + this.explained[i];
            if (cum >= (share - 0.0000000001)) {
                return i + 1;
            }
        }
        return this.assets;
    }
}

struct Pca {
    frame fit(panel: *ReturnPanel) ret PcaResult {
        local cov: Matrix = Covariance.sample(panel);
        local corr: Matrix = Covariance.toCorrelation(&cov);
        local r: PcaResult;
        r.eigen = corr.eigenSymmetric();
        r.assets = panel.assets;
        r.explained = cast<*float>(malloc(cast<long>(panel.assets) * sizeof(float)));
        local total: float = 0.0;
        loop (local i: int = 0; i < panel.assets; i = i + 1) {
            total = total + r.eigen.values[i];
        }
        loop (local i: int = 0; i < panel.assets; i = i + 1) {
            r.explained[i] = total > 0.0 ? r.eigen.values[i] / total : 0.0;
        }
        # Sign convention: make each loading vector sum positive.
        loop (local k: int = 0; k < panel.assets; k = k + 1) {
            local s: float = 0.0;
            loop (local i: int = 0; i < panel.assets; i = i + 1) {
                s = s + r.eigen.vectors.at(i, k);
            }
            if (s < 0.0) {
                loop (local i: int = 0; i < panel.assets; i = i + 1) {
                    r.eigen.vectors.put(i, k, -r.eigen.vectors.at(i, k));
                }
            }
        }
        cov.destroy();
        corr.destroy();
        return r;
    }
}

struct OlsResult {
    k: int,
    n: int,
    beta: *float,
    stderr: *float,
    tstat: *float,
    pvalue: *float,
    r2: float,
    adj_r2: float,
    sigma: float,
    f_stat: float,
    ok: bool,

    frame destroy(this: *OlsResult) {
        free(cast<*void>(this.beta));
        free(cast<*void>(this.stderr));
        free(cast<*void>(this.tstat));
        free(cast<*void>(this.pvalue));
    }
}

struct Ols {
    # y on [1, x_1, ..., x_m]; x is n x m row-major.
    frame fit(y: *float, x: *float, n: int, m: int) ret OlsResult {
        local k: int = m + 1;
        local r: OlsResult;
        r.k = k;
        r.n = n;
        r.beta = cast<*float>(malloc(cast<long>(k) * sizeof(float)));
        r.stderr = cast<*float>(malloc(cast<long>(k) * sizeof(float)));
        r.tstat = cast<*float>(malloc(cast<long>(k) * sizeof(float)));
        r.pvalue = cast<*float>(malloc(cast<long>(k) * sizeof(float)));
        r.ok = false;
        r.r2 = 0.0;
        r.adj_r2 = 0.0;
        r.sigma = 0.0;
        r.f_stat = 0.0;
        if (n <= k) {
            return r;
        }
        local design: Matrix = Matrix.new(n, k);
        loop (local i: int = 0; i < n; i = i + 1) {
            design.put(i, 0, 1.0);
            loop (local j: int = 0; j < m; j = j + 1) {
                design.put(i, j + 1, x[(i * m) + j]);
            }
        }
        if (!design.leastSquares(y, r.beta)) {
            design.destroy();
            return r;
        }
        local mean: float = Stats.mean(y, n);
        local sse: float = 0.0;
        local sst: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local fit: float = 0.0;
            loop (local j: int = 0; j < k; j = j + 1) {
                fit = fit + (design.at(i, j) * r.beta[j]);
            }
            sse = sse + ((y[i] - fit) * (y[i] - fit));
            sst = sst + ((y[i] - mean) * (y[i] - mean));
        }
        local dof: float = cast<float>(n - k);
        local s2: float = sse / dof;
        r.sigma = Math.sqrt(s2);
        r.r2 = sst > 0.0 ? 1.0 - (sse / sst) : 0.0;
        r.adj_r2 = 1.0 - (((1.0 - r.r2) * cast<float>(n - 1)) / dof);
        r.f_stat = (m > 0) && (r.r2 < 1.0) ? (r.r2 / cast<float>(m)) / ((1.0 - r.r2) / dof) : 0.0;
        local xt: Matrix = design.transpose();
        local xtx: Matrix = xt.mul(&design);
        local inv: Matrix;
        if (xtx.inverse(&inv)) {
            loop (local j: int = 0; j < k; j = j + 1) {
                local v: float = s2 * inv.at(j, j);
                r.stderr[j] = v > 0.0 ? Math.sqrt(v) : 0.0;
                r.tstat[j] = r.stderr[j] > 0.0 ? r.beta[j] / r.stderr[j] : 0.0;
                r.pvalue[j] = 2.0 * (1.0 - Special.studentTCdf(Math.abs(r.tstat[j]), dof));
            }
            inv.destroy();
            r.ok = true;
        }
        design.destroy();
        xt.destroy();
        xtx.destroy();
        return r;
    }
}

struct KMeansResult {
    k: int,
    dims: int,
    centers: *float,
    labels: *int,
    sizes: *int,
    inertia: float,
    iterations: int,

    frame destroy(this: *KMeansResult) {
        free(cast<*void>(this.centers));
        free(cast<*void>(this.labels));
        free(cast<*void>(this.sizes));
    }
}

struct KMeans {
    frame distance2(a: *float, b: *float, d: int) ret float {
        local s: float = 0.0;
        loop (local i: int = 0; i < d; i = i + 1) {
            local diff: float = a[i] - b[i];
            s = s + (diff * diff);
        }
        return s;
    }

    # points: n x d row-major.
    frame fit(points: *float, n: int, d: int, k: int, seed: u64, max_iter: int) ret KMeansResult {
        local r: KMeansResult;
        r.k = k;
        r.dims = d;
        r.centers = cast<*float>(malloc(cast<long>(k * d) * sizeof(float)));
        r.labels = cast<*int>(malloc(cast<long>(n) * sizeof(int)));
        r.sizes = cast<*int>(malloc(cast<long>(k) * sizeof(int)));
        local rng: Xoshiro = Xoshiro.new(seed);
        local dist: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        # k-means++ seeding.
        local first: int = rng.range(0, n);
        loop (local j: int = 0; j < d; j = j + 1) {
            r.centers[j] = points[(first * d) + j];
        }
        loop (local c: int = 1; c < k; c = c + 1) {
            local total: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                local best: float = 1000000000000000000.0;
                loop (local q: int = 0; q < c; q = q + 1) {
                    best = Math.min(best, KMeans.distance2(points + (i * d), r.centers + (q * d), d));
                }
                dist[i] = best;
                total = total + best;
            }
            local target: float = rng.nextFloat() * total;
            local pick: int = n - 1;
            local acc: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                acc = acc + dist[i];
                if (acc >= target) {
                    pick = i;
                    break;
                }
            }
            loop (local j: int = 0; j < d; j = j + 1) {
                r.centers[(c * d) + j] = points[(pick * d) + j];
            }
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            r.labels[i] = -1;
        }
        local it: int = 0;
        loop (it < max_iter) {
            it = it + 1;
            local changed: int = 0;
            loop (local i: int = 0; i < n; i = i + 1) {
                local best: int = 0;
                local best_d: float = KMeans.distance2(points + (i * d), r.centers, d);
                loop (local c: int = 1; c < k; c = c + 1) {
                    local dd: float = KMeans.distance2(points + (i * d), r.centers + (c * d), d);
                    if (dd < best_d) {
                        best_d = dd;
                        best = c;
                    }
                }
                if (r.labels[i] != best) {
                    r.labels[i] = best;
                    changed = changed + 1;
                }
            }
            memset(cast<*void>(r.centers), 0, cast<long>(k * d) * sizeof(float));
            loop (local c: int = 0; c < k; c = c + 1) {
                r.sizes[c] = 0;
            }
            loop (local i: int = 0; i < n; i = i + 1) {
                local c: int = r.labels[i];
                r.sizes[c] = r.sizes[c] + 1;
                loop (local j: int = 0; j < d; j = j + 1) {
                    r.centers[(c * d) + j] = r.centers[(c * d) + j] + points[(i * d) + j];
                }
            }
            loop (local c: int = 0; c < k; c = c + 1) {
                if (r.sizes[c] > 0) {
                    loop (local j: int = 0; j < d; j = j + 1) {
                        r.centers[(c * d) + j] = r.centers[(c * d) + j] / cast<float>(r.sizes[c]);
                    }
                }
            }
            if (changed == 0) {
                break;
            }
        }
        r.iterations = it;
        r.inertia = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            r.inertia = r.inertia + KMeans.distance2(points + (i * d), r.centers + (r.labels[i] * d), d);
        }
        free(cast<*void>(dist));
        return r;
    }
}

struct LogisticResult {
    k: int,
    beta: *float,
    log_likelihood: float,
    accuracy: float,
    iterations: int,
    converged: bool,

    frame destroy(this: *LogisticResult) {
        free(cast<*void>(this.beta));
    }

    frame predict(this: *LogisticResult, x: *float) ret float {
        local z: float = this.beta[0];
        loop (local j: int = 1; j < this.k; j = j + 1) {
            z = z + (this.beta[j] * x[j - 1]);
        }
        return 1.0 / (1.0 + Math.exp(-z));
    }
}

struct Logistic {
    # y in {0, 1}; x is n x m row-major; fits an intercept plus m slopes by IRLS.
    frame fit(y: *float, x: *float, n: int, m: int, max_iter: int) ret LogisticResult {
        local k: int = m + 1;
        local r: LogisticResult;
        r.k = k;
        r.beta = cast<*float>(malloc(cast<long>(k) * sizeof(float)));
        loop (local j: int = 0; j < k; j = j + 1) {
            r.beta[j] = 0.0;
        }
        r.converged = false;
        local h: Matrix = Matrix.new(k, k);
        local g: *float = cast<*float>(malloc(cast<long>(k) * sizeof(float)));
        local step: *float = cast<*float>(malloc(cast<long>(k) * sizeof(float)));
        local row: *float = cast<*float>(malloc(cast<long>(k) * sizeof(float)));
        local it: int = 0;
        loop (it < max_iter) {
            it = it + 1;
            loop (local a: int = 0; a < (k * k); a = a + 1) {
                h.data[a] = 0.0;
            }
            loop (local j: int = 0; j < k; j = j + 1) {
                g[j] = 0.0;
            }
            loop (local i: int = 0; i < n; i = i + 1) {
                row[0] = 1.0;
                loop (local j: int = 0; j < m; j = j + 1) {
                    row[j + 1] = x[(i * m) + j];
                }
                local p: float = r.predict(x + (i * m));
                local w: float = p * (1.0 - p);
                loop (local a: int = 0; a < k; a = a + 1) {
                    g[a] = g[a] + ((y[i] - p) * row[a]);
                    loop (local b: int = 0; b < k; b = b + 1) {
                        h.addAt(a, b, w * row[a] * row[b]);
                    }
                }
            }
            # Small ridge keeps separable data from diverging.
            loop (local a: int = 0; a < k; a = a + 1) {
                h.addAt(a, a, 0.000001);
            }
            if (!h.solve(g, step)) {
                break;
            }
            local change: float = 0.0;
            loop (local j: int = 0; j < k; j = j + 1) {
                r.beta[j] = r.beta[j] + step[j];
                change = change + Math.abs(step[j]);
            }
            if (change < 0.000000001) {
                r.converged = true;
                break;
            }
        }
        r.iterations = it;
        local ll: float = 0.0;
        local correct: int = 0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local p: float = r.predict(x + (i * m));
            local pc: float = Math.clamp(p, 0.000000000001, 1.0 - 0.000000000001);
            ll = ll + (y[i] > 0.5 ? Math.log(pc) : Math.log(1.0 - pc));
            if ((p > 0.5) == (y[i] > 0.5)) {
                correct = correct + 1;
            }
        }
        r.log_likelihood = ll;
        r.accuracy = cast<float>(correct) / cast<float>(n);
        h.destroy();
        free(cast<*void>(g));
        free(cast<*void>(step));
        free(cast<*void>(row));
        return r;
    }
}

struct Bootstrap {
    # Percentile bootstrap CI for a statistic of x (0 mean, 1 stddev, 2 sharpe, 3 median).
    frame interval(x: *float, n: int, statistic: int, resamples: int, level: float, seed: u64, lo: *float, hi: *float) ret float {
        local rng: Xoshiro = Xoshiro.new(seed);
        local sample: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local stats: *float = cast<*float>(malloc(cast<long>(resamples) * sizeof(float)));
        loop (local b: int = 0; b < resamples; b = b + 1) {
            loop (local i: int = 0; i < n; i = i + 1) {
                sample[i] = x[rng.range(0, n)];
            }
            stats[b] = Bootstrap.statistic(sample, n, statistic);
        }
        Sort.floats(stats, resamples);
        *lo = Stats.quantileSorted(stats, resamples, (1.0 - level) / 2.0);
        *hi = Stats.quantileSorted(stats, resamples, 1.0 - ((1.0 - level) / 2.0));
        local point: float = Bootstrap.statistic(x, n, statistic);
        free(cast<*void>(sample));
        free(cast<*void>(stats));
        return point;
    }

    frame statistic(x: *float, n: int, which: int) ret float {
        if (which == 0) {
            return Stats.mean(x, n);
        }
        if (which == 1) {
            return Stats.stddev(x, n);
        }
        if (which == 2) {
            return Stats.sharpe(x, n, 0.0, 252.0);
        }
        return Stats.median(x, n);
    }
}

struct Kde {
    frame silverman(x: *float, n: int) ret float {
        local sd: float = Stats.stddev(x, n);
        local iqr: float = Stats.quantile(x, n, 0.75) - Stats.quantile(x, n, 0.25);
        local spread: float = Math.min(sd, iqr / 1.34);
        if (spread <= 0.0) {
            spread = sd > 0.0 ? sd : 1.0;
        }
        return 0.9 * spread * Math.pow(cast<float>(n), -0.2);
    }

    frame density(x: *float, n: int, bandwidth: float, at: float) ret float {
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local z: float = (at - x[i]) / bandwidth;
            s = s + Math.exp(-0.5 * z * z);
        }
        return s / (cast<float>(n) * bandwidth * Math.sqrt(2.0 * PI));
    }
}
