# Linear and quadratic programming.
#
# Simplex: maximize c'x subject to rows a_i'x (<=, =, >=) b_i and x >= 0,
# solved with a dense two-phase tableau and Bland's rule (no cycling).
# BoxQp: minimize 0.5 x'Qx + c'x subject to sum(x) = budget and
# lo <= x <= hi, by projected gradient with an exact projection onto the
# capped simplex (bisection on the shift).

import malloc, free, memset from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Matrix] from "./matrix.bpl";

export [Simplex];
export [LpResult];
export [LpStatus];
export [Constraint];
export [BoxQp];
export [QpResult];

global const EPS: float = 0.000000001;

enum LpStatus {
    Optimal,
    Infeasible,
    Unbounded,
    IterationLimit,
}

enum Constraint {
    LessEq,
    Equal,
    GreaterEq,
}

struct LpResult {
    status: LpStatus,
    objective: float,
    x: *float,
    n: int,
    iterations: int,

    frame destroy(this: *LpResult) {
        if (this.x != nullptr) {
            free(cast<*void>(this.x));
            this.x = nullptr;
        }
    }

    frame statusName(s: LpStatus) ret string {
        return match (s) {
            LpStatus.Optimal => "optimal",
            LpStatus.Infeasible => "infeasible",
            LpStatus.Unbounded => "unbounded",
            LpStatus.IterationLimit => "iteration_limit",
        };
    }
}

struct Simplex {
    # Pivots the tableau (rows x cols, row-major) on (pr, pc).
    frame pivot(t: *float, rows: int, cols: int, pr: int, pc: int) {
        local pv: float = t[(pr * cols) + pc];
        loop (local j: int = 0; j < cols; j = j + 1) {
            t[(pr * cols) + j] = t[(pr * cols) + j] / pv;
        }
        loop (local i: int = 0; i < rows; i = i + 1) {
            if (i == pr) {
                continue;
            }
            local f: float = t[(i * cols) + pc];
            if (Math.abs(f) > 0.0) {
                loop (local j: int = 0; j < cols; j = j + 1) {
                    t[(i * cols) + j] = t[(i * cols) + j] - (f * t[(pr * cols) + j]);
                }
            }
        }
    }

    # Runs simplex iterations on objective row `obj` over columns [0, limit).
    frame iterate(t: *float, rows: int, cols: int, obj: int, limit: int, basis: *int, m: int, max_iter: int, iterations: *int) ret LpStatus {
        loop (*iterations < max_iter) {
            # Bland's rule: lowest-index column with a negative reduced cost.
            local pc: int = -1;
            loop (local j: int = 0; j < limit; j = j + 1) {
                if (t[(obj * cols) + j] < -EPS) {
                    pc = j;
                    break;
                }
            }
            if (pc < 0) {
                return LpStatus.Optimal;
            }
            local pr: int = -1;
            local best: float = 0.0;
            loop (local i: int = 0; i < m; i = i + 1) {
                local a: float = t[(i * cols) + pc];
                if (a > EPS) {
                    local ratio: float = t[((i * cols) + cols) - 1] / a;
                    if ((pr < 0) || (ratio < (best - EPS)) || ((Math.abs(ratio - best) <= EPS) && (basis[i] < basis[pr]))) {
                        best = ratio;
                        pr = i;
                    }
                }
            }
            if (pr < 0) {
                return LpStatus.Unbounded;
            }
            Simplex.pivot(t, rows, cols, pr, pc);
            basis[pr] = pc;
            *iterations = *iterations + 1;
        }
        return LpStatus.IterationLimit;
    }

    # a is m x n row-major; kinds[i] gives each row's sense.
    frame maximize(c: *float, a: *float, b: *float, kinds: *Constraint, m: int, n: int, max_iter: int) ret LpResult {
        # Columns: n originals, one slack/surplus per inequality, one artificial per row, rhs.
        local slack_count: int = 0;
        loop (local i: int = 0; i < m; i = i + 1) {
            if (kinds[i] != Constraint.Equal) {
                slack_count = slack_count + 1;
            }
        }
        local art0: int = n + slack_count;
        local cols: int = art0 + m + 1;
        local rows: int = m + 2;
        local t: *float = cast<*float>(malloc(cast<long>(rows * cols) * sizeof(float)));
        memset(cast<*void>(t), 0, cast<long>(rows * cols) * sizeof(float));
        local basis: *int = cast<*int>(malloc(cast<long>(m + 1) * sizeof(int)));
        local s: int = n;
        loop (local i: int = 0; i < m; i = i + 1) {
            # Normalize so every rhs is nonnegative.
            local sign: float = b[i] < 0.0 ? -1.0 : 1.0;
            local kind: Constraint = kinds[i];
            if (sign < 0.0) {
                if (kind == Constraint.LessEq) {
                    kind = Constraint.GreaterEq;
                } else if (kind == Constraint.GreaterEq) {
                    kind = Constraint.LessEq;
                }
            }
            loop (local j: int = 0; j < n; j = j + 1) {
                t[(i * cols) + j] = sign * a[(i * n) + j];
            }
            if (kinds[i] != Constraint.Equal) {
                t[(i * cols) + s] = kind == Constraint.LessEq ? 1.0 : -1.0;
                s = s + 1;
            }
            t[(i * cols) + art0 + i] = 1.0;
            t[((i * cols) + cols) - 1] = sign * b[i];
            basis[i] = art0 + i;
        }
        # Phase 1 objective (row m+1): minimize the sum of artificials.
        local p1: int = m + 1;
        loop (local i: int = 0; i < m; i = i + 1) {
            loop (local j: int = 0; j < cols; j = j + 1) {
                if ((j < art0) || (j == (cols - 1))) {
                    t[(p1 * cols) + j] = t[(p1 * cols) + j] - t[(i * cols) + j];
                }
            }
        }
        local res: LpResult;
        res.n = n;
        res.iterations = 0;
        res.objective = 0.0;
        res.x = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        loop (local j: int = 0; j < n; j = j + 1) {
            res.x[j] = 0.0;
        }
        local status: LpStatus = Simplex.iterate(t, rows, cols, p1, art0, basis, m, max_iter, &res.iterations);
        if (status == LpStatus.IterationLimit) {
            res.status = status;
            free(cast<*void>(t));
            free(cast<*void>(basis));
            return res;
        }
        if (-t[((p1 * cols) + cols) - 1] > 0.0000001) {
            res.status = LpStatus.Infeasible;
            free(cast<*void>(t));
            free(cast<*void>(basis));
            return res;
        }
        # Drive remaining artificials out of the basis where possible.
        loop (local i: int = 0; i < m; i = i + 1) {
            if (basis[i] >= art0) {
                loop (local j: int = 0; j < art0; j = j + 1) {
                    if (Math.abs(t[(i * cols) + j]) > EPS) {
                        Simplex.pivot(t, rows, cols, i, j);
                        basis[i] = j;
                        break;
                    }
                }
            }
        }
        # Phase 2 objective (row m): maximize c'x  <=>  minimize -c'x.
        local p2: int = m;
        loop (local j: int = 0; j < cols; j = j + 1) {
            t[(p2 * cols) + j] = 0.0;
        }
        loop (local j: int = 0; j < n; j = j + 1) {
            t[(p2 * cols) + j] = -c[j];
        }
        loop (local i: int = 0; i < m; i = i + 1) {
            local bj: int = basis[i];
            if (bj < n) {
                local coef: float = t[(p2 * cols) + bj];
                if (coef != 0.0) {
                    loop (local j: int = 0; j < cols; j = j + 1) {
                        t[(p2 * cols) + j] = t[(p2 * cols) + j] - (coef * t[(i * cols) + j]);
                    }
                }
            }
        }
        status = Simplex.iterate(t, rows, cols, p2, art0, basis, m, max_iter, &res.iterations);
        res.status = status;
        if (status == LpStatus.Optimal) {
            loop (local i: int = 0; i < m; i = i + 1) {
                if (basis[i] < n) {
                    res.x[basis[i]] = t[((i * cols) + cols) - 1];
                }
            }
            local obj: float = 0.0;
            loop (local j: int = 0; j < n; j = j + 1) {
                obj = obj + (c[j] * res.x[j]);
            }
            res.objective = obj;
        }
        free(cast<*void>(t));
        free(cast<*void>(basis));
        return res;
    }
}

struct QpResult {
    x: *float,
    n: int,
    objective: float,
    iterations: int,
    converged: bool,

    frame destroy(this: *QpResult) {
        if (this.x != nullptr) {
            free(cast<*void>(this.x));
            this.x = nullptr;
        }
    }
}

struct BoxQp {
    # Projection onto {sum x = budget, lo <= x <= hi}: x_i = clamp(v_i - tau).
    frame project(v: *float, lo: *float, hi: *float, n: int, budget: float, out: *float) {
        local a: float = -1000000.0;
        local b: float = 1000000.0;
        loop (local it: int = 0; it < 200; it = it + 1) {
            local tau: float = 0.5 * (a + b);
            local s: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                s = s + Math.clamp(v[i] - tau, lo[i], hi[i]);
            }
            if (s > budget) {
                a = tau;
            } else {
                b = tau;
            }
        }
        local tau: float = 0.5 * (a + b);
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = Math.clamp(v[i] - tau, lo[i], hi[i]);
        }
    }

    frame objective(q: *Matrix, c: *float, x: *float) ret float {
        local v: float = 0.5 * q.quadForm(x);
        loop (local i: int = 0; i < q.rows; i = i + 1) {
            v = v + (c[i] * x[i]);
        }
        return v;
    }

    frame solve(q: *Matrix, c: *float, lo: *float, hi: *float, budget: float, max_iter: int) ret QpResult {
        local n: int = q.rows;
        local r: QpResult;
        r.n = n;
        r.x = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        r.converged = false;
        local g: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local y: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local next: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            y[i] = budget / cast<float>(n);
        }
        BoxQp.project(y, lo, hi, n, budget, r.x);
        # Lipschitz bound from Gershgorin.
        local lip: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local row: float = 0.0;
            loop (local j: int = 0; j < n; j = j + 1) {
                row = row + Math.abs(q.at(i, j));
            }
            lip = Math.max(lip, row);
        }
        local step: float = lip > 0.0 ? 1.0 / lip : 1.0;
        local it: int = 0;
        loop (it < max_iter) {
            q.mulVec(r.x, g);
            loop (local i: int = 0; i < n; i = i + 1) {
                y[i] = r.x[i] - (step * (g[i] + c[i]));
            }
            BoxQp.project(y, lo, hi, n, budget, next);
            local change: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                change = change + Math.abs(next[i] - r.x[i]);
                r.x[i] = next[i];
            }
            it = it + 1;
            if (change < 0.0000000001) {
                r.converged = true;
                break;
            }
        }
        r.iterations = it;
        r.objective = BoxQp.objective(q, c, r.x);
        free(cast<*void>(g));
        free(cast<*void>(y));
        free(cast<*void>(next));
        return r;
    }
}
