import [Engine] from "../src/engine.bpl";
import [Database], [Table], [Row] from "../src/storage.bpl";
import [Query], [Command], [Condition], [Operator] from "../src/query.bpl";
import [Value] from "../src/types.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";

import [printf] from "std/c.bpl";

# --- Helper Frames ---

frame insert_user(engine: *Engine, name: string, role: string) {
    local vals: Array<Value> = Array<Value>.new(2);
    vals.push(Value.Str(name));
    vals.push(Value.Str(role));

    local q: Query;
    q.command = Command.Insert("users", &vals);
    engine.execute(&q);
}

frame insert_book(engine: *Engine, title: string, author: string) {
    local vals: Array<Value> = Array<Value>.new(3);
    vals.push(Value.Str(title));
    vals.push(Value.Str(author));
    vals.push(Value.Int(1)); # Available = 1 (true)

    local q: Query;
    q.command = Command.Insert("books", &vals);
    engine.execute(&q);
}

frame get_book_availability(engine: *Engine, book_id: int) ret int {
    # Returns 1 if available, 0 if not, -1 if not found
    local t: *Table = engine.db.get_table("books");
    if (t == nullptr) 
        return -1;
    local result: int = -1;

    loop (local i: int = 0; i < t.rows.len(); i = i + 1) {
        local r: Row = t.rows.get(i);
        if (r.id == book_id) {
            # Column 2 is 'available'
            match (r.values.get(2)) {
                Value.Int(val) => {
                    result = val;
                    break;
                },
                Value.Str(_) => {
                    result = 0;
                    break;
                },
                Value.Bool(_) => {
                    result = 0;
                    break;
                },
                Value.Null => {
                    result = 0;
                    break;
                },
            };
        }
    }
    return result;
}

frame borrow_book(engine: *Engine, user_id: int, book_id: int) {
    printf("Action: User %d attempting to borrow Book %d... ", user_id, book_id);

    local avail: int = get_book_availability(engine, book_id);
    if (avail == -1) {
        printf("Failed: Book not found.\n");
        return;
    }
    if (avail == 0) {
        printf("Failed: Book is currently unavailable.\n");
        return;
    }
    # 1. Create Loan Record
    local vals: Array<Value> = Array<Value>.new(3);
    vals.push(Value.Int(user_id));
    vals.push(Value.Int(book_id));
    vals.push(Value.Int(1)); # Active = 1

    local q_loan: Query;
    q_loan.command = Command.Insert("loans", &vals);
    engine.execute(&q_loan);

    # 2. Update Book Availability -> 0

    # Manual Update
    local t: *Table = engine.db.get_table("books");
    loop (local i: int = 0; i < t.rows.len(); i = i + 1) {
        local r: *Row = t.rows.getRef(i);
        if (r.id == book_id) {
            # Set column 2 (available) to 0
            # Array.set replaces the value.
            r.values.set(2, Value.Int(0));
            break;
        }
    }

    printf("Success: Book borrowed.\n");
}

frame return_book(engine: *Engine, user_id: int, book_id: int) {
    printf("Action: User %d returning Book %d... ", user_id, book_id);

    # 1. Find active loan
    local t_loans: *Table = engine.db.get_table("loans");
    local found_loan: bool = false;

    loop (local i: int = 0; i < t_loans.rows.len(); i = i + 1) {
        local r: *Row = t_loans.rows.getRef(i);
        # Col 0: user_id, Col 1: book_id, Col 2: active
        local v_uid: Value = r.values.get(0);
        local v_bid: Value = r.values.get(1);
        local v_act: Value = r.values.get(2);

        local match_uid: bool = false;
        local match_bid: bool = false;
        local match_act: bool = false;

        match (v_uid) {
            Value.Int(v) => {
                if (v == user_id) {
                    match_uid = true;
                }
            },
            Value.Str(_) => {
            },
            Value.Bool(_) => {
            },
            Value.Null => {
            },
        };
        match (v_bid) {
            Value.Int(v) => {
                if (v == book_id) {
                    match_bid = true;
                }
            },
            Value.Str(_) => {
            },
            Value.Bool(_) => {
            },
            Value.Null => {
            },
        };
        match (v_act) {
            Value.Int(v) => {
                if (v == 1) {
                    match_act = true;
                }
            },
            Value.Str(_) => {
            },
            Value.Bool(_) => {
            },
            Value.Null => {
            },
        };
        if (match_uid && match_bid && match_act) {
            # Found it. Mark inactive.
            r.values.set(2, Value.Int(0));
            found_loan = true;
            break;
        }
    }

    if (!found_loan) {
        printf("Failed: No active loan found.\n");
        return;
    }
    # 2. Update Book Availability -> 1
    local t_books: *Table = engine.db.get_table("books");
    loop (local i: int = 0; i < t_books.rows.len(); i = i + 1) {
        local r: *Row = t_books.rows.getRef(i);
        if (r.id == book_id) {
            r.values.set(2, Value.Int(1));
            break;
        }
    }

    printf("Success: Book returned.\n");
}

frame list_active_loans(engine: *Engine) {
    local conds: Array<Condition> = Array<Condition>.new(1);
    local c: Condition;
    c.column = "active";
    c.op = Operator.Eq;
    c.value = Value.Int(1);
    conds.push(c);

    local q: Query;
    q.command = Command.Select("loans", &conds);
    engine.execute(&q);
}

# --- Main ---

frame main() ret int {
    printf("=== Library Management System ===\n");

    local db_engine: Engine = Engine.new();
    db_engine.silent = true; # Suppress DB engine logs, we will print our own

    # 1. Setup Schema
    printf("Initializing Database...\n");

    local cols_users: Array<string> = Array<string>.new(2);
    cols_users.push("name");
    cols_users.push("role");
    local q_create_users: Query;
    q_create_users.command = Command.Create("users", &cols_users);
    db_engine.execute(&q_create_users);

    local cols_books: Array<string> = Array<string>.new(3);
    cols_books.push("title");
    cols_books.push("author");
    cols_books.push("available");
    local q_create_books: Query;
    q_create_books.command = Command.Create("books", &cols_books);
    db_engine.execute(&q_create_books);

    local cols_loans: Array<string> = Array<string>.new(3);
    cols_loans.push("user_id");
    cols_loans.push("book_id");
    cols_loans.push("active");
    local q_create_loans: Query;
    q_create_loans.command = Command.Create("loans", &cols_loans);
    db_engine.execute(&q_create_loans);

    # 2. Seed Data
    printf("Seeding Data...\n");
    insert_user(&db_engine, "Alice", "Student"); # ID 1
    insert_user(&db_engine, "Bob", "Teacher"); # ID 2

    insert_book(&db_engine, "The Hobbit", "Tolkien"); # ID 1
    insert_book(&db_engine, "1984", "Orwell"); # ID 2

    # 3. Operations
    printf("\n--- Operations ---\n");

    # Alice borrows Hobbit
    borrow_book(&db_engine, 1, 1);

    # Bob tries to borrow Hobbit
    borrow_book(&db_engine, 2, 1);

    # Bob borrows 1984
    borrow_book(&db_engine, 2, 2);

    printf("\n--- Active Loans ---\n");
    db_engine.silent = false; # Enable output for Select
    list_active_loans(&db_engine);
    db_engine.silent = true;

    # Alice returns Hobbit
    printf("\n");
    return_book(&db_engine, 1, 1);

    printf("\n--- Active Loans (After Return) ---\n");
    db_engine.silent = false;
    list_active_loans(&db_engine);

    return 0;
}
export main;
