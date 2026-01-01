export [Engine];

import [Database], [Table], [Row], [Column] from "./storage.bpl";
import [Query], [Command], [Condition], [Operator] from "./query.bpl";
import [Value], [DataType] from "./types.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...);
extern strcmp(s1: string, s2: string) ret int;

frame use_value(v: Value) {
    local p: *Value = &v;
    if (p == nullptr) {
    }
}

frame compare_values(v1: *Value, v2: *Value) ret int {
    return match (v1[0]) {
        Value.Int(i1) => {
            return match (v2[0]) {
                Value.Int(i2) => {
                    if (i1 == i2) 
                        return 0;
                    if (i1 > i2) 
                        return 1;
                    return -1;
                },
                _ => -2,
            };
        },
        Value.Str(s1) => {
            return match (v2[0]) {
                Value.Str(s2) => {
                    return strcmp(s1, s2);
                },
                _ => -2,
            };
        },
        Value.Bool(b1) => {
            return match (v2[0]) {
                Value.Bool(b2) => {
                    if (b1 == b2) 
                        return 0;
                    if (b1) 
                        return 1;
                    return -1;
                },
                _ => -2,
            };
        },
        Value.Null => {
            return match (v2[0]) {
                Value.Null => 0,
                _ => -2,
            };
        },
    };
}

struct Engine {
    db: Database,
    silent: bool,
    frame new() ret Engine {
        local e: Engine;
        e.db = Database.new();
        e.silent = false;
        return e;
    }

    frame check_row(this: *Engine, row: *Row, table: *Table, conditions: *Array<Condition>) ret bool {
        if (conditions == nullptr) 
            return true;
        if (conditions.len() == 0) 
            return true;
        loop (local i: int = 0; i < conditions.len(); i = i + 1) {
            local cond: Condition = conditions.get(i);
            local col_idx: int = table.get_column_index(cond.column);
            if (col_idx == -1) 
                return false;
            # Column not found

            local val: *Value = row.values.getRef(col_idx);
            local cmp: int = compare_values(val, &cond.value);
            local matched: bool = false;

            match (cond.op) {
                Operator.Eq => {
                    matched = (cmp == 0);
                },
                Operator.Neq => {
                    matched = (cmp != 0);
                },
                Operator.Gt => {
                    matched = (cmp == 1);
                },
                Operator.Lt => {
                    matched = (cmp == -1);
                },
                Operator.Gte => {
                    matched = (cmp >= 0);
                },
                Operator.Lte => {
                    matched = (cmp <= 0);
                },
            };
            if (!matched) {
                return false;
            }
        }
        return true;
    }

    frame execute(this: *Engine, query: *Query) {
        match (query.command) {
            Command.Create(name, cols) => {
                local t: *Table = this.db.create_table(name);
                # Add columns (assuming Int for all for simplicity in this demo)
                loop (local i: int = 0; i < cols.len(); i = i + 1) {
                    t.add_column(cols.get(i), DataType.Int);
                }
                if (!this.silent) 
                    printf("Table '%s' created.\n", name);
            },
            Command.Insert(name, values) => {
                local t: *Table = this.db.get_table(name);
                if (t != nullptr) {
                    local id: int = t.insert(values);
                    if (id != -1) {
                        if (!this.silent) 
                            printf("Inserted row ID: %d\n", id);
                    } else {
                        if (!this.silent) 
                            printf("Error: Insert failed (column mismatch)\n");
                    }
                } else {
                    if (!this.silent) 
                        printf("Error: Table '%s' not found\n", name);
                }
            },
            Command.Select(name, conditions) => {
                local t: *Table = this.db.get_table(name);
                if (t != nullptr) {
                    if (!this.silent) 
                        printf("Results from '%s':\n", name);
                    # Iterate rows
                    loop (local i: int = 0; i < t.rows.len(); i = i + 1) {
                        local r: Row = t.rows.get(i);
                        local res: bool = this.check_row(&r, t, conditions);
                        if (res) {
                            # Print row
                            if (!this.silent) {
                                printf("ID: %d | ", r.id);
                                loop (local j: int = 0; j < r.values.len(); j = j + 1) {
                                    local v: Value = r.values.get(j);
                                    match (v) {
                                        Value.Int(val) => printf("%d ", val),
                                        Value.Str(val) => printf("%s ", val),
                                        Value.Bool(val) => printf("%d ", val), # bool as int
                                        Value.Null => printf("NULL "),
                                    };
                                }
                                printf("\n");
                            }
                        }
                    }
                } else {
                    if (!this.silent) 
                        printf("Error: Table '%s' not found\n", name);
                }
            },
            Command.Update(name, conditions, col_name, new_val) => {
                local t: *Table = this.db.get_table(name);
                if (t != nullptr) {
                    local update_col_idx: int = t.get_column_index(col_name);
                    if (update_col_idx != -1) {
                        local count: int = 0;
                        loop (local i: int = 0; i < t.rows.len(); i = i + 1) {
                            local r: *Row = t.rows.getRef(i);
                            if (this.check_row(r, t, conditions)) {
                                r.values.set(update_col_idx, new_val);
                                count = count + 1;
                            }
                        }
                        if (!this.silent) 
                            printf("Updated %d rows in '%s'.\n", count, name);
                    } else {
                        if (!this.silent) 
                            printf("Error: Column '%s' not found\n", col_name);
                    }
                } else {
                    if (!this.silent) 
                        printf("Error: Table '%s' not found\n", name);
                }
            },
            Command.Delete(name, conditions) => {
                local t: *Table = this.db.get_table(name);
                if (t != nullptr) {
                    local count: int = 0;
                    # Iterate backwards to remove safely
                    local i: int = t.rows.len() - 1;
                    loop (i >= 0) {
                        local r: *Row = t.rows.getRef(i);
                        if (this.check_row(r, t, conditions)) {
                            t.rows.removeAt(i);
                            count = count + 1;
                        }
                        i = i - 1;
                    }
                    if (!this.silent) 
                        printf("Deleted %d rows from '%s'.\n", count, name);
                } else {
                    if (!this.silent) 
                        printf("Error: Table '%s' not found\n", name);
                }
            },
        };
    }
}
