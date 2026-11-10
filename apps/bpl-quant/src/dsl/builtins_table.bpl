# QScript builtin catalogue: names and accepted argument counts.
# The VM implements them by index (see vm.bpl); keep both in the same order.

import [Text] from "../core/text.bpl";

export [Builtins];

global builtin_names: string[44] = ["len", "abs", "sqrt", "log", "exp", "floor", "ceil", "round", "min", "max", "pow", "push", "array", "range", "sum", "mean", "stdev", "sma", "ema", "rsi", "highest", "lowest", "print", "emit", "position", "str", "slice", "sort", "is_nil", "clamp", "sign", "normcdf", "bs_price", "random", "corr", "returns", "crossover", "atr", "bb_upper", "bb_lower", "quantile", "isnan", "pop", "contains"];
global builtin_min: int[44] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 1, 1, 1, 2, 2, 2, 3, 3, 0, 2, 2, 1, 3, 1, 1, 3, 1, 1, 6, 0, 2, 1, 3, 4, 3, 3, 2, 1, 1, 2];
global builtin_max: int[44] = [1, 1, 1, 1, 1, 1, 1, 1, 16, 16, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 3, 3, 16, 2, 2, 1, 3, 1, 1, 3, 1, 1, 6, 0, 2, 1, 3, 4, 3, 3, 2, 1, 1, 2];

struct Builtins {
    frame count() ret int {
        return 44;
    }

    frame find(name: string) ret int {
        loop (local i: int = 0; i < 44; i = i + 1) {
            if (Text.equals(builtin_names[i], name)) {
                return i;
            }
        }
        return -1;
    }

    frame name(id: int) ret string {
        if ((id < 0) || (id >= 44)) {
            return "?";
        }
        return builtin_names[id];
    }

    frame arityOk(id: int, argc: int) ret bool {
        return (argc >= builtin_min[id]) && (argc <= builtin_max[id]);
    }
}
