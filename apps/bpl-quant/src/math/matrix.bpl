# Dense row-major matrices and the decompositions the risk engine needs.
#
# Every operation that produces a matrix returns a new owned Matrix; callers
# destroy() it. Decompositions report failure through `ok` flags rather than
# returning garbage for singular or indefinite input.

import malloc, free, memcpy, memset from "std/c.bpl";
import [Math] from "std/math.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import snprintf from "std/c.bpl";

export [Matrix];
export [LUResult];
export [QRResult];
export [EigenResult];

struct Matrix {
    rows: int,
    cols: int,
    data: *float,

    frame new(rows: int, cols: int) ret Matrix {
        local m: Matrix;
        m.rows = rows;
        m.cols = cols;
        local n: long = cast<long>(rows) * cast<long>(cols);
        if (n < 1) {
            n = 1;
        }
        m.data = cast<*float>(malloc(n * sizeof(float)));
        if (m.data == nullptr) {
            throw "Matrix allocation failed";
        }
        memset(cast<*void>(m.data), 0, n * sizeof(float));
        return m;
    }

    frame identity(n: int) ret Matrix {
        local m: Matrix = Matrix.new(n, n);
        loop (local i: int = 0; i < n; i = i + 1) {
            m.data[(i * n) + i] = 1.0;
        }
        return m;
    }

    frame fromRaw(rows: int, cols: int, values: *float) ret Matrix {
        local m: Matrix = Matrix.new(rows, cols);
        memcpy(cast<*void>(m.data), cast<*void>(values), cast<long>(rows * cols) * sizeof(float));
        return m;
    }

    frame diagonal(values: *float, n: int) ret Matrix {
        local m: Matrix = Matrix.new(n, n);
        loop (local i: int = 0; i < n; i = i + 1) {
            m.data[(i * n) + i] = values[i];
        }
        return m;
    }

    frame destroy(this: *Matrix) {
        if (this.data != nullptr) {
            free(cast<*void>(this.data));
            this.data = nullptr;
        }
        this.rows = 0;
        this.cols = 0;
    }

    frame at(this: *Matrix, r: int, c: int) ret float {
        return this.data[(r * this.cols) + c];
    }

    frame put(this: *Matrix, r: int, c: int, v: float) {
        this.data[(r * this.cols) + c] = v;
    }

    frame addAt(this: *Matrix, r: int, c: int, v: float) {
        this.data[(r * this.cols) + c] = this.data[(r * this.cols) + c] + v;
    }

    frame row(this: *Matrix, r: int) ret *float {
        return this.data + (r * this.cols);
    }

    frame copy(this: *Matrix) ret Matrix {
        return Matrix.fromRaw(this.rows, this.cols, this.data);
    }

    frame isSquare(this: *Matrix) ret bool {
        return this.rows == this.cols;
    }

    frame transpose(this: *Matrix) ret Matrix {
        local t: Matrix = Matrix.new(this.cols, this.rows);
        loop (local i: int = 0; i < this.rows; i = i + 1) {
            loop (local j: int = 0; j < this.cols; j = j + 1) {
                t.data[(j * this.rows) + i] = this.data[(i * this.cols) + j];
            }
        }
        return t;
    }

    # Cache-friendly i-k-j product.
    frame mul(this: *Matrix, other: *Matrix) ret Matrix {
        if (this.cols != other.rows) {
            throw "Matrix.mul dimension mismatch";
        }
        local out: Matrix = Matrix.new(this.rows, other.cols);
        local n: int = other.cols;
        loop (local i: int = 0; i < this.rows; i = i + 1) {
            local orow: *float = out.data + (i * n);
            loop (local k: int = 0; k < this.cols; k = k + 1) {
                local a: float = this.data[(i * this.cols) + k];
                if (a != 0.0) {
                    local brow: *float = other.data + (k * n);
                    loop (local j: int = 0; j < n; j = j + 1) {
                        orow[j] = orow[j] + (a * brow[j]);
                    }
                }
            }
        }
        return out;
    }

    # Blocked product for large matrices; same result as mul up to rounding order.
    frame mulBlocked(this: *Matrix, other: *Matrix, block: int) ret Matrix {
        if (this.cols != other.rows) {
            throw "Matrix.mulBlocked dimension mismatch";
        }
        local out: Matrix = Matrix.new(this.rows, other.cols);
        local m: int = this.rows;
        local n: int = other.cols;
        local p: int = this.cols;
        local ii: int = 0;
        loop (ii < m) {
            local kk: int = 0;
            loop (kk < p) {
                local jj: int = 0;
                loop (jj < n) {
                    local imax: int = (ii + block) < m ? ii + block : m;
                    local kmax: int = (kk + block) < p ? kk + block : p;
                    local jmax: int = (jj + block) < n ? jj + block : n;
                    loop (local i: int = ii; i < imax; i = i + 1) {
                        loop (local k: int = kk; k < kmax; k = k + 1) {
                            local a: float = this.data[(i * p) + k];
                            loop (local j: int = jj; j < jmax; j = j + 1) {
                                out.data[(i * n) + j] = out.data[(i * n) + j] + (a * other.data[(k * n) + j]);
                            }
                        }
                    }
                    jj = jj + block;
                }
                kk = kk + block;
            }
            ii = ii + block;
        }
        return out;
    }

    frame mulVec(this: *Matrix, v: *float, out: *float) {
        loop (local i: int = 0; i < this.rows; i = i + 1) {
            local s: float = 0.0;
            local r: *float = this.data + (i * this.cols);
            loop (local j: int = 0; j < this.cols; j = j + 1) {
                s = s + (r[j] * v[j]);
            }
            out[i] = s;
        }
    }

    # x' A x for a square matrix.
    frame quadForm(this: *Matrix, x: *float) ret float {
        local s: float = 0.0;
        loop (local i: int = 0; i < this.rows; i = i + 1) {
            local r: *float = this.data + (i * this.cols);
            local t: float = 0.0;
            loop (local j: int = 0; j < this.cols; j = j + 1) {
                t = t + (r[j] * x[j]);
            }
            s = s + (x[i] * t);
        }
        return s;
    }

    frame add(this: *Matrix, other: *Matrix) ret Matrix {
        local out: Matrix = this.copy();
        local n: int = this.rows * this.cols;
        loop (local i: int = 0; i < n; i = i + 1) {
            out.data[i] = out.data[i] + other.data[i];
        }
        return out;
    }

    frame sub(this: *Matrix, other: *Matrix) ret Matrix {
        local out: Matrix = this.copy();
        local n: int = this.rows * this.cols;
        loop (local i: int = 0; i < n; i = i + 1) {
            out.data[i] = out.data[i] - other.data[i];
        }
        return out;
    }

    frame scaled(this: *Matrix, k: float) ret Matrix {
        local out: Matrix = this.copy();
        local n: int = this.rows * this.cols;
        loop (local i: int = 0; i < n; i = i + 1) {
            out.data[i] = out.data[i] * k;
        }
        return out;
    }

    frame scaleInPlace(this: *Matrix, k: float) {
        local n: int = this.rows * this.cols;
        loop (local i: int = 0; i < n; i = i + 1) {
            this.data[i] = this.data[i] * k;
        }
    }

    frame trace(this: *Matrix) ret float {
        local s: float = 0.0;
        local n: int = this.rows < this.cols ? this.rows : this.cols;
        loop (local i: int = 0; i < n; i = i + 1) {
            s = s + this.data[(i * this.cols) + i];
        }
        return s;
    }

    frame frobenius(this: *Matrix) ret float {
        local s: float = 0.0;
        local n: int = this.rows * this.cols;
        loop (local i: int = 0; i < n; i = i + 1) {
            s = s + (this.data[i] * this.data[i]);
        }
        return Math.sqrt(s);
    }

    frame maxAbsDiff(this: *Matrix, other: *Matrix) ret float {
        local worst: float = 0.0;
        local n: int = this.rows * this.cols;
        loop (local i: int = 0; i < n; i = i + 1) {
            local d: float = Math.abs(this.data[i] - other.data[i]);
            if (d > worst) {
                worst = d;
            }
        }
        return worst;
    }

    frame isSymmetric(this: *Matrix, tol: float) ret bool {
        if (!this.isSquare()) {
            return false;
        }
        loop (local i: int = 0; i < this.rows; i = i + 1) {
            loop (local j: int = i + 1; j < this.cols; j = j + 1) {
                if (Math.abs(this.at(i, j) - this.at(j, i)) > tol) {
                    return false;
                }
            }
        }
        return true;
    }

    # Lower-triangular L with A = L L'. Returns ok=false if A is not positive definite.
    frame cholesky(this: *Matrix, out: *Matrix) ret bool {
        local n: int = this.rows;
        *out = Matrix.new(n, n);
        loop (local j: int = 0; j < n; j = j + 1) {
            local s: float = this.at(j, j);
            loop (local k: int = 0; k < j; k = k + 1) {
                local l: float = out.at(j, k);
                s = s - (l * l);
            }
            if (s <= 0.0) {
                return false;
            }
            local d: float = Math.sqrt(s);
            out.put(j, j, d);
            loop (local i: int = j + 1; i < n; i = i + 1) {
                local t: float = this.at(i, j);
                loop (local k: int = 0; k < j; k = k + 1) {
                    t = t - (out.at(i, k) * out.at(j, k));
                }
                out.put(i, j, t / d);
            }
        }
        return true;
    }

    # Partial-pivoting LU decomposition (Doolittle) of a square matrix.
    frame lu(this: *Matrix) ret LUResult {
        local n: int = this.rows;
        local r: LUResult;
        r.lu = this.copy();
        r.perm = cast<*int>(malloc(cast<long>(n + 1) * sizeof(int)));
        r.sign = 1.0;
        r.ok = true;
        r.n = n;
        loop (local i: int = 0; i < n; i = i + 1) {
            r.perm[i] = i;
        }
        loop (local k: int = 0; k < n; k = k + 1) {
            local p: int = k;
            local best: float = Math.abs(r.lu.at(k, k));
            loop (local i: int = k + 1; i < n; i = i + 1) {
                local v: float = Math.abs(r.lu.at(i, k));
                if (v > best) {
                    best = v;
                    p = i;
                }
            }
            if (best < 0.000000000000001) {
                r.ok = false;
                return r;
            }
            if (p != k) {
                loop (local j: int = 0; j < n; j = j + 1) {
                    local t: float = r.lu.at(k, j);
                    r.lu.put(k, j, r.lu.at(p, j));
                    r.lu.put(p, j, t);
                }
                local tp: int = r.perm[k];
                r.perm[k] = r.perm[p];
                r.perm[p] = tp;
                r.sign = -r.sign;
            }
            local pivot: float = r.lu.at(k, k);
            loop (local i: int = k + 1; i < n; i = i + 1) {
                local f: float = r.lu.at(i, k) / pivot;
                r.lu.put(i, k, f);
                if (f != 0.0) {
                    loop (local j: int = k + 1; j < n; j = j + 1) {
                        r.lu.put(i, j, r.lu.at(i, j) - (f * r.lu.at(k, j)));
                    }
                }
            }
        }
        return r;
    }

    frame determinant(this: *Matrix) ret float {
        local r: LUResult = this.lu();
        local d: float = 0.0;
        if (r.ok) {
            d = r.sign;
            loop (local i: int = 0; i < r.n; i = i + 1) {
                d = d * r.lu.at(i, i);
            }
        }
        r.destroy();
        return d;
    }

    # Solves A x = b; returns false for singular A.
    frame solve(this: *Matrix, b: *float, x: *float) ret bool {
        local r: LUResult = this.lu();
        local ok: bool = r.ok;
        if (ok) {
            r.solve(b, x);
        }
        r.destroy();
        return ok;
    }

    frame inverse(this: *Matrix, out: *Matrix) ret bool {
        local n: int = this.rows;
        local r: LUResult = this.lu();
        if (!r.ok) {
            r.destroy();
            return false;
        }
        *out = Matrix.new(n, n);
        local e: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local col: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local j: int = 0; j < n; j = j + 1) {
            loop (local i: int = 0; i < n; i = i + 1) {
                e[i] = i == j ? 1.0 : 0.0;
            }
            r.solve(e, col);
            loop (local i: int = 0; i < n; i = i + 1) {
                out.put(i, j, col[i]);
            }
        }
        free(cast<*void>(e));
        free(cast<*void>(col));
        r.destroy();
        return true;
    }

    # Householder QR of an m x n matrix (m >= n).
    frame qr(this: *Matrix) ret QRResult {
        local m: int = this.rows;
        local n: int = this.cols;
        local res: QRResult;
        res.q = Matrix.identity(m);
        res.r = this.copy();
        local v: *float = cast<*float>(malloc(cast<long>(m) * sizeof(float)));
        local steps: int = n < (m - 1) ? n : m - 1;
        loop (local k: int = 0; k < steps; k = k + 1) {
            local norm: float = 0.0;
            loop (local i: int = k; i < m; i = i + 1) {
                norm = norm + (res.r.at(i, k) * res.r.at(i, k));
            }
            norm = Math.sqrt(norm);
            if (norm == 0.0) {
                continue;
            }
            local alpha: float = res.r.at(k, k) > 0.0 ? -norm : norm;
            local vnorm: float = 0.0;
            loop (local i: int = 0; i < m; i = i + 1) {
                v[i] = 0.0;
            }
            loop (local i: int = k; i < m; i = i + 1) {
                v[i] = res.r.at(i, k);
            }
            v[k] = v[k] - alpha;
            loop (local i: int = k; i < m; i = i + 1) {
                vnorm = vnorm + (v[i] * v[i]);
            }
            if (vnorm == 0.0) {
                continue;
            }
            # R = H R, applied column by column.
            loop (local j: int = 0; j < n; j = j + 1) {
                local dot: float = 0.0;
                loop (local i: int = k; i < m; i = i + 1) {
                    dot = dot + (v[i] * res.r.at(i, j));
                }
                local f: float = (2.0 * dot) / vnorm;
                loop (local i: int = k; i < m; i = i + 1) {
                    res.r.put(i, j, res.r.at(i, j) - (f * v[i]));
                }
            }
            # Q = Q H.
            loop (local i: int = 0; i < m; i = i + 1) {
                local dot: float = 0.0;
                loop (local j: int = k; j < m; j = j + 1) {
                    dot = dot + (res.q.at(i, j) * v[j]);
                }
                local f: float = (2.0 * dot) / vnorm;
                loop (local j: int = k; j < m; j = j + 1) {
                    res.q.put(i, j, res.q.at(i, j) - (f * v[j]));
                }
            }
        }
        free(cast<*void>(v));
        return res;
    }

    # Ordinary least squares beta = argmin |X b - y| via QR.
    frame leastSquares(this: *Matrix, y: *float, beta: *float) ret bool {
        local m: int = this.rows;
        local n: int = this.cols;
        if (m < n) {
            return false;
        }
        local f: QRResult = this.qr();
        local qty: *float = cast<*float>(malloc(cast<long>(m) * sizeof(float)));
        loop (local j: int = 0; j < m; j = j + 1) {
            local s: float = 0.0;
            loop (local i: int = 0; i < m; i = i + 1) {
                s = s + (f.q.at(i, j) * y[i]);
            }
            qty[j] = s;
        }
        local ok: bool = true;
        local i: int = n - 1;
        loop (i >= 0) {
            local s: float = qty[i];
            loop (local j: int = i + 1; j < n; j = j + 1) {
                s = s - (f.r.at(i, j) * beta[j]);
            }
            local d: float = f.r.at(i, i);
            if (Math.abs(d) < 0.000000000001) {
                ok = false;
                beta[i] = 0.0;
            } else {
                beta[i] = s / d;
            }
            i = i - 1;
        }
        free(cast<*void>(qty));
        f.destroy();
        return ok;
    }

    # Cyclic Jacobi eigenvalue algorithm for symmetric matrices.
    frame eigenSymmetric(this: *Matrix) ret EigenResult {
        local n: int = this.rows;
        local a: Matrix = this.copy();
        local res: EigenResult;
        res.vectors = Matrix.identity(n);
        res.values = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        res.n = n;
        res.sweeps = 0;
        loop (local sweep: int = 0; sweep < 100; sweep = sweep + 1) {
            local off: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                loop (local j: int = i + 1; j < n; j = j + 1) {
                    off = off + (a.at(i, j) * a.at(i, j));
                }
            }
            res.sweeps = sweep;
            if (off < 0.000000000000000000001) {
                break;
            }
            loop (local p: int = 0; p < n; p = p + 1) {
                loop (local q: int = p + 1; q < n; q = q + 1) {
                    local apq: float = a.at(p, q);
                    if (Math.abs(apq) < 0.0000000000000000001) {
                        continue;
                    }
                    local app: float = a.at(p, p);
                    local aqq: float = a.at(q, q);
                    local theta: float = (aqq - app) / (2.0 * apq);
                    local t: float = 1.0 / (Math.abs(theta) + Math.sqrt((theta * theta) + 1.0));
                    if (theta < 0.0) {
                        t = -t;
                    }
                    local c: float = 1.0 / Math.sqrt((t * t) + 1.0);
                    local s: float = t * c;
                    loop (local k: int = 0; k < n; k = k + 1) {
                        local akp: float = a.at(k, p);
                        local akq: float = a.at(k, q);
                        a.put(k, p, (c * akp) - (s * akq));
                        a.put(k, q, (s * akp) + (c * akq));
                    }
                    loop (local k: int = 0; k < n; k = k + 1) {
                        local apk: float = a.at(p, k);
                        local aqk: float = a.at(q, k);
                        a.put(p, k, (c * apk) - (s * aqk));
                        a.put(q, k, (s * apk) + (c * aqk));
                    }
                    loop (local k: int = 0; k < n; k = k + 1) {
                        local vkp: float = res.vectors.at(k, p);
                        local vkq: float = res.vectors.at(k, q);
                        res.vectors.put(k, p, (c * vkp) - (s * vkq));
                        res.vectors.put(k, q, (s * vkp) + (c * vkq));
                    }
                }
            }
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            res.values[i] = a.at(i, i);
        }
        a.destroy();
        res.sortDescending();
        return res;
    }

    # Dominant eigenvalue by power iteration (used as a cross-check).
    frame powerIteration(this: *Matrix, iterations: int) ret float {
        local n: int = this.rows;
        local v: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local w: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            v[i] = 1.0 / Math.sqrt(cast<float>(n));
        }
        local lambda: float = 0.0;
        loop (local it: int = 0; it < iterations; it = it + 1) {
            this.mulVec(v, w);
            local norm: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                norm = norm + (w[i] * w[i]);
            }
            norm = Math.sqrt(norm);
            if (norm == 0.0) {
                break;
            }
            lambda = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                lambda = lambda + (v[i] * w[i]);
                v[i] = w[i] / norm;
            }
        }
        free(cast<*void>(v));
        free(cast<*void>(w));
        return lambda;
    }

    # Nearest correlation-like repair: clip negative eigenvalues to floor.
    frame nearestPositiveDefinite(this: *Matrix, floor: float) ret Matrix {
        local e: EigenResult = this.eigenSymmetric();
        local n: int = this.rows;
        local out: Matrix = Matrix.new(n, n);
        loop (local k: int = 0; k < n; k = k + 1) {
            local lambda: float = e.values[k] < floor ? floor : e.values[k];
            loop (local i: int = 0; i < n; i = i + 1) {
                local vik: float = e.vectors.at(i, k) * lambda;
                loop (local j: int = 0; j < n; j = j + 1) {
                    out.addAt(i, j, vik * e.vectors.at(j, k));
                }
            }
        }
        e.destroy();
        return out;
    }

    frame format(this: *Matrix, decimals: int) ret string {
        local sb: StringBuilder = StringBuilder.new(64);
        local buf: char[64];
        loop (local i: int = 0; i < this.rows; i = i + 1) {
            sb.append("[");
            loop (local j: int = 0; j < this.cols; j = j + 1) {
                if (j > 0) {
                    sb.append(" ");
                }
                snprintf(cast<string>(&buf[0]), 64, "%.*f", decimals, this.at(i, j));
                sb.append(cast<string>(&buf[0]));
            }
            sb.append("]\n");
        }
        return sb.toString();
    }
}

struct LUResult {
    lu: Matrix,
    perm: *int,
    sign: float,
    ok: bool,
    n: int,

    frame solve(this: *LUResult, b: *float, x: *float) {
        local n: int = this.n;
        loop (local i: int = 0; i < n; i = i + 1) {
            local s: float = b[this.perm[i]];
            loop (local j: int = 0; j < i; j = j + 1) {
                s = s - (this.lu.at(i, j) * x[j]);
            }
            x[i] = s;
        }
        local i: int = n - 1;
        loop (i >= 0) {
            local s: float = x[i];
            loop (local j: int = i + 1; j < n; j = j + 1) {
                s = s - (this.lu.at(i, j) * x[j]);
            }
            x[i] = s / this.lu.at(i, i);
            i = i - 1;
        }
    }

    frame destroy(this: *LUResult) {
        this.lu.destroy();
        if (this.perm != nullptr) {
            free(cast<*void>(this.perm));
            this.perm = nullptr;
        }
    }
}

struct QRResult {
    q: Matrix,
    r: Matrix,

    frame destroy(this: *QRResult) {
        this.q.destroy();
        this.r.destroy();
    }
}

struct EigenResult {
    values: *float,
    vectors: Matrix,
    n: int,
    sweeps: int,

    frame sortDescending(this: *EigenResult) {
        loop (local i: int = 0; i < this.n; i = i + 1) {
            local best: int = i;
            loop (local j: int = i + 1; j < this.n; j = j + 1) {
                if (this.values[j] > this.values[best]) {
                    best = j;
                }
            }
            if (best != i) {
                local t: float = this.values[i];
                this.values[i] = this.values[best];
                this.values[best] = t;
                loop (local k: int = 0; k < this.n; k = k + 1) {
                    local tv: float = this.vectors.at(k, i);
                    this.vectors.put(k, i, this.vectors.at(k, best));
                    this.vectors.put(k, best, tv);
                }
            }
        }
    }

    frame destroy(this: *EigenResult) {
        this.vectors.destroy();
        if (this.values != nullptr) {
            free(cast<*void>(this.values));
            this.values = nullptr;
        }
    }
}
