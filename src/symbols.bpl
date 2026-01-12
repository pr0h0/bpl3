export [SymbolKind];
export [Symbol];
export [SymbolTable];

import [String] from "std/string.bpl";
import [Node], [TypeNode] from "./ast.bpl";
import [ScopeStack] from "std/scope_stack.bpl";
import [Map] from "std/map.bpl";

enum SymbolKind {
    Variable,
    Function,
    Struct,
    Enum,
    Spec,
    TypeAlias,
    Parameter,
    Module,
}

struct Symbol {
    name: String,
    kind: SymbolKind,
    typeNode: *TypeNode,
    # Optional (for variables, parameters, etc.)
    declaration: *Node,
    # Points to the defining AST node

    isConst: bool,
    used: bool,

    frame new(name: String, kind: SymbolKind, decl: *Node) ret *Symbol {
        # Todo: Allocate properly
        # Suppress unused
        local _k: SymbolKind = kind;
        local _d: *Node = decl;
        local _n: String = name;
        return nullptr;
    }
}

import [Option] from "std/option.bpl";

struct SymbolTable {
    scopes: ScopeStack<*Symbol>,

    frame new() ret SymbolTable {
        local st: SymbolTable;
        st.scopes = ScopeStack<*Symbol>.new();
        return st;
    }

    frame destroy(this: *SymbolTable) {
        this.scopes.destroy();
    }

    frame enterScope(this: *SymbolTable) {
        this.scopes.enterScope();
    }

    frame exitScope(this: *SymbolTable) {
        this.scopes.exitScope();
    }

    frame define(this: *SymbolTable, symbol: *Symbol) {
        this.scopes.define(symbol.name.cstr(), symbol);
    }

    frame resolve(this: *SymbolTable, name: String) ret *Symbol {
        local opt: Option<*Symbol> = this.scopes.lookup(name.cstr());
        if (opt.isSome()) {
            return opt.unwrap();
        }
        return nullptr;
    }
}
