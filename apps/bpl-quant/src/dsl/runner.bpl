# Compiles and runs a QScript program against a bar series.
#
# The host binds open/high/low/close/volume/time arrays and `bars`. A script
# may call position(i, size) to set a target position per bar; if it does,
# the runner hands the positions to the backtester. Results (output, emitted
# values, positions, statistics) are written as JSON.

import [Clock] from "../core/clock.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [BarSeries] from "../series/bars.bpl";
import [Parser] from "./parser.bpl";
import [Compiler], [Proto] from "./compiler.bpl";
import [Vm], [Value], [VKind], [VmLimits] from "./vm.bpl";
import malloc, free from "std/c.bpl";

export [ScriptRun];

struct ScriptRun {
    ok: bool,
    stage: string,
    error: string,
    line: int,
    col: int,
    instructions: long,
    compile_ms: float,
    run_ms: float,
    functions: int,
    code_words: int,
    parser: Parser,
    compiler: Compiler,
    vm: Vm,
    has_vm: bool,
    has_compiler: bool,

    frame defaultLimits() ret VmLimits {
        return VmLimits { max_instructions: 50000000, max_depth: 200, max_elements: 20000000, max_output: 65536 };
    }

    # Runs `source` over `bars` (may be null) into *r, which must stay in
    # place: the VM keeps a pointer to r.compiler. Call r.destroy() afterwards.
    frame execute(r: *ScriptRun, source: string, bars: *BarSeries, limits: VmLimits) {
        r.ok = false;
        r.stage = "parse";
        r.error = nullptr;
        r.line = 0;
        r.col = 0;
        r.instructions = 0;
        r.compile_ms = 0.0;
        r.run_ms = 0.0;
        r.functions = 0;
        r.code_words = 0;
        r.has_vm = false;
        r.has_compiler = false;
        local t0: long = Clock.nowNs();
        r.parser = Parser.parse(source);
        if (!r.parser.ok()) {
            r.error = r.parser.error;
            r.line = r.parser.error_line;
            r.col = r.parser.error_col;
            return;
        }
        r.stage = "compile";
        r.compiler.init();
        r.has_compiler = true;
        if (!r.compiler.compileProgram(&r.parser)) {
            r.error = r.compiler.error;
            r.line = r.compiler.error_line;
            r.col = r.compiler.error_col;
            return;
        }
        r.functions = r.compiler.proto_count;
        loop (local i: int = 0; i < r.compiler.proto_count; i = i + 1) {
            r.code_words = r.code_words + r.compiler.protos[i].len;
        }
        r.compile_ms = Clock.elapsedMs(t0);
        r.stage = "run";
        local t1: long = Clock.nowNs();
        r.vm.init(&r.compiler, limits);
        r.has_vm = true;
        if (bars != nullptr) {
            r.vm.bindSeries("open", bars.open, bars.len);
            r.vm.bindSeries("high", bars.high, bars.len);
            r.vm.bindSeries("low", bars.low, bars.len);
            r.vm.bindSeries("close", bars.close, bars.len);
            r.vm.bindSeries("volume", bars.volume, bars.len);
            local times: *float = cast<*float>(malloc(cast<long>(bars.len + 1) * sizeof(float)));
            loop (local i: int = 0; i < bars.len; i = i + 1) {
                times[i] = cast<float>(bars.time[i]);
            }
            r.vm.bindSeries("time", times, bars.len);
            free(cast<*void>(times));
            r.vm.setGlobal("bars", Vm.number(cast<float>(bars.len)));
            r.vm.preparePositions(bars.len);
        }
        r.ok = r.vm.run();
        r.instructions = r.vm.instructions;
        r.run_ms = Clock.elapsedMs(t1);
        if (!r.ok) {
            r.error = r.vm.error;
            r.line = r.vm.error_line;
            return;
        }
        r.stage = "done";
    }

    frame destroy(this: *ScriptRun) {
        if (this.has_vm) {
            this.vm.destroy();
        }
        if (this.has_compiler) {
            this.compiler.destroy();
        }
        this.parser.destroy();
    }

    frame positionsSet(this: *ScriptRun) ret int {
        if (!this.has_vm || (this.vm.positions == nullptr)) {
            return 0;
        }
        local n: int = 0;
        loop (local i: int = 0; i < this.vm.position_count; i = i + 1) {
            if (this.vm.positions[i] == this.vm.positions[i]) {
                n = n + 1;
            }
        }
        return n;
    }

    frame writeValue(this: *ScriptRun, w: *JsonWriter, v: Value, depth: int) {
        if (v.kind == VKind.Nil) {
            w.nil();
        } else if (v.kind == VKind.Bool) {
            w.boolean(v.num != 0.0);
        } else if (v.kind == VKind.Num) {
            w.num(v.num);
        } else if (v.kind == VKind.Str) {
            w.str(this.vm.strOf(v));
        } else {
            if (depth > 4) {
                w.nil();
                return;
            }
            w.beginArray();
            local count: int = this.vm.arrays[v.ref].len;
            local shown: int = count < 10000 ? count : 10000;
            loop (local i: int = 0; i < shown; i = i + 1) {
                this.writeValue(w, this.vm.arrays[v.ref].items[i], depth + 1);
            }
            w.endArray();
        }
    }

    frame writeJson(this: *ScriptRun, w: *JsonWriter) {
        w.fieldBool("ok", this.ok);
        w.fieldStr("stage", this.stage);
        if (this.error != nullptr) {
            w.key("error").beginObject();
            w.fieldStr("message", this.error);
            w.fieldInt("line", cast<long>(this.line));
            w.fieldInt("column", cast<long>(this.col));
            w.endObject();
        }
        w.fieldInt("functions", cast<long>(this.functions));
        w.fieldInt("bytecode_words", cast<long>(this.code_words));
        w.fieldInt("instructions", this.instructions);
        w.fieldFixed("compile_ms", this.compile_ms, 3);
        w.fieldFixed("run_ms", this.run_ms, 3);
        if (this.has_vm) {
            w.fieldStr("output", this.vm.output.toString());
            w.key("emitted").beginObject();
            loop (local i: int = 0; i < this.vm.emit_count; i = i + 1) {
                w.key(this.vm.emitted[i].name);
                this.writeValue(w, this.vm.emitted[i].value, 0);
            }
            w.endObject();
            w.fieldInt("positions_set", cast<long>(this.positionsSet()));
        }
    }
}
