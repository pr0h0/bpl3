# QScript compiler: AST to bytecode.
#
# Function 0 is the script body; every `fn` declaration becomes another
# function prototype. Script-level variables are globals; variables declared
# inside functions are frame slots with block scoping. Calls are resolved at
# compile time to a script function or a builtin, so the VM never looks up
# names. Function declarations are hoisted: a function may call one declared
# later in the file.

import malloc, free, memcpy from "std/c.bpl";
import [Text] from "../core/text.bpl";
import [TokType] from "./lexer.bpl";
import [Parser], [Ast], [AstNode], [NodeType] from "./parser.bpl";
import [Builtins] from "./builtins_table.bpl";

export [Compiler];
export [Proto];
export [Op];

# Opcodes. Operands follow the opcode in the code stream.
struct Op {
    frame CONST() ret int {
        return 1;
    }
    frame NIL() ret int {
        return 2;
    }
    frame TRUE() ret int {
        return 3;
    }
    frame FALSE() ret int {
        return 4;
    }
    frame POP() ret int {
        return 5;
    }
    frame GET_LOCAL() ret int {
        return 6;
    }
    frame SET_LOCAL() ret int {
        return 7;
    }
    frame GET_GLOBAL() ret int {
        return 8;
    }
    frame SET_GLOBAL() ret int {
        return 9;
    }
    frame ADD() ret int {
        return 10;
    }
    frame SUB() ret int {
        return 11;
    }
    frame MUL() ret int {
        return 12;
    }
    frame DIV() ret int {
        return 13;
    }
    frame MOD() ret int {
        return 14;
    }
    frame POW() ret int {
        return 15;
    }
    frame NEG() ret int {
        return 16;
    }
    frame NOT() ret int {
        return 17;
    }
    frame EQ() ret int {
        return 18;
    }
    frame NE() ret int {
        return 19;
    }
    frame LT() ret int {
        return 20;
    }
    frame LE() ret int {
        return 21;
    }
    frame GT() ret int {
        return 22;
    }
    frame GE() ret int {
        return 23;
    }
    frame JUMP() ret int {
        return 24;
    }
    frame JUMP_IF_FALSE() ret int {
        return 25;
    }
    frame JUMP_IF_FALSE_KEEP() ret int {
        return 26;
    }
    frame JUMP_IF_TRUE_KEEP() ret int {
        return 27;
    }
    frame CALL() ret int {
        return 28;
    }
    frame BUILTIN() ret int {
        return 29;
    }
    frame RETURN() ret int {
        return 30;
    }
    frame ARRAY() ret int {
        return 31;
    }
    frame INDEX() ret int {
        return 32;
    }
    frame SET_INDEX() ret int {
        return 33;
    }
    frame STRING() ret int {
        return 34;
    }
    frame ITER_LEN() ret int {
        return 35;
    }
    frame DUP() ret int {
        return 36;
    }
    frame HALT() ret int {
        return 37;
    }

    frame name(op: int) ret string {
        local names: string[38] = ["?", "CONST", "NIL", "TRUE", "FALSE", "POP", "GET_LOCAL", "SET_LOCAL", "GET_GLOBAL", "SET_GLOBAL", "ADD", "SUB", "MUL", "DIV", "MOD", "POW", "NEG", "NOT", "EQ", "NE", "LT", "LE", "GT", "GE", "JUMP", "JUMP_IF_FALSE", "JUMP_IF_FALSE_KEEP", "JUMP_IF_TRUE_KEEP", "CALL", "BUILTIN", "RETURN", "ARRAY", "INDEX", "SET_INDEX", "STRING", "ITER_LEN", "DUP", "HALT"];
        if ((op < 0) || (op > 37)) {
            return "?";
        }
        return names[op];
    }

    # Number of operands following each opcode.
    frame operands(op: int) ret int {
        if ((op == 1) || (op == 6) || (op == 7) || (op == 8) || (op == 9) || (op == 24) || (op == 25) || (op == 26) || (op == 27) || (op == 31) || (op == 34)) {
            return 1;
        }
        if ((op == 28) || (op == 29)) {
            return 2;
        }
        return 0;
    }
}

struct Proto {
    name: string,
    arity: int,
    code: *int,
    lines: *int,
    len: int,
    cap: int,
    locals: int,

    frame create(name: string, arity: int) ret Proto {
        local p: Proto;
        p.name = Text.copy(name);
        p.arity = arity;
        p.cap = 64;
        p.len = 0;
        p.code = cast<*int>(malloc(cast<long>(p.cap) * sizeof(int)));
        p.lines = cast<*int>(malloc(cast<long>(p.cap) * sizeof(int)));
        p.locals = arity;
        return p;
    }

    frame destroy(this: *Proto) {
        Text.release(this.name);
        free(cast<*void>(this.code));
        free(cast<*void>(this.lines));
    }

    frame emit(this: *Proto, word: int, line: int) ret int {
        if (this.len == this.cap) {
            local next_cap: int = this.cap * 2;
            local next: *int = cast<*int>(malloc(cast<long>(next_cap) * sizeof(int)));
            local next_lines: *int = cast<*int>(malloc(cast<long>(next_cap) * sizeof(int)));
            memcpy(cast<*void>(next), cast<*void>(this.code), cast<long>(this.len) * sizeof(int));
            memcpy(cast<*void>(next_lines), cast<*void>(this.lines), cast<long>(this.len) * sizeof(int));
            free(cast<*void>(this.code));
            free(cast<*void>(this.lines));
            this.code = next;
            this.lines = next_lines;
            this.cap = next_cap;
        }
        this.code[this.len] = word;
        this.lines[this.len] = line;
        this.len = this.len + 1;
        return this.len - 1;
    }
}

struct LocalVar {
    name: string,
    depth: int,
    slot: int,
}

# Pending break/continue jumps for the innermost loop.
struct LoopCtx {
    breaks: int[64],
    break_count: int,
    continues: int[64],
    continue_count: int,
    scope_depth: int,
}

struct Compiler {
    protos: *Proto,
    proto_count: int,
    proto_cap: int,
    consts: *float,
    const_count: int,
    const_cap: int,
    strings: *string,
    string_count: int,
    string_cap: int,
    globals: *string,
    global_count: int,
    global_cap: int,
    # Function-local state (only valid while compiling a function body).
    current: int,
    locals: LocalVar[256],
    local_count: int,
    scope_depth: int,
    loops: LoopCtx[16],
    loop_depth: int,
    error: string,
    error_line: int,
    error_col: int,
    ast: *Ast,

    # Initializes in place: returning this ~14 KB struct by value made LLVM
    # instruction selection take most of the -O2 build (BUG-803).
    frame init(this: *Compiler) {
        local c: *Compiler = this;
        c.proto_cap = 8;
        c.proto_count = 0;
        c.protos = cast<*Proto>(malloc(cast<long>(c.proto_cap) * sizeof(Proto)));
        c.const_cap = 32;
        c.const_count = 0;
        c.consts = cast<*float>(malloc(cast<long>(c.const_cap) * sizeof(float)));
        c.string_cap = 16;
        c.string_count = 0;
        c.strings = cast<*string>(malloc(cast<long>(c.string_cap) * sizeof(string)));
        c.global_cap = 32;
        c.global_count = 0;
        c.globals = cast<*string>(malloc(cast<long>(c.global_cap) * sizeof(string)));
        c.current = 0;
        c.local_count = 0;
        c.scope_depth = 0;
        c.loop_depth = 0;
        c.error = nullptr;
        c.error_line = 0;
        c.error_col = 0;
        c.ast = nullptr;
    }

    frame destroy(this: *Compiler) {
        loop (local i: int = 0; i < this.proto_count; i = i + 1) {
            this.protos[i].destroy();
        }
        loop (local i: int = 0; i < this.string_count; i = i + 1) {
            Text.release(this.strings[i]);
        }
        loop (local i: int = 0; i < this.global_count; i = i + 1) {
            Text.release(this.globals[i]);
        }
        free(cast<*void>(this.protos));
        free(cast<*void>(this.consts));
        free(cast<*void>(this.strings));
        free(cast<*void>(this.globals));
        this.protos = nullptr;
    }

    frame ok(this: *Compiler) ret bool {
        return this.error == nullptr;
    }

    frame failAt(this: *Compiler, node: int, message: string) {
        if (this.error == nullptr) {
            this.error = message;
            if (node >= 0) {
                this.error_line = this.ast.at(node).line;
                this.error_col = this.ast.at(node).col;
            }
        }
    }

    frame proto(this: *Compiler) ret *Proto {
        return this.protos + this.current;
    }

    frame emit(this: *Compiler, word: int, node: int) ret int {
        local line: int = node >= 0 ? this.ast.at(node).line : 0;
        return this.proto().emit(word, line);
    }

    frame emit2(this: *Compiler, op: int, operand: int, node: int) ret int {
        this.emit(op, node);
        return this.emit(operand, node);
    }

    frame addProto(this: *Compiler, name: string, arity: int) ret int {
        if (this.proto_count == this.proto_cap) {
            local next_cap: int = this.proto_cap * 2;
            local next: *Proto = cast<*Proto>(malloc(cast<long>(next_cap) * sizeof(Proto)));
            loop (local i: int = 0; i < this.proto_count; i = i + 1) {
                next[i] = this.protos[i];
            }
            free(cast<*void>(this.protos));
            this.protos = next;
            this.proto_cap = next_cap;
        }
        this.protos[this.proto_count] = Proto.create(name, arity);
        this.proto_count = this.proto_count + 1;
        return this.proto_count - 1;
    }

    frame findProto(this: *Compiler, name: string) ret int {
        loop (local i: int = 1; i < this.proto_count; i = i + 1) {
            if (Text.equals(this.protos[i].name, name)) {
                return i;
            }
        }
        return -1;
    }

    frame constant(this: *Compiler, value: float) ret int {
        loop (local i: int = 0; i < this.const_count; i = i + 1) {
            if (this.consts[i] == value) {
                return i;
            }
        }
        if (this.const_count == this.const_cap) {
            local next_cap: int = this.const_cap * 2;
            local next: *float = cast<*float>(malloc(cast<long>(next_cap) * sizeof(float)));
            memcpy(cast<*void>(next), cast<*void>(this.consts), cast<long>(this.const_count) * sizeof(float));
            free(cast<*void>(this.consts));
            this.consts = next;
            this.const_cap = next_cap;
        }
        this.consts[this.const_count] = value;
        this.const_count = this.const_count + 1;
        return this.const_count - 1;
    }

    frame stringConst(this: *Compiler, s: string) ret int {
        if (this.string_count == this.string_cap) {
            local next_cap: int = this.string_cap * 2;
            local next: *string = cast<*string>(malloc(cast<long>(next_cap) * sizeof(string)));
            loop (local i: int = 0; i < this.string_count; i = i + 1) {
                next[i] = this.strings[i];
            }
            free(cast<*void>(this.strings));
            this.strings = next;
            this.string_cap = next_cap;
        }
        this.strings[this.string_count] = Text.copy(s);
        this.string_count = this.string_count + 1;
        return this.string_count - 1;
    }

    frame findGlobal(this: *Compiler, name: string) ret int {
        loop (local i: int = 0; i < this.global_count; i = i + 1) {
            if (Text.equals(this.globals[i], name)) {
                return i;
            }
        }
        return -1;
    }

    frame globalSlot(this: *Compiler, name: string) ret int {
        local existing: int = this.findGlobal(name);
        if (existing >= 0) {
            return existing;
        }
        if (this.global_count == this.global_cap) {
            local next_cap: int = this.global_cap * 2;
            local next: *string = cast<*string>(malloc(cast<long>(next_cap) * sizeof(string)));
            loop (local i: int = 0; i < this.global_count; i = i + 1) {
                next[i] = this.globals[i];
            }
            free(cast<*void>(this.globals));
            this.globals = next;
            this.global_cap = next_cap;
        }
        this.globals[this.global_count] = Text.copy(name);
        this.global_count = this.global_count + 1;
        return this.global_count - 1;
    }

    frame inFunction(this: *Compiler) ret bool {
        return this.current != 0;
    }

    frame resolveLocal(this: *Compiler, name: string) ret int {
        local i: int = this.local_count - 1;
        loop (i >= 0) {
            if (Text.equals(this.locals[i].name, name)) {
                return this.locals[i].slot;
            }
            i = i - 1;
        }
        return -1;
    }

    frame declareLocal(this: *Compiler, name: string, node: int) ret int {
        if (this.local_count >= 256) {
            this.failAt(node, "too many local variables");
            return 0;
        }
        loop (local i: int = this.local_count - 1; i >= 0; i = i - 1) {
            if (this.locals[i].depth < this.scope_depth) {
                break;
            }
            if (Text.equals(this.locals[i].name, name)) {
                this.failAt(node, "variable already declared in this scope");
                return this.locals[i].slot;
            }
        }
        local slot: int = this.proto().locals;
        this.proto().locals = this.proto().locals + 1;
        this.locals[this.local_count] = LocalVar { name: name, depth: this.scope_depth, slot: slot };
        this.local_count = this.local_count + 1;
        return slot;
    }

    # A hidden slot (loop counters) that user code cannot name.
    frame hiddenSlot(this: *Compiler) ret int {
        local slot: int = this.proto().locals;
        this.proto().locals = this.proto().locals + 1;
        return slot;
    }

    frame beginScope(this: *Compiler) {
        this.scope_depth = this.scope_depth + 1;
    }

    frame endScope(this: *Compiler) {
        this.scope_depth = this.scope_depth - 1;
        loop ((this.local_count > 0) && (this.locals[this.local_count - 1].depth > this.scope_depth)) {
            this.local_count = this.local_count - 1;
        }
    }

    frame patchJump(this: *Compiler, at: int) {
        # Offsets are relative to the instruction after the operand.
        this.proto().code[at] = this.proto().len - (at + 1);
    }

    frame emitLoop(this: *Compiler, target: int, node: int) {
        this.emit(Op.JUMP(), node);
        local at: int = this.emit(0, node);
        this.proto().code[at] = target - (at + 1);
    }

    # Variable reads/writes resolve local slot, then global.
    frame emitGet(this: *Compiler, name: string, node: int) {
        if (this.inFunction()) {
            local slot: int = this.resolveLocal(name);
            if (slot >= 0) {
                this.emit2(Op.GET_LOCAL(), slot, node);
                return;
            }
        }
        local g: int = this.findGlobal(name);
        if (g < 0) {
            this.failAt(node, "undefined variable");
            return;
        }
        this.emit2(Op.GET_GLOBAL(), g, node);
    }

    frame emitSet(this: *Compiler, name: string, node: int, declare: bool) {
        if (this.inFunction()) {
            local slot: int = declare ? this.declareLocal(name, node) : this.resolveLocal(name);
            if (slot >= 0) {
                this.emit2(Op.SET_LOCAL(), slot, node);
                return;
            }
        }
        local g: int = declare ? this.globalSlot(name) : this.findGlobal(name);
        if (g < 0) {
            this.failAt(node, "assignment to an undeclared variable (use let)");
            return;
        }
        this.emit2(Op.SET_GLOBAL(), g, node);
    }

    frame compileProgram(this: *Compiler, parser: *Parser) ret bool {
        this.ast = &parser.ast;
        this.addProto("<script>", 0);
        # Builtin globals the host binds before running.
        local hosts: string[8] = ["open", "high", "low", "close", "volume", "bars", "params", "time"];
        loop (local i: int = 0; i < 8; i = i + 1) {
            this.globalSlot(hosts[i]);
        }
        # Hoist function declarations.
        local root: *AstNode = this.ast.at(this.ast.root);
        local cur: int = root.first;
        loop (cur >= 0) {
            local n: *AstNode = this.ast.at(cur);
            if (n.kind == NodeType.Function) {
                if (this.findProto(n.name) >= 0) {
                    this.failAt(cur, "function already defined");
                    return false;
                }
                if (Builtins.find(n.name) >= 0) {
                    this.failAt(cur, "function name shadows a builtin");
                    return false;
                }
                this.addProto(n.name, this.ast.at(n.a).count);
            }
            cur = n.next;
        }
        cur = root.first;
        loop ((cur >= 0) && (this.error == nullptr)) {
            local n: *AstNode = this.ast.at(cur);
            if (n.kind != NodeType.Function) {
                this.statement(cur);
            }
            cur = this.ast.at(cur).next;
        }
        this.emit(Op.HALT(), -1);
        cur = root.first;
        loop ((cur >= 0) && (this.error == nullptr)) {
            local n: *AstNode = this.ast.at(cur);
            if (n.kind == NodeType.Function) {
                this.function(cur);
            }
            cur = this.ast.at(cur).next;
        }
        return this.error == nullptr;
    }

    frame function(this: *Compiler, node: int) {
        local n: *AstNode = this.ast.at(node);
        this.current = this.findProto(n.name);
        this.local_count = 0;
        this.scope_depth = 0;
        this.loop_depth = 0;
        local params: *AstNode = this.ast.at(n.a);
        local cur: int = params.first;
        local slot: int = 0;
        loop (cur >= 0) {
            local p: *AstNode = this.ast.at(cur);
            loop (local i: int = 0; i < this.local_count; i = i + 1) {
                if (Text.equals(this.locals[i].name, p.name)) {
                    this.failAt(cur, "duplicate parameter name");
                }
            }
            this.locals[this.local_count] = LocalVar { name: p.name, depth: 0, slot: slot };
            this.local_count = this.local_count + 1;
            slot = slot + 1;
            cur = p.next;
        }
        this.block(n.b);
        # Implicit `return nil`.
        this.emit(Op.NIL(), node);
        this.emit(Op.RETURN(), node);
        this.current = 0;
    }

    frame block(this: *Compiler, node: int) {
        this.beginScope();
        local cur: int = this.ast.at(node).first;
        loop ((cur >= 0) && (this.error == nullptr)) {
            this.statement(cur);
            cur = this.ast.at(cur).next;
        }
        this.endScope();
    }

    frame statement(this: *Compiler, node: int) {
        local n: AstNode = *this.ast.at(node);
        if (n.kind == NodeType.Let) {
            this.expression(n.a);
            this.emitSet(n.name, node, true);
            return;
        }
        if (n.kind == NodeType.Assign) {
            if (n.op != TokType.Assign) {
                this.emitGet(n.name, node);
                this.expression(n.a);
                this.emit(Compiler.compoundOp(n.op), node);
            } else {
                this.expression(n.a);
            }
            this.emitSet(n.name, node, false);
            return;
        }
        if (n.kind == NodeType.IndexAssign) {
            # Stack: array, index, value -> SET_INDEX.
            this.expression(n.a);
            this.expression(n.b);
            if (n.op != TokType.Assign) {
                this.expression(n.a);
                this.expression(n.b);
                this.emit(Op.INDEX(), node);
                this.expression(n.c);
                this.emit(Compiler.compoundOp(n.op), node);
            } else {
                this.expression(n.c);
            }
            this.emit(Op.SET_INDEX(), node);
            return;
        }
        if (n.kind == NodeType.ExprStmt) {
            this.expression(n.a);
            this.emit(Op.POP(), node);
            return;
        }
        if (n.kind == NodeType.Block) {
            this.block(node);
            return;
        }
        if (n.kind == NodeType.If) {
            this.expression(n.a);
            this.emit(Op.JUMP_IF_FALSE(), node);
            local else_jump: int = this.emit(0, node);
            this.block(n.b);
            if (n.c >= 0) {
                this.emit(Op.JUMP(), node);
                local end_jump: int = this.emit(0, node);
                this.patchJump(else_jump);
                local alt: AstNode = *this.ast.at(n.c);
                if (alt.kind == NodeType.If) {
                    this.statement(n.c);
                } else {
                    this.block(n.c);
                }
                this.patchJump(end_jump);
            } else {
                this.patchJump(else_jump);
            }
            return;
        }
        if (n.kind == NodeType.While) {
            local start: int = this.proto().len;
            this.expression(n.a);
            this.emit(Op.JUMP_IF_FALSE(), node);
            local exit: int = this.emit(0, node);
            this.pushLoop(node);
            this.block(n.b);
            this.patchContinues(start);
            this.emitLoop(start, node);
            this.patchJump(exit);
            this.popLoop();
            return;
        }
        if (n.kind == NodeType.ForRange) {
            this.forRange(node);
            return;
        }
        if (n.kind == NodeType.ForEach) {
            this.forEach(node);
            return;
        }
        if (n.kind == NodeType.Return) {
            if (!this.inFunction()) {
                this.failAt(node, "return outside a function");
                return;
            }
            if (n.a >= 0) {
                this.expression(n.a);
            } else {
                this.emit(Op.NIL(), node);
            }
            this.emit(Op.RETURN(), node);
            return;
        }
        if ((n.kind == NodeType.Break) || (n.kind == NodeType.Continue)) {
            if (this.loop_depth == 0) {
                this.failAt(node, n.kind == NodeType.Break ? "break outside a loop" : "continue outside a loop");
                return;
            }
            local ctx: *LoopCtx = &this.loops[this.loop_depth - 1];
            this.emit(Op.JUMP(), node);
            local at: int = this.emit(0, node);
            if (n.kind == NodeType.Break) {
                if (ctx.break_count >= 64) {
                    this.failAt(node, "too many break statements in one loop");
                    return;
                }
                ctx.breaks[ctx.break_count] = at;
                ctx.break_count = ctx.break_count + 1;
            } else {
                if (ctx.continue_count >= 64) {
                    this.failAt(node, "too many continue statements in one loop");
                    return;
                }
                ctx.continues[ctx.continue_count] = at;
                ctx.continue_count = ctx.continue_count + 1;
            }
            return;
        }
        if (n.kind == NodeType.Function) {
            this.failAt(node, "functions must be declared at the top level");
            return;
        }
        this.failAt(node, "unsupported statement");
    }

    frame compoundOp(op: TokType) ret int {
        if (op == TokType.PlusAssign) {
            return Op.ADD();
        }
        if (op == TokType.MinusAssign) {
            return Op.SUB();
        }
        if (op == TokType.StarAssign) {
            return Op.MUL();
        }
        return Op.DIV();
    }

    frame pushLoop(this: *Compiler, node: int) {
        if (this.loop_depth >= 16) {
            this.failAt(node, "loops nested too deeply");
            return;
        }
        this.loops[this.loop_depth].break_count = 0;
        this.loops[this.loop_depth].continue_count = 0;
        this.loops[this.loop_depth].scope_depth = this.scope_depth;
        this.loop_depth = this.loop_depth + 1;
    }

    frame patchContinues(this: *Compiler, target: int) {
        if (this.loop_depth == 0) {
            return;
        }
        local ctx: *LoopCtx = &this.loops[this.loop_depth - 1];
        loop (local i: int = 0; i < ctx.continue_count; i = i + 1) {
            local at: int = ctx.continues[i];
            this.proto().code[at] = target - (at + 1);
        }
        ctx.continue_count = 0;
    }

    frame popLoop(this: *Compiler) {
        if (this.loop_depth == 0) {
            return;
        }
        local ctx: *LoopCtx = &this.loops[this.loop_depth - 1];
        loop (local i: int = 0; i < ctx.break_count; i = i + 1) {
            this.patchJump(ctx.breaks[i]);
        }
        this.loop_depth = this.loop_depth - 1;
    }

    # Emits a read of a loop helper (hidden local in functions, hidden global in the script).
    frame getHelper(this: *Compiler, slot: int, node: int) {
        this.emit2(this.inFunction() ? Op.GET_LOCAL() : Op.GET_GLOBAL(), slot, node);
    }

    frame setHelper(this: *Compiler, slot: int, node: int) {
        this.emit2(this.inFunction() ? Op.SET_LOCAL() : Op.SET_GLOBAL(), slot, node);
    }

    frame helperSlot(this: *Compiler) ret int {
        if (this.inFunction()) {
            return this.hiddenSlot();
        }
        # Hidden script helpers get names user code cannot spell.
        local name: char[24];
        local n: int = this.global_count;
        name[0] = '$';
        name[1] = 'h';
        local digits: int = 2;
        local tmp: int = n;
        local rev: char[12];
        local k: int = 0;
        loop {
            rev[k] = cast<char>(48 + (tmp % 10));
            k = k + 1;
            tmp = tmp / 10;
            if (tmp == 0) {
                break;
            }
        }
        loop (k > 0) {
            k = k - 1;
            name[digits] = rev[k];
            digits = digits + 1;
        }
        name[digits] = cast<char>(0);
        return this.globalSlot(cast<string>(&name[0]));
    }

    # for v in a..b { body }  ==  v = a; end = b; while v < end { body; v += 1 }
    frame forRange(this: *Compiler, node: int) {
        local n: AstNode = *this.ast.at(node);
        this.beginScope();
        local end_slot: int = this.helperSlot();
        this.expression(n.a);
        this.emitSet(n.name, node, true);
        this.expression(n.b);
        this.setHelper(end_slot, node);
        local start: int = this.proto().len;
        this.emitGet(n.name, node);
        this.getHelper(end_slot, node);
        this.emit(Op.LT(), node);
        this.emit(Op.JUMP_IF_FALSE(), node);
        local exit: int = this.emit(0, node);
        this.pushLoop(node);
        this.block(n.c);
        local step: int = this.proto().len;
        this.patchContinues(step);
        this.emitGet(n.name, node);
        this.emit2(Op.CONST(), this.constant(1.0), node);
        this.emit(Op.ADD(), node);
        this.emitSet(n.name, node, false);
        this.emitLoop(start, node);
        this.patchJump(exit);
        this.popLoop();
        this.endScope();
    }

    # for v in array { body } over a snapshot of the array reference.
    frame forEach(this: *Compiler, node: int) {
        local n: AstNode = *this.ast.at(node);
        this.beginScope();
        local arr_slot: int = this.helperSlot();
        local idx_slot: int = this.helperSlot();
        this.expression(n.a);
        this.setHelper(arr_slot, node);
        this.emit2(Op.CONST(), this.constant(0.0), node);
        this.setHelper(idx_slot, node);
        this.emit(Op.NIL(), node);
        this.emitSet(n.name, node, true);
        local start: int = this.proto().len;
        this.getHelper(idx_slot, node);
        this.getHelper(arr_slot, node);
        this.emit(Op.ITER_LEN(), node);
        this.emit(Op.LT(), node);
        this.emit(Op.JUMP_IF_FALSE(), node);
        local exit: int = this.emit(0, node);
        this.getHelper(arr_slot, node);
        this.getHelper(idx_slot, node);
        this.emit(Op.INDEX(), node);
        this.emitSet(n.name, node, false);
        this.pushLoop(node);
        this.block(n.c);
        local step: int = this.proto().len;
        this.patchContinues(step);
        this.getHelper(idx_slot, node);
        this.emit2(Op.CONST(), this.constant(1.0), node);
        this.emit(Op.ADD(), node);
        this.setHelper(idx_slot, node);
        this.emitLoop(start, node);
        this.patchJump(exit);
        this.popLoop();
        this.endScope();
    }

    frame binaryOp(op: TokType) ret int {
        return match (op) {
            TokType.Plus => Op.ADD(),
            TokType.Minus => Op.SUB(),
            TokType.Star => Op.MUL(),
            TokType.Slash => Op.DIV(),
            TokType.Percent => Op.MOD(),
            TokType.Power => Op.POW(),
            TokType.Eq => Op.EQ(),
            TokType.Ne => Op.NE(),
            TokType.Lt => Op.LT(),
            TokType.Le => Op.LE(),
            TokType.Gt => Op.GT(),
            TokType.Ge => Op.GE(),
            _ => -1,
        };
    }

    frame expression(this: *Compiler, node: int) {
        if ((node < 0) || (this.error != nullptr)) {
            return;
        }
        local n: AstNode = *this.ast.at(node);
        if (n.kind == NodeType.Number) {
            this.emit2(Op.CONST(), this.constant(n.num), node);
            return;
        }
        if (n.kind == NodeType.String) {
            this.emit2(Op.STRING(), this.stringConst(n.name), node);
            return;
        }
        if (n.kind == NodeType.Bool) {
            this.emit(n.num != 0.0 ? Op.TRUE() : Op.FALSE(), node);
            return;
        }
        if (n.kind == NodeType.Nil) {
            this.emit(Op.NIL(), node);
            return;
        }
        if (n.kind == NodeType.Var) {
            this.emitGet(n.name, node);
            return;
        }
        if (n.kind == NodeType.ArrayLit) {
            local cur: int = n.first;
            loop (cur >= 0) {
                this.expression(cur);
                cur = this.ast.at(cur).next;
            }
            this.emit2(Op.ARRAY(), n.count, node);
            return;
        }
        if (n.kind == NodeType.Index) {
            this.expression(n.a);
            this.expression(n.b);
            this.emit(Op.INDEX(), node);
            return;
        }
        if (n.kind == NodeType.Unary) {
            this.expression(n.a);
            this.emit(n.op == TokType.Not ? Op.NOT() : Op.NEG(), node);
            return;
        }
        if (n.kind == NodeType.Binary) {
            this.expression(n.a);
            this.expression(n.b);
            local op: int = Compiler.binaryOp(n.op);
            if (op < 0) {
                this.failAt(node, "unknown operator");
                return;
            }
            this.emit(op, node);
            return;
        }
        if (n.kind == NodeType.Logical) {
            this.expression(n.a);
            this.emit(n.op == TokType.And ? Op.JUMP_IF_FALSE_KEEP() : Op.JUMP_IF_TRUE_KEEP(), node);
            local skip: int = this.emit(0, node);
            this.emit(Op.POP(), node);
            this.expression(n.b);
            this.patchJump(skip);
            return;
        }
        if (n.kind == NodeType.Call) {
            this.call(node);
            return;
        }
        this.failAt(node, "unsupported expression");
    }

    frame call(this: *Compiler, node: int) {
        local n: AstNode = *this.ast.at(node);
        local callee: AstNode = *this.ast.at(n.a);
        if (callee.kind != NodeType.Var) {
            this.failAt(node, "only named functions can be called");
            return;
        }
        local cur: int = n.first;
        loop (cur >= 0) {
            this.expression(cur);
            cur = this.ast.at(cur).next;
        }
        local fn_index: int = this.findProto(callee.name);
        if (fn_index >= 0) {
            if (this.protos[fn_index].arity != n.count) {
                this.failAt(node, "wrong number of arguments");
                return;
            }
            this.emit(Op.CALL(), node);
            this.emit(fn_index, node);
            this.emit(n.count, node);
            return;
        }
        local b: int = Builtins.find(callee.name);
        if (b < 0) {
            this.failAt(n.a, "unknown function");
            return;
        }
        if (!Builtins.arityOk(b, n.count)) {
            this.failAt(node, "wrong number of arguments for builtin");
            return;
        }
        this.emit(Op.BUILTIN(), node);
        this.emit(b, node);
        this.emit(n.count, node);
    }

    # Human-readable bytecode listing (for /api/strategy/compile).
    frame disassemble(this: *Compiler, fn_index: int, out: *string, max_lines: int) ret int {
        local p: *Proto = this.protos + fn_index;
        local ip: int = 0;
        local n: int = 0;
        loop ((ip < p.len) && (n < max_lines)) {
            local op: int = p.code[ip];
            out[n] = Op.name(op);
            n = n + 1;
            ip = ip + 1 + Op.operands(op);
        }
        return n;
    }
}
