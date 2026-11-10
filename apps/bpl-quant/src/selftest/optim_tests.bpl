# Self-tests for the simplex LP solver and the box-constrained QP.

import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Matrix] from "../math/matrix.bpl";
import [Simplex], [LpResult], [LpStatus], [Constraint], [BoxQp], [QpResult] from "../math/linprog.bpl";
import [Portfolio], [Allocation] from "../risk/portfolio.bpl";

export runOptimTests;

frame testSimplex(c: *Check) {
    c.begin("simplex");
    # max 3x + 5y s.t. x <= 4, 2y <= 12, 3x + 2y <= 18.
    local obj: float[2] = [3.0, 5.0];
    local a: float[6] = [1.0, 0.0, 0.0, 2.0, 3.0, 2.0];
    local b: float[3] = [4.0, 12.0, 18.0];
    local kinds: Constraint[3] = [Constraint.LessEq, Constraint.LessEq, Constraint.LessEq];
    local r: LpResult = Simplex.maximize(&obj[0], &a[0], &b[0], &kinds[0], 3, 2, 1000);
    c.ok("optimal", r.status == LpStatus.Optimal);
    c.near("objective", r.objective, 36.0, 0.000000001);
    c.near("x", r.x[0], 2.0, 0.000000001);
    c.near("y", r.x[1], 6.0, 0.000000001);
    r.destroy();
    # Diet problem with >= rows: min 0.6a + 0.35b s.t. 5a + 7b >= 8, 4a + 2b >= 15, 2a + b >= 3.
    local cost: float[2] = [-0.6, -0.35];
    local da: float[6] = [5.0, 7.0, 4.0, 2.0, 2.0, 1.0];
    local db: float[3] = [8.0, 15.0, 3.0];
    local dk: Constraint[3] = [Constraint.GreaterEq, Constraint.GreaterEq, Constraint.GreaterEq];
    local diet: LpResult = Simplex.maximize(&cost[0], &da[0], &db[0], &dk[0], 3, 2, 1000);
    c.ok("diet_optimal", diet.status == LpStatus.Optimal);
    c.near("diet_cost", -diet.objective, 0.6 * 3.75, 0.000000001);
    diet.destroy();
    # Equality: max x + y s.t. x + 2y = 4, x <= 3.
    local eo: float[2] = [1.0, 1.0];
    local ea: float[4] = [1.0, 2.0, 1.0, 0.0];
    local eb: float[2] = [4.0, 3.0];
    local ek: Constraint[2] = [Constraint.Equal, Constraint.LessEq];
    local eq: LpResult = Simplex.maximize(&eo[0], &ea[0], &eb[0], &ek[0], 2, 2, 1000);
    c.near("equality_objective", eq.objective, 3.5, 0.000000001);
    eq.destroy();
    # Negative right-hand side is normalized: -x <= -2 means x >= 2.
    local no: float[1] = [-1.0];
    local na: float[1] = [-1.0];
    local nb: float[1] = [-2.0];
    local nk: Constraint[1] = [Constraint.LessEq];
    local neg: LpResult = Simplex.maximize(&no[0], &na[0], &nb[0], &nk[0], 1, 1, 100);
    c.near("negative_rhs", neg.x[0], 2.0, 0.000000001);
    neg.destroy();
    local io: float[1] = [1.0];
    local ia: float[2] = [1.0, 1.0];
    local ib: float[2] = [1.0, 2.0];
    local ik: Constraint[2] = [Constraint.LessEq, Constraint.GreaterEq];
    local infeasible: LpResult = Simplex.maximize(&io[0], &ia[0], &ib[0], &ik[0], 2, 1, 100);
    c.ok("infeasible", infeasible.status == LpStatus.Infeasible);
    infeasible.destroy();
    local uo: float[2] = [1.0, 0.0];
    local ua: float[2] = [0.0, 1.0];
    local ub: float[1] = [1.0];
    local uk: Constraint[1] = [Constraint.LessEq];
    local unbounded: LpResult = Simplex.maximize(&uo[0], &ua[0], &ub[0], &uk[0], 1, 2, 100);
    c.ok("unbounded", unbounded.status == LpStatus.Unbounded);
    unbounded.destroy();
    # Degenerate problem (Beale-style) terminates under Bland's rule.
    local bo: float[4] = [0.75, -20.0, 0.5, -6.0];
    local ba: float[12] = [0.25, -8.0, -1.0, 9.0, 0.5, -12.0, -0.5, 3.0, 0.0, 0.0, 1.0, 0.0];
    local bb: float[3] = [0.0, 0.0, 1.0];
    local bk: Constraint[3] = [Constraint.LessEq, Constraint.LessEq, Constraint.LessEq];
    local beale: LpResult = Simplex.maximize(&bo[0], &ba[0], &bb[0], &bk[0], 3, 4, 1000);
    c.ok("beale_terminates", beale.status == LpStatus.Optimal);
    c.near("beale_objective", beale.objective, 1.25, 0.000000001);
    beale.destroy();
}

frame testQp(c: *Check) {
    c.begin("box_qp");
    local vols: float[4] = [0.1, 0.15, 0.2, 0.12];
    local cov: Matrix = Matrix.new(4, 4);
    loop (local i: int = 0; i < 4; i = i + 1) {
        loop (local j: int = 0; j < 4; j = j + 1) {
            cov.put(i, j, (i == j ? 1.0 : 0.3) * vols[i] * vols[j]);
        }
    }
    local zero: float[4] = [0.0, 0.0, 0.0, 0.0];
    local lo: float[4] = [0.0, 0.0, 0.0, 0.0];
    local hi: float[4] = [1.0, 1.0, 1.0, 1.0];
    local r: QpResult = BoxQp.solve(&cov, &zero[0], &lo[0], &hi[0], 1.0, 20000);
    c.ok("converged", r.converged);
    local mu: float[4] = [0.0, 0.0, 0.0, 0.0];
    local gmv: Allocation = Portfolio.minVariance(&mu[0], &cov, 0.0);
    # This covariance has a long-only GMV, so the unconstrained and boxed answers agree.
    c.near("matches_gmv", r.x[0], gmv.weights[0], 0.00001);
    c.near("budget", r.x[0] + r.x[1] + r.x[2] + r.x[3], 1.0, 0.000000001);
    gmv.destroy();
    r.destroy();
    local cap: float[4] = [0.3, 0.3, 0.3, 0.3];
    local capped: QpResult = BoxQp.solve(&cov, &zero[0], &lo[0], &cap[0], 1.0, 20000);
    local max_w: float = 0.0;
    loop (local i: int = 0; i < 4; i = i + 1) {
        max_w = Math.max(max_w, capped.x[i]);
    }
    c.ok("caps_respected", max_w <= (0.3 + 0.0000001));
    c.value("capped_w0", capped.x[0], 6);
    c.value("capped_w2", capped.x[2], 6);
    capped.destroy();
}

frame runOptimTests(c: *Check) {
    testSimplex(c);
    testQp(c);
}
