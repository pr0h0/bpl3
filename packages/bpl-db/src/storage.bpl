export [Column];
export [Row];
export [Table];
export [Database];

import [Value], [DataType], serialize_value, deserialize_value, clone_value, destroy_value, value_kind, data_kind from "./types.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [Map], [Pair], [MapIterator], [MapNode] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [File] from "std/fs.bpl";
import [StringUtils] from "std/string_utils.bpl";

extern printf(fmt: string, ...) ret int;
extern sprintf(str: string, fmt: string, ...) ret int;
extern malloc(size: long) ret string;
extern free(ptr: string) ret void;
extern atoi(s: string) ret int;
extern strlen(s: string) ret long;
extern strcmp(s1: string, s2: string) ret int;
extern rename(source: string, target: string) ret int;
extern remove(path: string) ret int;

struct Column {
    name: string,
    kind: DataType,
    # Renamed from type to avoid keyword conflict

    frame new(name: string, kind: DataType) ret Column {
        local c: Column;
        c.name = name;
        c.kind = kind;
        return c;
    }
}

struct Row {
    id: int,
    values: Array<Value>,
    frame new(id: int) ret Row {
        local r: Row;
        r.id = id;
        r.values = Array<Value>.new(4);
        return r;
    }

    frame destroy(this: *Row) {
        loop(local i: int = 0; i < this.values.len(); i = i + 1) { destroy_value(this.values.getRef(i)); }
        this.values.destroy();
    }
}

struct Table {
    name: string,
    columns: Array<Column>,
    rows: Array<Row>,
    next_id: int,
    frame new(name: string) ret Table {
        local t: Table;
        t.name = db_name(name);
        t.columns = Array<Column>.new(4);
        t.rows = Array<Row>.new(16);
        t.next_id = 1;
        return t;
    }

    frame add_column(this: *Table, name: string, kind: DataType) {
        if (this.rows.len() != 0 || this.get_column_index(name) >= 0) { throw "Duplicate or late database column"; }
        this.columns.push(Column.new(db_name(name), kind));
    }

    frame get_column_index(this: *Table, name: string) ret int {
        loop (local i: int = 0; i < this.columns.len(); i = i + 1) {
            local c: Column = this.columns.get(i);
            if (strcmp(c.name, name) == 0) {
                return i;
            }
        }
        return -1;
    }

    frame insert(this: *Table, values: *Array<Value>) ret int {
        # Validate column count
        if (values == nullptr || values.len() != this.columns.len()) {
            # Error: column count mismatch
            return -1;
        }
        loop(local i: int = 0; i < values.len(); i = i + 1) {
            local v: *Value = values.getRef(i);
            local c: Column = this.columns.get(i);
            local kind: int = value_kind(v);
            if(kind != 3 && kind != data_kind(c.kind)) {return -1;}
        }
        if(this.next_id == 2147483647) {return -1;}
        # Create row
        local row: Row = Row.new(this.next_id);
        this.next_id = this.next_id + 1;

        # Copy values
        loop (local i: int = 0; i < values.len(); i = i + 1) {
            row.values.push(clone_value(values.getRef(i)));
        }

        this.rows.push(row);
        return row.id;
    }

    frame destroy(this: *Table) {
        loop(local i: int = 0; i < this.columns.len(); i = i + 1) {local c: Column = this.columns.get(i);free(c.name);}
        this.columns.destroy();
        free(this.name); this.name = nullptr;
        # Destroy all rows
        loop (local i: int = 0; i < this.rows.len(); i = i + 1) {
            local r: Row = this.rows.get(i);
            # r.destroy(); # Need to implement destroy for Row properly or handle memory
            # Since Row contains Array, we should destroy it.
            # But Array.get returns a copy of the struct.
            # If we destroy the copy's internal pointer, the original is also destroyed (double free if we are not careful).
            # But here we want to destroy the content of the array.
            # Array.destroy() frees the buffer, but doesn't call destroy on elements unless T implements Destructible?
            # Currently Array doesn't auto-destroy elements.
            # So we need to manually destroy.
            # But `r` is a copy. `r.values` is a copy of the struct `Array`, which contains a pointer `data`.
            # So `r.values.destroy()` will free the memory pointed to by `data`.
            # This is correct because `this.rows` owns the data.
            r.destroy();
        }
        this.rows.destroy();
    }
}

struct Database {
    tables: Map<string, *Table>,
    frame new() ret Database {
        local db: Database;
        db.tables = Map<string, *Table>.new();
        return db;
    }

    frame create_table(this: *Database, name: string) ret *Table {
        local existing: *Table = this.get_table(name);
        if(existing != nullptr) { return existing; }
        local t_ptr: *Table = cast<*Table>(malloc(sizeof<Table>()));
        if(t_ptr == nullptr) { throw "Database allocation failed"; }
        *t_ptr = Table.new(name);
        this.tables.set(t_ptr.name, t_ptr);
        return t_ptr;
    }

    frame get_table(this: *Database, name: string) ret *Table {
        local opt: Option<*Table> = this.tables.get(name);
        if (opt.isSome()) {
            return opt.unwrap();
        }
        return nullptr;
    }

    # Writes to `<path>.tmp` and renames it over `path` only when every write
    # and the close succeeded, so a failed save leaves the old file intact.
    # A row line longer than `load` accepts (1 MiB) is rejected up front.
    frame save(this: *Database, path: string) {
        local tmp: string = malloc(strlen(path) + 5);
        if (tmp == nullptr) { throw "Database allocation failed"; }
        defer free(tmp);
        sprintf(tmp, "%s.tmp", path);
        local f: File = File.open(tmp, "w");
        if (f.handle == nullptr) {
            printf("Error: Cannot open file for writing: %s\n", path);
            return;
        }
        # Until the rename commits, any exit (including an exception from
        # serialization) closes and removes the temporary file.
        # 2: close and remove, 1: remove, 0: committed.
        local cleanup: int = 2;
        local cleanupPtr: *int = &cleanup;
        defer {
            if (*cleanupPtr == 2) { f.close(); }
            if (*cleanupPtr >= 1) { remove(tmp); }
        }
        local ok: bool = true;
        local tooLong: bool = false;
        local num: string = malloc(32);
        if (num == nullptr) { throw "Database allocation failed"; }
        defer free(num);
        # Manual iteration to avoid Generic Iterator bugs
        local i: int = 0;
        local n: int = this.tables.buckets.len();
        loop (i < n && ok && !tooLong) {
            local curr: *MapNode<string, *Table> = this.tables.buckets.get(i);
            loop (curr != nullptr && ok && !tooLong) {
                local t: *Table = curr.value;
                if (t != nullptr) {
                    ok = ok && f.write("TABLE ") && f.write(t.name) && f.write("\n");
                    loop (local j: int = 0; ok && j < t.columns.len(); j = j + 1) {
                        local c: Column = t.columns.get(j);
                        sprintf(num, " %d\n", data_kind(c.kind));
                        ok = ok && f.write("COL ") && f.write(c.name) && f.write(num);
                    }
                    loop (local k: int = 0; ok && !tooLong && k < t.rows.len(); k = k + 1) {
                        local r: Row = t.rows.get(k);
                        sprintf(num, "ROW %d", r.id);
                        local lineLength: long = strlen(num) + 1;
                        local serialized: Array<string> = Array<string>.new(r.values.len());
                        loop (local l: int = 0; l < r.values.len(); l = l + 1) {
                            local v: Value = r.values.get(l);
                            local text: string = serialize_value(&v);
                            serialized.push(text);
                            lineLength = lineLength + 1 + strlen(text);
                        }
                        if (lineLength >= 1048576) {
                            tooLong = true;
                        } else {
                            ok = ok && f.write(num);
                            loop (local l: int = 0; ok && l < serialized.len(); l = l + 1) {
                                ok = ok && f.write(" ") && f.write(serialized.get(l));
                            }
                            ok = ok && f.write("\n");
                        }
                        loop (local l: int = 0; l < serialized.len(); l = l + 1) {
                            free(serialized.get(l));
                        }
                        serialized.destroy();
                    }
                    ok = ok && f.write("END_TABLE\n");
                }
                curr = curr.next;
            }
            i = i + 1;
        }
        cleanup = 1;
        if (!f.close()) { ok = false; }
        if (tooLong) { throw "Database record exceeds 1 MiB"; }
        if (!ok || rename(tmp, path) != 0) { throw "Database save failed"; }
        cleanup = 0;
    }

    frame load(this: *Database, path: string) {
        local f: File = File.open(path, "r");
        if (f.handle == nullptr) {
            printf("Error: Cannot open file for reading: %s\n", path);
            return;
        }
        local buf: string = malloc(1048577);
        if(buf == nullptr) {f.close(); throw "Database allocation failed";}
        defer free(buf); defer f.close();
        local current_table: *Table = nullptr;

        loop (f.readLine(buf, 1048577)) {
            local len: int = strlen(buf);
            if(len == 1048576 && buf[len-1] != 10) {throw "Database record exceeds 1 MiB";}
            len = len; # Suppress unused variable warning
            # printf("Line len: %d, last: %d\n", len, buf[len-1]);
            if ((len > 0) && (buf[len - 1] == 10)) {
                # printf("Stripping newline at %d\n", len-1);
                buf[len - 1] = 0;
            }
            # Strip CR
            if ((len > 1) && (buf[len - 2] == 13))
                buf[len - 2] = 0;
            # Re-calculate len after stripping? Or just rely on string functions.

            if (StringUtils.startsWith(buf, "TABLE ")) {
                local name_ptr: string = buf + 6;
                local len: int = strlen(name_ptr);
                local name: string = malloc(cast<long>(len + 1));
                local i: int = 0;
                loop (i <= len) {
                    name[i] = name_ptr[i];
                    i = i + 1;
                }

                # printf("Loading Table: '%s'\n", name);
                current_table = this.create_table(name);
                free(name);
            } else {
                if (StringUtils.startsWith(buf, "COL ")) {
                    if (current_table != nullptr) {
                        local ptr: string = buf + 4;
                        local space_idx: int = StringUtils.find(ptr, 32);
                        if (space_idx != -1) {
                            ptr[space_idx] = 0;
                            local name_ptr: string = ptr;
                            local len: int = strlen(name_ptr);
                            local name: string = malloc(cast<long>(len + 1));
                            local i: int = 0;
                            loop (i <= len) {
                                name[i] = name_ptr[i];
                                i = i + 1;
                            }

                            local type_int: int = atoi(ptr + space_idx + 1);
                            type_int = type_int; # Suppress unused variable warning
                            local type_kind: DataType = DataType.Int;
                            if (type_int == 1)
                                type_kind = DataType.Str;
                            if (type_int == 2)
                                type_kind = DataType.Bool;
                            current_table.add_column(name, type_kind);
                            free(name);
                        }
                    }
                } else {
                    if (StringUtils.startsWith(buf, "ROW ")) {
                        if (current_table != nullptr) {
                            local ptr: string = buf + 4;
                            local space_idx: int = StringUtils.find(ptr, 32);
                            local values: string = ptr + strlen(ptr);
                            if (space_idx != -1) {
                                values = ptr + space_idx + 1;
                                ptr[space_idx] = 0;
                            }
                            local id: int = atoi(ptr);
                            # printf("Loading Row ID: %d\n", id);

                            local row: Row = Row.new(id);
                            if (id >= current_table.next_id)
                                current_table.next_id = id + 1;
                            ptr = values;

                            loop (true) {
                                space_idx = StringUtils.find(ptr, 32);
                                if (space_idx == -1) {
                                    if (strlen(ptr) > 0) {
                                        row.values.push(deserialize_value(ptr));
                                    }
                                    break;
                                }
                                ptr[space_idx] = 0;
                                row.values.push(deserialize_value(ptr));
                                ptr = ptr + space_idx + 1;
                            }
                            if(row.values.len() != current_table.columns.len()) {row.destroy(); throw "Database row width mismatch";}
                            current_table.rows.push(row);
                        }
                    }
                }
            }
        }

    }
    frame destroy(this: *Database) {
        loop(local i: int = 0; i < this.tables.buckets.len(); i = i + 1) {
            local node: *MapNode<string, *Table> = this.tables.buckets.get(i);
            loop(node != nullptr) { node.value.destroy(); free(cast<string>(node.value)); node = node.next; }
        }
        this.tables.destroy();
    }
}

# Persistence uses unquoted identifiers; validate them before allocating.
frame db_name(name: string) ret string {
    if(name == nullptr) {throw "Invalid database name";}
    local len: long = strlen(name);
    if(len == 0 || len > 128) {throw "Invalid database name";}
    loop(local i: long = 0; i < len; i = i + 1) {
        local c: char = name[i];
        if(!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_')) {throw "Invalid database name";}
    }
    local copy: string = malloc(len + 1);
    if(copy == nullptr) {throw "Database allocation failed";}
    loop(local i: long = 0; i <= len; i = i + 1) {copy[i] = name[i];}
    return copy;
}
