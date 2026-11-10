# Matrix: dense row-major matrices of doubles with basic linear algebra.
#
# Arithmetic returns new matrices the caller destroys. Determinants,
# inverses and linear solves use LU decomposition with partial pivoting;
# a matrix whose pivot falls below `MATRIX_EPSILON` (relative to its
# largest entry) is treated as singular.

export [Matrix];
export MATRIX_EPSILON;

import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern snprintf(buffer: string, size: long, format: string, ...) ret int;

global MATRIX_EPSILON: float = 0.000000000001;

frame _matrixAbs(x: float) ret float {
    if (x < 0.0) {
        return -x;
    }
    return x;
}

struct Matrix {
    rows: int,
    cols: int,
    data: *float,
    # A zero matrix.
    frame new(rows: int, cols: int) ret Matrix {
        if ((rows < 0) || (cols < 0)) {
            throw "Matrix dimensions must be non-negative";
        }
        local m: Matrix;
        m.rows = rows;
        m.cols = cols;
        local count: long = cast<long>(rows) * cast<long>(cols);
        m.data = cast<*float>(malloc((count + 1) * sizeof<float>()));
        if (m.data == nullptr) {
            throw "Matrix allocation failed";
        }
        loop (local i: long = 0; i < count; i = i + 1) {
            m.data[i] = 0.0;
        }
        return m;
    }

    frame identity(size: int) ret Matrix {
        local m: Matrix = Matrix.new(size, size);
        loop (local i: int = 0; i < size; i = i + 1) {
            m.data[(i * size) + i] = 1.0;
        }
        return m;
    }

    # Copies `rows * cols` values in row-major order.
    frame fromValues(rows: int, cols: int, values: *float) ret Matrix {
        local m: Matrix = Matrix.new(rows, cols);
        loop (local i: int = 0; i < (rows * cols); i = i + 1) {
            m.data[i] = values[i];
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

    frame clone(this: *Matrix) ret Matrix {
        return Matrix.fromValues(this.rows, this.cols, this.data);
    }

    frame _check(this: *Matrix, row: int, col: int) {
        if ((row < 0) || (row >= this.rows) || (col < 0) || (col >= this.cols)) {
            throw "Matrix index out of range";
        }
    }

    frame get(this: *Matrix, row: int, col: int) ret float {
        this._check(row, col);
        return this.data[(row * this.cols) + col];
    }

    frame set(this: *Matrix, row: int, col: int, value: float) {
        this._check(row, col);
        this.data[(row * this.cols) + col] = value;
    }

    frame isSquare(this: *Matrix) ret bool {
        return this.rows == this.cols;
    }

    frame _sameShape(this: *Matrix, other: *Matrix) {
        if ((this.rows != other.rows) || (this.cols != other.cols)) {
            throw "Matrix dimensions do not match";
        }
    }

    frame add(this: *Matrix, other: *Matrix) ret Matrix {
        this._sameShape(other);
        local result: Matrix = Matrix.new(this.rows, this.cols);
        loop (local i: int = 0; i < (this.rows * this.cols); i = i + 1) {
            result.data[i] = this.data[i] + other.data[i];
        }
        return result;
    }

    frame subtract(this: *Matrix, other: *Matrix) ret Matrix {
        this._sameShape(other);
        local result: Matrix = Matrix.new(this.rows, this.cols);
        loop (local i: int = 0; i < (this.rows * this.cols); i = i + 1) {
            result.data[i] = this.data[i] - other.data[i];
        }
        return result;
    }

    frame scale(this: *Matrix, factor: float) ret Matrix {
        local result: Matrix = Matrix.new(this.rows, this.cols);
        loop (local i: int = 0; i < (this.rows * this.cols); i = i + 1) {
            result.data[i] = this.data[i] * factor;
        }
        return result;
    }

    # Matrix product; throws when the inner dimensions differ.
    frame multiply(this: *Matrix, other: *Matrix) ret Matrix {
        if (this.cols != other.rows) {
            throw "Matrix dimensions do not match for multiplication";
        }
        local result: Matrix = Matrix.new(this.rows, other.cols);
        loop (local i: int = 0; i < this.rows; i = i + 1) {
            loop (local k: int = 0; k < this.cols; k = k + 1) {
                local a: float = this.data[(i * this.cols) + k];
                if (a == 0.0) {
                    continue;
                }
                loop (local j: int = 0; j < other.cols; j = j + 1) {
                    result.data[(i * other.cols) + j] = result.data[(i * other.cols) + j] + (a * other.data[(k * other.cols) + j]);
                }
            }
        }
        return result;
    }

    # Element-wise (Hadamard) product.
    frame hadamard(this: *Matrix, other: *Matrix) ret Matrix {
        this._sameShape(other);
        local result: Matrix = Matrix.new(this.rows, this.cols);
        loop (local i: int = 0; i < (this.rows * this.cols); i = i + 1) {
            result.data[i] = this.data[i] * other.data[i];
        }
        return result;
    }

    frame transpose(this: *Matrix) ret Matrix {
        local result: Matrix = Matrix.new(this.cols, this.rows);
        loop (local i: int = 0; i < this.rows; i = i + 1) {
            loop (local j: int = 0; j < this.cols; j = j + 1) {
                result.data[(j * this.rows) + i] = this.data[(i * this.cols) + j];
            }
        }
        return result;
    }

    frame trace(this: *Matrix) ret float {
        local sum: float = 0.0;
        local n: int = this.rows;
        if (this.cols < n) {
            n = this.cols;
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            sum = sum + this.data[(i * this.cols) + i];
        }
        return sum;
    }

    # Frobenius norm (square root of the sum of squared entries).
    frame norm(this: *Matrix) ret float {
        local sum: float = 0.0;
        loop (local i: int = 0; i < (this.rows * this.cols); i = i + 1) {
            sum = sum + (this.data[i] * this.data[i]);
        }
        # Newton iteration avoids a math dependency here.
        if (sum == 0.0) {
            return 0.0;
        }
        local root: float = sum;
        if (root < 1.0) {
            root = 1.0;
        }
        loop (local k: int = 0; k < 200; k = k + 1) {
            local next: float = 0.5 * (root + (sum / root));
            if (next == root) {
                break;
            }
            root = next;
        }
        return root;
    }

    frame _largest(this: *Matrix) ret float {
        local largest: float = 0.0;
        loop (local i: int = 0; i < (this.rows * this.cols); i = i + 1) {
            if (_matrixAbs(this.data[i]) > largest) {
                largest = _matrixAbs(this.data[i]);
            }
        }
        return largest;
    }

    # In-place LU factorisation of `lu` (square) with row permutation
    # `pivot`; returns the permutation sign, or 0 when singular.
    frame _decompose(lu: *Matrix, pivot: *int) ret int {
        local n: int = lu.rows;
        local sign: int = 1;
        local tolerance: float = MATRIX_EPSILON * lu._largest();
        loop (local i: int = 0; i < n; i = i + 1) {
            pivot[i] = i;
        }
        loop (local k: int = 0; k < n; k = k + 1) {
            local best: int = k;
            local bestValue: float = _matrixAbs(lu.data[(k * n) + k]);
            loop (local i: int = k + 1; i < n; i = i + 1) {
                local candidate: float = _matrixAbs(lu.data[(i * n) + k]);
                if (candidate > bestValue) {
                    best = i;
                    bestValue = candidate;
                }
            }
            if ((bestValue <= tolerance) || (bestValue == 0.0)) {
                return 0;
            }
            if (best != k) {
                loop (local j: int = 0; j < n; j = j + 1) {
                    local temp: float = lu.data[(k * n) + j];
                    lu.data[(k * n) + j] = lu.data[(best * n) + j];
                    lu.data[(best * n) + j] = temp;
                }
                local swap: int = pivot[k];
                pivot[k] = pivot[best];
                pivot[best] = swap;
                sign = -sign;
            }
            loop (local i: int = k + 1; i < n; i = i + 1) {
                local factor: float = lu.data[(i * n) + k] / lu.data[(k * n) + k];
                lu.data[(i * n) + k] = factor;
                loop (local j: int = k + 1; j < n; j = j + 1) {
                    lu.data[(i * n) + j] = lu.data[(i * n) + j] - (factor * lu.data[(k * n) + j]);
                }
            }
        }
        return sign;
    }

    # The determinant of a square matrix (0 when singular).
    frame determinant(this: *Matrix) ret float {
        if (!this.isSquare()) {
            throw "Matrix determinant needs a square matrix";
        }
        if (this.rows == 0) {
            return 1.0;
        }
        local lu: Matrix = this.clone();
        local pivot: *int = cast<*int>(malloc(cast<long>(this.rows) * sizeof<int>()));
        local sign: int = Matrix._decompose(&lu, pivot);
        local det: float = 0.0;
        if (sign != 0) {
            det = cast<float>(sign);
            loop (local i: int = 0; i < this.rows; i = i + 1) {
                det = det * lu.data[(i * this.rows) + i];
            }
        }
        free(cast<*void>(pivot));
        lu.destroy();
        return det;
    }

    # Solves this * x = rhs for x (rhs may have several columns). Throws
    # when the matrix is singular or the shapes do not match.
    frame solve(this: *Matrix, rhs: *Matrix) ret Matrix {
        if (!this.isSquare() || (rhs.rows != this.rows)) {
            throw "Matrix solve needs a square matrix and a matching right side";
        }
        local n: int = this.rows;
        local lu: Matrix = this.clone();
        local pivot: *int = cast<*int>(malloc(cast<long>(n + 1) * sizeof<int>()));
        if (Matrix._decompose(&lu, pivot) == 0) {
            free(cast<*void>(pivot));
            lu.destroy();
            throw "Matrix is singular";
        }
        local x: Matrix = Matrix.new(n, rhs.cols);
        loop (local c: int = 0; c < rhs.cols; c = c + 1) {
            # Forward substitution with the permuted right side.
            loop (local i: int = 0; i < n; i = i + 1) {
                local sum: float = rhs.data[(pivot[i] * rhs.cols) + c];
                loop (local j: int = 0; j < i; j = j + 1) {
                    sum = sum - (lu.data[(i * n) + j] * x.data[(j * rhs.cols) + c]);
                }
                x.data[(i * rhs.cols) + c] = sum;
            }
            # Back substitution.
            loop (local i: int = n - 1; i >= 0; i = i - 1) {
                local sum: float = x.data[(i * rhs.cols) + c];
                loop (local j: int = i + 1; j < n; j = j + 1) {
                    sum = sum - (lu.data[(i * n) + j] * x.data[(j * rhs.cols) + c]);
                }
                x.data[(i * rhs.cols) + c] = sum / lu.data[(i * n) + i];
            }
        }
        free(cast<*void>(pivot));
        lu.destroy();
        return x;
    }

    # The inverse of a square matrix; throws when it is singular.
    frame inverse(this: *Matrix) ret Matrix {
        local identity: Matrix = Matrix.identity(this.rows);
        local result: Matrix = this.solve(&identity);
        identity.destroy();
        return result;
    }

    # The rank, by Gaussian elimination with partial pivoting.
    frame rank(this: *Matrix) ret int {
        local work: Matrix = this.clone();
        local tolerance: float = MATRIX_EPSILON * work._largest();
        local rank: int = 0;
        local row: int = 0;
        loop (local col: int = 0; (col < work.cols) && (row < work.rows); col = col + 1) {
            local best: int = row;
            loop (local i: int = row + 1; i < work.rows; i = i + 1) {
                if (_matrixAbs(work.data[(i * work.cols) + col]) > _matrixAbs(work.data[(best * work.cols) + col])) {
                    best = i;
                }
            }
            local pivotValue: float = work.data[(best * work.cols) + col];
            if ((_matrixAbs(pivotValue) <= tolerance) || (pivotValue == 0.0)) {
                continue;
            }
            loop (local j: int = 0; j < work.cols; j = j + 1) {
                local temp: float = work.data[(row * work.cols) + j];
                work.data[(row * work.cols) + j] = work.data[(best * work.cols) + j];
                work.data[(best * work.cols) + j] = temp;
            }
            loop (local i: int = row + 1; i < work.rows; i = i + 1) {
                local factor: float = work.data[(i * work.cols) + col] / pivotValue;
                loop (local j: int = col; j < work.cols; j = j + 1) {
                    work.data[(i * work.cols) + j] = work.data[(i * work.cols) + j] - (factor * work.data[(row * work.cols) + j]);
                }
            }
            row = row + 1;
            rank = rank + 1;
        }
        work.destroy();
        return rank;
    }

    # Whether every entry differs by at most `tolerance`.
    frame approxEquals(this: *Matrix, other: *Matrix, tolerance: float) ret bool {
        if ((this.rows != other.rows) || (this.cols != other.cols)) {
            return false;
        }
        loop (local i: int = 0; i < (this.rows * this.cols); i = i + 1) {
            if (_matrixAbs(this.data[i] - other.data[i]) > tolerance) {
                return false;
            }
        }
        return true;
    }

    # Rows on separate lines, entries formatted with `%.<decimals>f`.
    frame toString(this: *Matrix, decimals: int) ret String {
        local out: StringBuilder = StringBuilder.new(64);
        local format: string = cast<string>(malloc(16));
        snprintf(format, 16, "%%.%df", decimals);
        local cell: string = cast<string>(malloc(64));
        loop (local i: int = 0; i < this.rows; i = i + 1) {
            out.appendChar('[');
            loop (local j: int = 0; j < this.cols; j = j + 1) {
                if (j > 0) {
                    out.append(", ");
                }
                local value: float = this.data[(i * this.cols) + j];
                if ((value == 0.0) || (_matrixAbs(value) < 0.0000000000005)) {
                    value = 0.0;
                }
                snprintf(cell, 64, format, value);
                out.append(cell);
            }
            out.append("]\n");
        }
        free(cast<*void>(format));
        free(cast<*void>(cell));
        local result: String;
        result.data = out.buffer;
        result.length = out.length;
        return result;
    }
}
