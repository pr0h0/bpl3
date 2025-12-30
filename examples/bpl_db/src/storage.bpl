
export [Column];
export [Row];
export [Table];
export [Database];

import [Value], [DataType], serialize_value, deserialize_value from "./types.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [Map], [Pair] from "std/map.bpl";
import [File] from "std/fs.bpl";
import [StringUtils] from "std/string_utils.bpl";

extern printf(fmt: string, ...) ret int;
extern sprintf(str: string, fmt: string, ...) ret int;
extern malloc(size: long) ret string;
extern free(ptr: string) ret void;
extern atoi(s: string) ret int;
extern strlen(s: string) ret int;
extern strcmp(s1: string, s2: string) ret int;

struct Column {
    name: string,
    kind: DataType, # Renamed from type to avoid keyword conflict
    
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
        t.name = name;
        t.columns = Array<Column>.new(4);
        t.rows = Array<Row>.new(16);
        t.next_id = 1;
        return t;
    }
    
    frame add_column(this: *Table, name: string, kind: DataType) {
        this.columns.push(Column.new(name, kind));
    }

    frame get_column_index(this: *Table, name: string) ret int {
        loop (local i: int = 0; i < this.columns.len(); i = i + 1) {
            local c: Column = this.columns.get(i);
            if (c.name == name) {
                return i;
            }
        }
        return -1;
    }
    
    frame insert(this: *Table, values: *Array<Value>) ret int {
        # Validate column count
        if (values.len() != this.columns.len()) {
            # Error: column count mismatch
            return -1;
        }
        
        # Create row
        local row: Row = Row.new(this.next_id);
        this.next_id = this.next_id + 1;
        
        # Copy values
        loop (local i: int = 0; i < values.len(); i = i + 1) {
            row.values.push(values.get(i));
        }
        
        this.rows.push(row);
        return row.id;
    }
    
    frame destroy(this: *Table) {
        this.columns.destroy();
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
    tables: Map<string, Table>,
    
    frame new() ret Database {
        local db: Database;
        db.tables = Map<string, Table>.new(16);
        return db;
    }
    
    frame create_table(this: *Database, name: string) ret *Table {
        local t: Table = Table.new(name);
        this.tables.set(name, t);
        return this.get_table(name);
    }
    
    frame get_table(this: *Database, name: string) ret *Table {
        # Manually iterate to get pointer
        local i: int = 0;
        local n: int = this.tables.items.len();
        loop (i < n) {
            local p: *Pair<string, Table> = this.tables.items.getRef(i);
            if (strcmp(p.key, name) == 0) {
                return &p.value;
            }
            i = i + 1;
        }
        return nullptr;
    }

    frame save(this: *Database, path: string) {
        local f: File = File.open(path, "w");
        if (f.handle == nullptr) {
            printf("Error: Cannot open file for writing: %s\n", path);
            return;
        }
        
        local i: int = 0;
        local n: int = this.tables.items.len();
        loop (i < n) {
            local p: *Pair<string, Table> = this.tables.items.getRef(i);
            local t: *Table = &p.value;
            
            local buf: string = malloc(4096);
            sprintf(buf, "TABLE %s\n", t.name);
            f.write(buf);
            
            # Columns
            loop (local j: int = 0; j < t.columns.len(); j = j + 1) {
                local c: Column = t.columns.get(j);
                sprintf(buf, "COL %s %d\n", c.name, c.kind);
                f.write(buf);
            }
            
            # Rows
            loop (local k: int = 0; k < t.rows.len(); k = k + 1) {
                local r: Row = t.rows.get(k);
                sprintf(buf, "ROW %d", r.id);
                f.write(buf);
                
                loop (local l: int = 0; l < r.values.len(); l = l + 1) {
                    local v: Value = r.values.get(l);
                    local s: string = serialize_value(&v);
                    f.write(" ");
                    f.write(s);
                    free(s);
                }
                f.write("\n");
            }
            
            f.write("END_TABLE\n");
            free(buf);
            
            i = i + 1;
        }
        
        f.close();
    }

    frame load(this: *Database, path: string) {
        local f: File = File.open(path, "r");
        if (f.handle == nullptr) {
            printf("Error: Cannot open file for reading: %s\n", path);
            return;
        }
        
        local buf: string = malloc(4096);
        local current_table: *Table = nullptr;
        
        loop (f.readLine(buf, 4096)) {
            local len: int = strlen(buf);
            len = len; # Suppress unused variable warning
            # printf("Line len: %d, last: %d\n", len, buf[len-1]);
            if (len > 0 && buf[len-1] == 10) {
                # printf("Stripping newline at %d\n", len-1);
                buf[len-1] = 0;
            }
            if (len > 1 && buf[len-2] == 13) buf[len-2] = 0; # Strip CR
            
            # Re-calculate len after stripping? Or just rely on string functions.
            
            if (StringUtils.startsWith(buf, "TABLE ")) {
                local name_ptr: string = buf + 6;
                local len: int = strlen(name_ptr);
                local name: string = malloc(cast<long>(len + 1));
                local i: int = 0;
                loop (i <= len) { name[i] = name_ptr[i]; i = i + 1; }
                
                # printf("Loading Table: '%s'\n", name);
                current_table = this.create_table(name);
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
                            loop (i <= len) { name[i] = name_ptr[i]; i = i + 1; }
                            
                            local type_int: int = atoi(ptr + space_idx + 1);
                            type_int = type_int; # Suppress unused variable warning
                            local type_kind: DataType = DataType.Int;
                            if (type_int == 1) type_kind = DataType.Str;
                            if (type_int == 2) type_kind = DataType.Bool;
                            
                            current_table.add_column(name, type_kind);
                        }
                    }
                } else {
                    if (StringUtils.startsWith(buf, "ROW ")) {
                        if (current_table != nullptr) {
                            local ptr: string = buf + 4;
                            local space_idx: int = StringUtils.find(ptr, 32);
                            if (space_idx != -1) {
                                ptr[space_idx] = 0;
                                local id: int = atoi(ptr);
                                # printf("Loading Row ID: %d\n", id);
                                
                                local row: Row = Row.new(id);
                                if (id >= current_table.next_id) current_table.next_id = id + 1;
                                
                                ptr = ptr + space_idx + 1;
                                
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
                                current_table.rows.push(row);
                            }
                        }
                    }
                }
            }
        }
        free(buf);
        f.close();
    }
}
