# ScopeStack implementation for managing symbol tables across scopes

export [ScopeStack];

import [Array] from "std/array.bpl";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";

struct ScopeStack<T> {
    scopes: Array<Map<string, T>>,

    frame new() ret ScopeStack<T> {
        local s: ScopeStack<T>;
        s.scopes = Array<Map<string, T>>.new(8);
        # Initialize with one global scope
        s.enterScope();
        return s;
    }

    frame destroy(this: *ScopeStack<T>) {
        local i: int = 0;
        loop (i < this.scopes.length) {
            local map: *Map<string, T> = this.scopes.getRef(i);
            map.destroy();
            i = i + 1;
        }
        this.scopes.destroy();
    }

    frame enterScope(this: *ScopeStack<T>) {
        local newScope: Map<string, T> = Map<string, T>.new();
        this.scopes.push(newScope);
    }

    frame exitScope(this: *ScopeStack<T>) {
        if (this.scopes.length > 0) {
            local map: Map<string, T> = this.scopes.pop();
            map.destroy();
        }
    }

    # Define a symbol in the current (top-most) scope
    frame define(this: *ScopeStack<T>, name: string, value: T) {
        if (this.scopes.length == 0) {
            this.enterScope();
        }
        local top: *Map<string, T> = this.scopes.getRef(this.scopes.length - 1);
        top.set(name, value);
    }

    # Lookup a symbol starting from the current scope down to global
    frame lookup(this: *ScopeStack<T>, name: string) ret Option<T> {
        local i: int = this.scopes.length - 1;
        loop (i >= 0) {
            local map: *Map<string, T> = this.scopes.getRef(i);
            if (map.has(name)) {
                return map.get(name);
            }
            i = i - 1;
        }
        return Option<T>.None;
    }

    # Check if symbol is defined in the current scope (for shadowing checks)
    frame isDefinedInCurrentScope(this: *ScopeStack<T>, name: string) ret bool {
        if (this.scopes.length == 0) 
            return false;
        local top: *Map<string, T> = this.scopes.getRef(this.scopes.length - 1);
        return top.has(name);
    }
}
