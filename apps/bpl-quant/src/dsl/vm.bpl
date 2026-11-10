# QScript virtual machine.
#
# A stack machine over tagged values. Arrays and strings live in VM-owned
# heaps addressed by index and are released together when the VM is
# destroyed, so scripts cannot leak or dangle. Execution is bounded by an
# instruction budget, a call-depth limit and an element budget for arrays,
# which makes it safe to run untrusted scripts inside a request handler.

import malloc, free, memcpy, snprintf from "std/c.bpl";
import [Math] from "std/math.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [Text] from "../core/text.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [Special] from "../math/special.bpl";
import [Sort] from "../math/sort.bpl";
import [Stats] from "../math/stats.bpl";
import [Indicators] from "../series/indicators.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "../quant/black_scholes.bpl";
import [Compiler], [Proto], [Op] from "./compiler.bpl";
import [Builtins] from "./builtins_table.bpl";

export [Vm];
export [Value];
export [VKind];
export [VmLimits];

enum VKind {
    Nil,
    Num,
    Bool,
    Str,
    Arr,
}

struct Value {
    kind: VKind,
    num: float,
    ref: int,
}

struct VArr {
    items: *Value,
    len: int,
    cap: int,
}

struct Frame {
    proto: int,
    ip: int,
    base: int,
}

struct VmLimits {
    max_instructions: long,
    max_depth: int,
    max_elements: long,
    max_output: int,
}

struct Emitted {
    name: string,
    value: Value,
}

struct Vm {
    code: *Compiler,
    stack: *Value,
    sp: int,
    stack_cap: int,
    frames: *Frame,
    frame_count: int,
    globals: *Value,
    global_count: int,
    arrays: *VArr,
    array_count: int,
    array_cap: int,
    strs: *string,
    str_count: int,
    str_cap: int,
    limits: VmLimits,
    instructions: long,
    elements: long,
    error: string,
    error_line: int,
    output: StringBuilder,
    emitted: Emitted[64],
    emit_count: int,
    positions: *float,
    position_count: int,
    rng: Xoshiro,

    # Initializes in place (the struct is large; see BUG-803).
    frame init(this: *Vm, code: *Compiler, limits: VmLimits) {
        local vm: *Vm = this;
        vm.code = code;
        vm.stack_cap = 8192;
        vm.stack = cast<*Value>(malloc(cast<long>(vm.stack_cap) * sizeof(Value)));
        vm.sp = 0;
        vm.frames = cast<*Frame>(malloc(cast<long>(limits.max_depth + 1) * sizeof(Frame)));
        vm.frame_count = 0;
        vm.global_count = code.global_count;
        vm.globals = cast<*Value>(malloc(cast<long>(vm.global_count + 1) * sizeof(Value)));
        loop (local i: int = 0; i < vm.global_count; i = i + 1) {
            vm.globals[i] = Vm.nil();
        }
        vm.array_cap = 64;
        vm.array_count = 0;
        vm.arrays = cast<*VArr>(malloc(cast<long>(vm.array_cap) * sizeof(VArr)));
        vm.str_cap = 64;
        vm.str_count = 0;
        vm.strs = cast<*string>(malloc(cast<long>(vm.str_cap) * sizeof(string)));
        vm.limits = limits;
        vm.instructions = 0;
        vm.elements = 0;
        vm.error = nullptr;
        vm.error_line = 0;
        vm.output = StringBuilder.new(256);
        vm.emit_count = 0;
        vm.positions = nullptr;
        vm.position_count = 0;
        vm.rng = Xoshiro.new(cast<u64>(42));
    }

    frame destroy(this: *Vm) {
        loop (local i: int = 0; i < this.array_count; i = i + 1) {
            free(cast<*void>(this.arrays[i].items));
        }
        loop (local i: int = 0; i < this.str_count; i = i + 1) {
            Text.release(this.strs[i]);
        }
        free(cast<*void>(this.arrays));
        free(cast<*void>(this.strs));
        free(cast<*void>(this.stack));
        free(cast<*void>(this.frames));
        free(cast<*void>(this.globals));
        if (this.positions != nullptr) {
            free(cast<*void>(this.positions));
        }
        this.output.destroy();
    }

    frame nil() ret Value {
        return Value { kind: VKind.Nil, num: 0.0, ref: 0 };
    }

    frame number(x: float) ret Value {
        return Value { kind: VKind.Num, num: x, ref: 0 };
    }

    frame boolean(b: bool) ret Value {
        return Value { kind: VKind.Bool, num: b ? 1.0 : 0.0, ref: 0 };
    }

    frame fail(this: *Vm, message: string) {
        if (this.error == nullptr) {
            this.error = message;
            if (this.frame_count > 0) {
                local f: *Frame = this.frames + (this.frame_count - 1);
                local p: *Proto = this.code.protos + f.proto;
                local at: int = f.ip > 0 ? f.ip - 1 : 0;
                this.error_line = at < p.len ? p.lines[at] : 0;
            }
        }
    }

    # ---- Heap ----

    frame newArray(this: *Vm, capacity: int) ret Value {
        if (this.array_count == this.array_cap) {
            local next_cap: int = this.array_cap * 2;
            local next: *VArr = cast<*VArr>(malloc(cast<long>(next_cap) * sizeof(VArr)));
            memcpy(cast<*void>(next), cast<*void>(this.arrays), cast<long>(this.array_count) * sizeof(VArr));
            free(cast<*void>(this.arrays));
            this.arrays = next;
            this.array_cap = next_cap;
        }
        local c: int = capacity < 4 ? 4 : capacity;
        this.elements = this.elements + cast<long>(c);
        if (this.elements > this.limits.max_elements) {
            this.fail("array memory budget exceeded");
            return Vm.nil();
        }
        this.arrays[this.array_count] = VArr { items: cast<*Value>(malloc(cast<long>(c) * sizeof(Value))), len: 0, cap: c };
        this.array_count = this.array_count + 1;
        return Value { kind: VKind.Arr, num: 0.0, ref: this.array_count - 1 };
    }

    frame arr(this: *Vm, v: Value) ret *VArr {
        return this.arrays + v.ref;
    }

    frame arrayPush(this: *Vm, a: *VArr, v: Value) {
        if (a.len == a.cap) {
            local next_cap: int = a.cap * 2;
            this.elements = this.elements + cast<long>(a.cap);
            if (this.elements > this.limits.max_elements) {
                this.fail("array memory budget exceeded");
                return;
            }
            local next: *Value = cast<*Value>(malloc(cast<long>(next_cap) * sizeof(Value)));
            memcpy(cast<*void>(next), cast<*void>(a.items), cast<long>(a.len) * sizeof(Value));
            free(cast<*void>(a.items));
            a.items = next;
            a.cap = next_cap;
        }
        a.items[a.len] = v;
        a.len = a.len + 1;
    }

    frame fromFloats(this: *Vm, values: *float, n: int) ret Value {
        local v: Value = this.newArray(n);
        if (this.error != nullptr) {
            return v;
        }
        local a: *VArr = this.arr(v);
        loop (local i: int = 0; i < n; i = i + 1) {
            a.items[i] = Vm.number(values[i]);
        }
        a.len = n;
        return v;
    }

    # Copies a numeric array into a fresh float buffer (non-numbers become NaN).
    frame toFloats(this: *Vm, v: Value, out_n: *int) ret *float {
        local a: *VArr = this.arr(v);
        local out: *float = cast<*float>(malloc(cast<long>(a.len + 1) * sizeof(float)));
        loop (local i: int = 0; i < a.len; i = i + 1) {
            out[i] = a.items[i].kind == VKind.Num ? a.items[i].num : 0.0 / 0.0;
        }
        *out_n = a.len;
        return out;
    }

    frame newString(this: *Vm, s: string) ret Value {
        if (this.str_count == this.str_cap) {
            local next_cap: int = this.str_cap * 2;
            local next: *string = cast<*string>(malloc(cast<long>(next_cap) * sizeof(string)));
            loop (local i: int = 0; i < this.str_count; i = i + 1) {
                next[i] = this.strs[i];
            }
            free(cast<*void>(this.strs));
            this.strs = next;
            this.str_cap = next_cap;
        }
        this.strs[this.str_count] = s;
        this.str_count = this.str_count + 1;
        this.elements = this.elements + cast<long>((Text.length(s) / 16) + 1);
        return Value { kind: VKind.Str, num: 0.0, ref: this.str_count - 1 };
    }

    frame strOf(this: *Vm, v: Value) ret string {
        return this.strs[v.ref];
    }

    # ---- Host bindings ----

    frame setGlobal(this: *Vm, name: string, v: Value) ret bool {
        local g: int = this.code.findGlobal(name);
        if (g < 0) {
            return false;
        }
        this.globals[g] = v;
        return true;
    }

    frame bindSeries(this: *Vm, name: string, values: *float, n: int) {
        local v: Value = this.fromFloats(values, n);
        this.setGlobal(name, v);
    }

    frame getGlobal(this: *Vm, name: string) ret Value {
        local g: int = this.code.findGlobal(name);
        if (g < 0) {
            return Vm.nil();
        }
        return this.globals[g];
    }

    frame preparePositions(this: *Vm, n: int) {
        if (this.positions != nullptr) {
            free(cast<*void>(this.positions));
        }
        this.positions = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            this.positions[i] = 0.0 / 0.0;
        }
        this.position_count = n;
    }

    # ---- Value helpers ----

    frame truthy(v: Value) ret bool {
        if (v.kind == VKind.Nil) {
            return false;
        }
        if ((v.kind == VKind.Bool) || (v.kind == VKind.Num)) {
            return (v.num != 0.0) && (v.num == v.num);
        }
        return true;
    }

    frame equal(this: *Vm, a: Value, b: Value) ret bool {
        if (a.kind != b.kind) {
            return false;
        }
        if (a.kind == VKind.Nil) {
            return true;
        }
        if (a.kind == VKind.Str) {
            return Text.equals(this.strOf(a), this.strOf(b));
        }
        if (a.kind == VKind.Arr) {
            return a.ref == b.ref;
        }
        return a.num == b.num;
    }

    frame kindName(k: VKind) ret string {
        return match (k) {
            VKind.Nil => "nil",
            VKind.Num => "number",
            VKind.Bool => "bool",
            VKind.Str => "string",
            VKind.Arr => "array",
        };
    }

    frame format(this: *Vm, v: Value, sb: *StringBuilder, depth: int) {
        if (v.kind == VKind.Nil) {
            sb.append("nil");
        } else if (v.kind == VKind.Bool) {
            sb.append(v.num != 0.0 ? "true" : "false");
        } else if (v.kind == VKind.Num) {
            local buf: char[48];
            snprintf(cast<string>(&buf[0]), 48, "%.10g", v.num);
            sb.append(cast<string>(&buf[0]));
        } else if (v.kind == VKind.Str) {
            sb.append(this.strOf(v));
        } else {
            local a: *VArr = this.arr(v);
            if (depth > 4) {
                sb.append("[...]");
                return;
            }
            sb.append("[");
            local shown: int = a.len < 20 ? a.len : 20;
            loop (local i: int = 0; i < shown; i = i + 1) {
                if (i > 0) {
                    sb.append(", ");
                }
                this.format(a.items[i], sb, depth + 1);
            }
            if (a.len > shown) {
                sb.append(", ...");
            }
            sb.append("]");
        }
    }

    # ---- Stack ----

    frame push(this: *Vm, v: Value) {
        if (this.sp >= this.stack_cap) {
            this.fail("value stack overflow");
            return;
        }
        this.stack[this.sp] = v;
        this.sp = this.sp + 1;
    }

    frame pop(this: *Vm) ret Value {
        if (this.sp <= 0) {
            this.fail("value stack underflow");
            return Vm.nil();
        }
        this.sp = this.sp - 1;
        return this.stack[this.sp];
    }

    frame peekValue(this: *Vm) ret Value {
        if (this.sp <= 0) {
            return Vm.nil();
        }
        return this.stack[this.sp - 1];
    }

    frame num(this: *Vm, v: Value, what: string) ret float {
        if (v.kind != VKind.Num) {
            this.fail(what);
            return 0.0;
        }
        return v.num;
    }

    frame arithmetic(this: *Vm, op: int) {
        local b: Value = this.pop();
        local a: Value = this.pop();
        if ((op == Op.ADD()) && (a.kind == VKind.Str)) {
            local sb: StringBuilder = StringBuilder.new(64);
            sb.append(this.strOf(a));
            this.format(b, &sb, 0);
            local joined: string = Text.copy(sb.toString());
            sb.destroy();
            this.push(this.newString(joined));
            return;
        }
        if ((a.kind != VKind.Num) || (b.kind != VKind.Num)) {
            this.fail("arithmetic needs numbers");
            return;
        }
        local x: float = a.num;
        local y: float = b.num;
        local r: float = 0.0;
        if (op == Op.ADD()) {
            r = x + y;
        } else if (op == Op.SUB()) {
            r = x - y;
        } else if (op == Op.MUL()) {
            r = x * y;
        } else if (op == Op.DIV()) {
            if (y == 0.0) {
                this.fail("division by zero");
                return;
            }
            r = x / y;
        } else if (op == Op.MOD()) {
            if (y == 0.0) {
                this.fail("modulo by zero");
                return;
            }
            r = Math.mod(x, y);
        } else {
            r = Math.pow(x, y);
        }
        this.push(Vm.number(r));
    }

    frame comparison(this: *Vm, op: int) {
        local b: Value = this.pop();
        local a: Value = this.pop();
        if (op == Op.EQ()) {
            this.push(Vm.boolean(this.equal(a, b)));
            return;
        }
        if (op == Op.NE()) {
            this.push(Vm.boolean(!this.equal(a, b)));
            return;
        }
        local c: int = 0;
        if ((a.kind == VKind.Num) && (b.kind == VKind.Num)) {
            c = a.num < b.num ? -1 : (a.num > b.num ? 1 : 0);
            if ((a.num != a.num) || (b.num != b.num)) {
                # NaN compares false with everything.
                this.push(Vm.boolean(false));
                return;
            }
        } else if ((a.kind == VKind.Str) && (b.kind == VKind.Str)) {
            local s: int = Text.equals(this.strOf(a), this.strOf(b)) ? 0 : 1;
            if (s != 0) {
                c = Vm.compareStrings(this.strOf(a), this.strOf(b));
            }
        } else {
            this.fail("ordering needs two numbers or two strings");
            return;
        }
        local r: bool = false;
        if (op == Op.LT()) {
            r = c < 0;
        } else if (op == Op.LE()) {
            r = c <= 0;
        } else if (op == Op.GT()) {
            r = c > 0;
        } else {
            r = c >= 0;
        }
        this.push(Vm.boolean(r));
    }

    frame compareStrings(a: string, b: string) ret int {
        local i: int = 0;
        loop {
            if (a[i] != b[i]) {
                return a[i] < b[i] ? -1 : 1;
            }
            if (a[i] == cast<char>(0)) {
                return 0;
            }
            i = i + 1;
        }
        return 0;
    }

    frame indexOf(this: *Vm, container: Value, index: Value, out: *int) ret bool {
        if (container.kind != VKind.Arr) {
            this.fail("only arrays can be indexed");
            return false;
        }
        if ((index.kind != VKind.Num) || (index.num != Math.floor(index.num))) {
            this.fail("array index must be an integer");
            return false;
        }
        local a: *VArr = this.arr(container);
        local i: int = cast<int>(index.num);
        # Negative indexes count from the end.
        if (i < 0) {
            i = i + a.len;
        }
        if ((i < 0) || (i >= a.len)) {
            this.fail("array index out of range");
            return false;
        }
        *out = i;
        return true;
    }

    # ---- Interpreter loop ----

    frame run(this: *Vm) ret bool {
        this.frames[0] = Frame { proto: 0, ip: 0, base: 0 };
        this.frame_count = 1;
        this.sp = 0;
        return this.execute(0);
    }

    # Calls a script function by name with numeric arguments; result in *out.
    frame callFunction(this: *Vm, name: string, args: *Value, argc: int, out: *Value) ret bool {
        local fn_index: int = this.code.findProto(name);
        if (fn_index < 0) {
            this.fail("function not defined");
            return false;
        }
        if (this.code.protos[fn_index].arity != argc) {
            this.fail("wrong number of arguments");
            return false;
        }
        local floor_frames: int = this.frame_count;
        local base: int = this.sp;
        loop (local i: int = 0; i < argc; i = i + 1) {
            this.push(args[i]);
        }
        if (!this.enterFunction(fn_index, argc)) {
            return false;
        }
        if (!this.execute(floor_frames)) {
            return false;
        }
        *out = this.pop();
        this.sp = base;
        return true;
    }

    frame enterFunction(this: *Vm, fn_index: int, argc: int) ret bool {
        if (this.frame_count >= this.limits.max_depth) {
            this.fail("call depth limit exceeded");
            return false;
        }
        local p: *Proto = this.code.protos + fn_index;
        local base: int = this.sp - argc;
        local extra: int = p.locals - argc;
        if ((this.sp + extra + 64) >= this.stack_cap) {
            this.fail("value stack overflow");
            return false;
        }
        loop (local i: int = 0; i < extra; i = i + 1) {
            this.stack[this.sp] = Vm.nil();
            this.sp = this.sp + 1;
        }
        this.frames[this.frame_count] = Frame { proto: fn_index, ip: 0, base: base };
        this.frame_count = this.frame_count + 1;
        return true;
    }

    # Runs until the frame count drops to `floor_frames` (a RETURN out of the
    # entry function) or HALT.
    frame execute(this: *Vm, floor_frames: int) ret bool {
        loop (this.error == nullptr) {
            local f: *Frame = this.frames + (this.frame_count - 1);
            local p: *Proto = this.code.protos + f.proto;
            if (f.ip >= p.len) {
                this.fail("instruction pointer out of range");
                break;
            }
            this.instructions = this.instructions + 1;
            if (this.instructions > this.limits.max_instructions) {
                this.fail("instruction budget exceeded");
                break;
            }
            local op: int = p.code[f.ip];
            f.ip = f.ip + 1;
            switch (op) {
                case 1: {
                    local k: int = p.code[f.ip];
                    f.ip = f.ip + 1;
                    this.push(Vm.number(this.code.consts[k]));
                    break;
                }
                case 2: {
                    this.push(Vm.nil());
                    break;
                }
                case 3: {
                    this.push(Vm.boolean(true));
                    break;
                }
                case 4: {
                    this.push(Vm.boolean(false));
                    break;
                }
                case 5: {
                    this.pop();
                    break;
                }
                case 6: {
                    local slot: int = p.code[f.ip];
                    f.ip = f.ip + 1;
                    this.push(this.stack[f.base + slot]);
                    break;
                }
                case 7: {
                    local slot: int = p.code[f.ip];
                    f.ip = f.ip + 1;
                    this.stack[f.base + slot] = this.pop();
                    break;
                }
                case 8: {
                    local g: int = p.code[f.ip];
                    f.ip = f.ip + 1;
                    this.push(this.globals[g]);
                    break;
                }
                case 9: {
                    local g: int = p.code[f.ip];
                    f.ip = f.ip + 1;
                    this.globals[g] = this.pop();
                    break;
                }
                case 10: {
                    fallthrough;
                }
                case 11: {
                    fallthrough;
                }
                case 12: {
                    fallthrough;
                }
                case 13: {
                    fallthrough;
                }
                case 14: {
                    fallthrough;
                }
                case 15: {
                    this.arithmetic(op);
                    break;
                }
                case 16: {
                    local v: Value = this.pop();
                    this.push(Vm.number(-this.num(v, "negation needs a number")));
                    break;
                }
                case 17: {
                    local v: Value = this.pop();
                    this.push(Vm.boolean(!Vm.truthy(v)));
                    break;
                }
                case 18: {
                    fallthrough;
                }
                case 19: {
                    fallthrough;
                }
                case 20: {
                    fallthrough;
                }
                case 21: {
                    fallthrough;
                }
                case 22: {
                    fallthrough;
                }
                case 23: {
                    this.comparison(op);
                    break;
                }
                case 24: {
                    local off: int = p.code[f.ip];
                    f.ip = f.ip + 1 + off;
                    break;
                }
                case 25: {
                    local off: int = p.code[f.ip];
                    f.ip = f.ip + 1;
                    if (!Vm.truthy(this.pop())) {
                        f.ip = f.ip + off;
                    }
                    break;
                }
                case 26: {
                    local off: int = p.code[f.ip];
                    f.ip = f.ip + 1;
                    if (!Vm.truthy(this.peekValue())) {
                        f.ip = f.ip + off;
                    }
                    break;
                }
                case 27: {
                    local off: int = p.code[f.ip];
                    f.ip = f.ip + 1;
                    if (Vm.truthy(this.peekValue())) {
                        f.ip = f.ip + off;
                    }
                    break;
                }
                case 28: {
                    local fn_index: int = p.code[f.ip];
                    local argc: int = p.code[f.ip + 1];
                    f.ip = f.ip + 2;
                    this.enterFunction(fn_index, argc);
                    break;
                }
                case 29: {
                    local id: int = p.code[f.ip];
                    local argc: int = p.code[f.ip + 1];
                    f.ip = f.ip + 2;
                    local args: *Value = this.stack + (this.sp - argc);
                    local result: Value = this.builtin(id, args, argc);
                    this.sp = this.sp - argc;
                    this.push(result);
                    break;
                }
                case 30: {
                    local result: Value = this.pop();
                    this.sp = f.base;
                    this.frame_count = this.frame_count - 1;
                    this.push(result);
                    if (this.frame_count <= floor_frames) {
                        return this.error == nullptr;
                    }
                    break;
                }
                case 31: {
                    local n: int = p.code[f.ip];
                    f.ip = f.ip + 1;
                    local v: Value = this.newArray(n);
                    if (this.error != nullptr) {
                        break;
                    }
                    local a: *VArr = this.arr(v);
                    loop (local i: int = 0; i < n; i = i + 1) {
                        a.items[i] = this.stack[(this.sp - n) + i];
                    }
                    a.len = n;
                    this.sp = this.sp - n;
                    this.push(v);
                    break;
                }
                case 32: {
                    local index: Value = this.pop();
                    local container: Value = this.pop();
                    local i: int = 0;
                    if (this.indexOf(container, index, &i)) {
                        this.push(this.arr(container).items[i]);
                    }
                    break;
                }
                case 33: {
                    local value: Value = this.pop();
                    local index: Value = this.pop();
                    local container: Value = this.pop();
                    local i: int = 0;
                    if (this.indexOf(container, index, &i)) {
                        this.arr(container).items[i] = value;
                    }
                    break;
                }
                case 34: {
                    local k: int = p.code[f.ip];
                    f.ip = f.ip + 1;
                    this.push(this.newString(Text.copy(this.code.strings[k])));
                    break;
                }
                case 35: {
                    local v: Value = this.pop();
                    if (v.kind != VKind.Arr) {
                        this.fail("for-in needs an array");
                        break;
                    }
                    this.push(Vm.number(cast<float>(this.arr(v).len)));
                    break;
                }
                case 36: {
                    this.push(this.peekValue());
                    break;
                }
                case 37: {
                    return this.error == nullptr;
                }
                default: {
                    this.fail("invalid opcode");
                    break;
                }
            }
        }
        return false;
    }

    # ---- Builtins ----

    frame argArray(this: *Vm, v: Value, what: string) ret *VArr {
        if (v.kind != VKind.Arr) {
            this.fail(what);
            return nullptr;
        }
        return this.arr(v);
    }

    frame indicator(this: *Vm, id: int, args: *Value) ret Value {
        local a: *VArr = this.argArray(args[0], "indicator input must be an array");
        if (a == nullptr) {
            return Vm.nil();
        }
        local period: float = this.num(args[1], "indicator period must be a number");
        if (this.error != nullptr) {
            return Vm.nil();
        }
        local p: int = cast<int>(period);
        if ((p < 1) || (p > a.len)) {
            this.fail("indicator period out of range");
            return Vm.nil();
        }
        local n: int = 0;
        local x: *float = this.toFloats(args[0], &n);
        local out: *float = Indicators.alloc(n);
        if (id == 17) {
            Indicators.sma(x, n, p, out);
        } else if (id == 18) {
            Indicators.ema(x, n, p, out);
        } else {
            Indicators.rsi(x, n, p, out);
        }
        local v: Value = this.fromFloats(out, n);
        free(cast<*void>(x));
        free(cast<*void>(out));
        return v;
    }

    frame bands(this: *Vm, upper: bool, args: *Value) ret Value {
        local n: int = 0;
        if (this.argArray(args[0], "bands input must be an array") == nullptr) {
            return Vm.nil();
        }
        local period: int = cast<int>(this.num(args[1], "period must be a number"));
        local k: float = this.num(args[2], "width must be a number");
        if (this.error != nullptr) {
            return Vm.nil();
        }
        local x: *float = this.toFloats(args[0], &n);
        if ((period < 2) || (period > n)) {
            free(cast<*void>(x));
            this.fail("period out of range");
            return Vm.nil();
        }
        local sma: *float = Indicators.alloc(n);
        Indicators.sma(x, n, period, sma);
        loop (local i: int = period - 1; i < n; i = i + 1) {
            local s: float = 0.0;
            loop (local j: int = (i - period) + 1; j <= i; j = j + 1) {
                local d: float = x[j] - sma[i];
                s = s + (d * d);
            }
            local sd: float = Math.sqrt(s / cast<float>(period));
            sma[i] = upper ? sma[i] + (k * sd) : sma[i] - (k * sd);
        }
        local v: Value = this.fromFloats(sma, n);
        free(cast<*void>(x));
        free(cast<*void>(sma));
        return v;
    }

    frame windowExtreme(this: *Vm, highest: bool, args: *Value) ret Value {
        local a: *VArr = this.argArray(args[0], "highest/lowest input must be an array");
        if (a == nullptr) {
            return Vm.nil();
        }
        local n: int = cast<int>(this.num(args[1], "window must be a number"));
        local i: int = cast<int>(this.num(args[2], "index must be a number"));
        if (this.error != nullptr) {
            return Vm.nil();
        }
        if ((n < 1) || (i < 0) || (i >= a.len)) {
            this.fail("window or index out of range");
            return Vm.nil();
        }
        local start: int = ((i - n) + 1) < 0 ? 0 : (i - n) + 1;
        local best: float = a.items[i].num;
        loop (local k: int = start; k <= i; k = k + 1) {
            local x: float = a.items[k].num;
            if ((highest && (x > best)) || (!highest && (x < best))) {
                best = x;
            }
        }
        return Vm.number(best);
    }

    frame builtin(this: *Vm, id: int, args: *Value, argc: int) ret Value {
        if (id == 0) {
            local v: Value = args[0];
            if (v.kind == VKind.Arr) {
                return Vm.number(cast<float>(this.arr(v).len));
            }
            if (v.kind == VKind.Str) {
                return Vm.number(cast<float>(Text.length(this.strOf(v))));
            }
            this.fail("len needs an array or string");
            return Vm.nil();
        }
        if ((id >= 1) && (id <= 7)) {
            local x: float = this.num(args[0], "math function needs a number");
            if (id == 1) {
                return Vm.number(Math.abs(x));
            }
            if (id == 2) {
                return Vm.number(x >= 0.0 ? Math.sqrt(x) : 0.0 / 0.0);
            }
            if (id == 3) {
                return Vm.number(x > 0.0 ? Math.log(x) : 0.0 / 0.0);
            }
            if (id == 4) {
                return Vm.number(Math.exp(x));
            }
            if (id == 5) {
                return Vm.number(Math.floor(x));
            }
            if (id == 6) {
                return Vm.number(Math.ceil(x));
            }
            return Vm.number(Math.round(x));
        }
        if ((id == 8) || (id == 9)) {
            # min/max over arguments, or over one array argument.
            local best: float = 0.0;
            local seen: bool = false;
            if ((argc == 1) && (args[0].kind == VKind.Arr)) {
                local a: *VArr = this.arr(args[0]);
                loop (local i: int = 0; i < a.len; i = i + 1) {
                    if ((a.items[i].kind == VKind.Num) && (a.items[i].num == a.items[i].num)) {
                        local x: float = a.items[i].num;
                        if (!seen || ((id == 8) && (x < best)) || ((id == 9) && (x > best))) {
                            best = x;
                            seen = true;
                        }
                    }
                }
                return seen ? Vm.number(best) : Vm.nil();
            }
            loop (local i: int = 0; i < argc; i = i + 1) {
                local x: float = this.num(args[i], "min/max need numbers");
                if (!seen || ((id == 8) && (x < best)) || ((id == 9) && (x > best))) {
                    best = x;
                    seen = true;
                }
            }
            return Vm.number(best);
        }
        if (id == 10) {
            return Vm.number(Math.pow(this.num(args[0], "pow needs numbers"), this.num(args[1], "pow needs numbers")));
        }
        if (id == 11) {
            local a: *VArr = this.argArray(args[0], "push needs an array");
            if (a != nullptr) {
                this.arrayPush(a, args[1]);
            }
            return args[0];
        }
        if (id == 12) {
            local n: float = this.num(args[0], "array size must be a number");
            if ((this.error != nullptr) || (n < 0.0) || (n > 10000000.0)) {
                this.fail("array size out of range");
                return Vm.nil();
            }
            local count: int = cast<int>(n);
            local fill: Value = argc > 1 ? args[1] : Vm.nil();
            local v: Value = this.newArray(count);
            if (this.error != nullptr) {
                return Vm.nil();
            }
            local a: *VArr = this.arr(v);
            loop (local i: int = 0; i < count; i = i + 1) {
                a.items[i] = fill;
            }
            a.len = count;
            return v;
        }
        if (id == 13) {
            local lo: float = this.num(args[0], "range needs numbers");
            local hi: float = this.num(args[1], "range needs numbers");
            if ((this.error != nullptr) || ((hi - lo) > 10000000.0)) {
                this.fail("range too large");
                return Vm.nil();
            }
            local count: int = hi > lo ? cast<int>(Math.ceil(hi - lo)) : 0;
            local v: Value = this.newArray(count);
            if (this.error != nullptr) {
                return Vm.nil();
            }
            local a: *VArr = this.arr(v);
            loop (local i: int = 0; i < count; i = i + 1) {
                a.items[i] = Vm.number(lo + cast<float>(i));
            }
            a.len = count;
            return v;
        }
        if ((id >= 14) && (id <= 16)) {
            if (this.argArray(args[0], "aggregate needs an array") == nullptr) {
                return Vm.nil();
            }
            local n: int = 0;
            local x: *float = this.toFloats(args[0], &n);
            local r: float = 0.0;
            if (id == 14) {
                r = Stats.sum(x, n);
            } else if (id == 15) {
                r = Stats.mean(x, n);
            } else {
                r = Stats.stddev(x, n);
            }
            free(cast<*void>(x));
            return Vm.number(r);
        }
        if ((id >= 17) && (id <= 19)) {
            return this.indicator(id, args);
        }
        if ((id == 20) || (id == 21)) {
            return this.windowExtreme(id == 20, args);
        }
        if (id == 22) {
            loop (local i: int = 0; i < argc; i = i + 1) {
                if (i > 0) {
                    this.output.append(" ");
                }
                this.format(args[i], &this.output, 0);
            }
            this.output.append("\n");
            if (this.output.len() > this.limits.max_output) {
                this.fail("output limit exceeded");
            }
            return Vm.nil();
        }
        if (id == 23) {
            if (args[0].kind != VKind.Str) {
                this.fail("emit needs a string name");
                return Vm.nil();
            }
            if (this.emit_count >= 64) {
                this.fail("too many emitted values (max 64)");
                return Vm.nil();
            }
            this.emitted[this.emit_count] = Emitted { name: this.strOf(args[0]), value: args[1] };
            this.emit_count = this.emit_count + 1;
            return Vm.nil();
        }
        if (id == 24) {
            local i: float = this.num(args[0], "position index must be a number");
            local q: float = this.num(args[1], "position size must be a number");
            if (this.error != nullptr) {
                return Vm.nil();
            }
            local k: int = cast<int>(i);
            if ((this.positions == nullptr) || (k < 0) || (k >= this.position_count)) {
                this.fail("position index out of range");
                return Vm.nil();
            }
            this.positions[k] = q;
            return Vm.nil();
        }
        if (id == 25) {
            local sb: StringBuilder = StringBuilder.new(32);
            this.format(args[0], &sb, 0);
            local s: string = Text.copy(sb.toString());
            sb.destroy();
            return this.newString(s);
        }
        if (id == 26) {
            local a: *VArr = this.argArray(args[0], "slice needs an array");
            local lo: int = cast<int>(this.num(args[1], "slice bounds must be numbers"));
            local hi: int = cast<int>(this.num(args[2], "slice bounds must be numbers"));
            if (this.error != nullptr) {
                return Vm.nil();
            }
            if (lo < 0) {
                lo = 0;
            }
            if (hi > a.len) {
                hi = a.len;
            }
            local count: int = hi > lo ? hi - lo : 0;
            local base: int = args[0].ref;
            local v: Value = this.newArray(count);
            if (this.error != nullptr) {
                return Vm.nil();
            }
            local src: *VArr = this.arrays + base;
            local dst: *VArr = this.arr(v);
            loop (local i: int = 0; i < count; i = i + 1) {
                dst.items[i] = src.items[lo + i];
            }
            dst.len = count;
            return v;
        }
        if (id == 27) {
            if (this.argArray(args[0], "sort needs an array") == nullptr) {
                return Vm.nil();
            }
            local n: int = 0;
            local x: *float = this.toFloats(args[0], &n);
            Sort.floats(x, n);
            local v: Value = this.fromFloats(x, n);
            free(cast<*void>(x));
            return v;
        }
        if (id == 28) {
            return Vm.boolean(args[0].kind == VKind.Nil);
        }
        if (id == 29) {
            local x: float = this.num(args[0], "clamp needs numbers");
            local lo: float = this.num(args[1], "clamp needs numbers");
            local hi: float = this.num(args[2], "clamp needs numbers");
            return Vm.number(x < lo ? lo : (x > hi ? hi : x));
        }
        if (id == 30) {
            local x: float = this.num(args[0], "sign needs a number");
            return Vm.number(x > 0.0 ? 1.0 : (x < 0.0 ? -1.0 : 0.0));
        }
        if (id == 31) {
            return Vm.number(Special.normCdf(this.num(args[0], "normcdf needs a number")));
        }
        if (id == 32) {
            if (args[0].kind != VKind.Str) {
                this.fail("bs_price type must be \"call\" or \"put\"");
                return Vm.nil();
            }
            local kind: OptionKind = Text.equals(this.strOf(args[0]), "put") ? OptionKind.Put : OptionKind.Call;
            local sp: OptionSpec = OptionSpec.new(kind, this.num(args[1], "spot"), this.num(args[2], "strike"), this.num(args[3], "rate"), 0.0, this.num(args[4], "vol"), this.num(args[5], "expiry"));
            if (this.error != nullptr) {
                return Vm.nil();
            }
            local problem: string = sp.validate();
            if (problem != nullptr) {
                this.fail(problem);
                return Vm.nil();
            }
            return Vm.number(BlackScholes.price(&sp));
        }
        if (id == 33) {
            return Vm.number(this.rng.nextFloat());
        }
        if (id == 34) {
            if ((this.argArray(args[0], "corr needs arrays") == nullptr) || (this.argArray(args[1], "corr needs arrays") == nullptr)) {
                return Vm.nil();
            }
            local na: int = 0;
            local nb: int = 0;
            local x: *float = this.toFloats(args[0], &na);
            local y: *float = this.toFloats(args[1], &nb);
            local n: int = na < nb ? na : nb;
            local r: float = Stats.correlation(x, y, n);
            free(cast<*void>(x));
            free(cast<*void>(y));
            return Vm.number(r);
        }
        if (id == 35) {
            if (this.argArray(args[0], "returns needs an array") == nullptr) {
                return Vm.nil();
            }
            local n: int = 0;
            local x: *float = this.toFloats(args[0], &n);
            local out: *float = Indicators.alloc(n);
            loop (local i: int = 1; i < n; i = i + 1) {
                out[i] = x[i - 1] != 0.0 ? (x[i] / x[i - 1]) - 1.0 : 0.0 / 0.0;
            }
            local v: Value = this.fromFloats(out, n);
            free(cast<*void>(x));
            free(cast<*void>(out));
            return v;
        }
        if (id == 36) {
            local a: *VArr = this.argArray(args[0], "crossover needs arrays");
            local b: *VArr = this.argArray(args[1], "crossover needs arrays");
            local i: int = cast<int>(this.num(args[2], "crossover index must be a number"));
            if (this.error != nullptr) {
                return Vm.nil();
            }
            if ((i < 1) || (i >= a.len) || (i >= b.len)) {
                return Vm.number(0.0);
            }
            local a0: float = a.items[i - 1].num;
            local a1: float = a.items[i].num;
            local b0: float = b.items[i - 1].num;
            local b1: float = b.items[i].num;
            if ((a0 <= b0) && (a1 > b1)) {
                return Vm.number(1.0);
            }
            if ((a0 >= b0) && (a1 < b1)) {
                return Vm.number(-1.0);
            }
            return Vm.number(0.0);
        }
        if (id == 37) {
            local h: *VArr = this.argArray(args[0], "atr needs arrays");
            local l: *VArr = this.argArray(args[1], "atr needs arrays");
            local c: *VArr = this.argArray(args[2], "atr needs arrays");
            local period: int = cast<int>(this.num(args[3], "atr period must be a number"));
            if (this.error != nullptr) {
                return Vm.nil();
            }
            local n: int = h.len;
            if ((l.len != n) || (c.len != n) || (period < 1) || (period > n)) {
                this.fail("atr inputs must have equal length and a valid period");
                return Vm.nil();
            }
            local tr: *float = Indicators.alloc(n);
            loop (local i: int = 0; i < n; i = i + 1) {
                local hl: float = h.items[i].num - l.items[i].num;
                if (i > 0) {
                    local pc: float = c.items[i - 1].num;
                    hl = Math.max(hl, Math.max(Math.abs(h.items[i].num - pc), Math.abs(l.items[i].num - pc)));
                }
                tr[i] = hl;
            }
            local out: *float = Indicators.alloc(n);
            Indicators.rma(tr, n, period, out);
            local v: Value = this.fromFloats(out, n);
            free(cast<*void>(tr));
            free(cast<*void>(out));
            return v;
        }
        if ((id == 38) || (id == 39)) {
            return this.bands(id == 38, args);
        }
        if (id == 40) {
            if (this.argArray(args[0], "quantile needs an array") == nullptr) {
                return Vm.nil();
            }
            local q: float = this.num(args[1], "quantile level must be a number");
            local n: int = 0;
            local x: *float = this.toFloats(args[0], &n);
            local r: float = Stats.quantile(x, n, q);
            free(cast<*void>(x));
            return Vm.number(r);
        }
        if (id == 41) {
            local x: Value = args[0];
            return Vm.boolean((x.kind == VKind.Num) && (x.num != x.num));
        }
        if (id == 42) {
            local a: *VArr = this.argArray(args[0], "pop needs an array");
            if (a == nullptr) {
                return Vm.nil();
            }
            if (a.len == 0) {
                this.fail("pop from an empty array");
                return Vm.nil();
            }
            a.len = a.len - 1;
            return a.items[a.len];
        }
        if (id == 43) {
            local a: *VArr = this.argArray(args[0], "contains needs an array");
            if (a == nullptr) {
                return Vm.nil();
            }
            loop (local i: int = 0; i < a.len; i = i + 1) {
                if (this.equal(a.items[i], args[1])) {
                    return Vm.boolean(true);
                }
            }
            return Vm.boolean(false);
        }
        this.fail("unknown builtin");
        return Vm.nil();
    }
}
