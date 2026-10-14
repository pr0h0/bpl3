export [SQLite]; export [Statement];
extern sqlite3_open_v2(path:string,db:**void,flags:int,vfs:string) ret int;
extern sqlite3_close_v2(db:*void) ret int;
extern sqlite3_busy_timeout(db:*void,ms:int) ret int;
extern sqlite3_errmsg(db:*void) ret string;
extern sqlite3_prepare_v2(db:*void,sql:string,bytes:int,stmt:**void,tail:**char) ret int;
extern sqlite3_finalize(stmt:*void) ret int;
extern sqlite3_step(stmt:*void) ret int;
extern sqlite3_reset(stmt:*void) ret int;
extern sqlite3_clear_bindings(stmt:*void) ret int;
extern sqlite3_bind_int64(stmt:*void,index:int,value:long) ret int;
extern sqlite3_bind_double(stmt:*void,index:int,value:double) ret int;
extern sqlite3_bind_text(stmt:*void,index:int,value:string,bytes:int,destructor:*void) ret int;
extern sqlite3_bind_blob(stmt:*void,index:int,value:*void,bytes:int,destructor:*void) ret int;
extern sqlite3_bind_null(stmt:*void,index:int) ret int;
extern sqlite3_column_count(stmt:*void) ret int;
extern sqlite3_column_type(stmt:*void,index:int) ret int;
extern sqlite3_column_int64(stmt:*void,index:int) ret long;
extern sqlite3_column_double(stmt:*void,index:int) ret double;
extern sqlite3_column_text(stmt:*void,index:int) ret string;
extern sqlite3_column_blob(stmt:*void,index:int) ret *void;
extern sqlite3_column_bytes(stmt:*void,index:int) ret int;
extern sqlite3_last_insert_rowid(db:*void) ret long;
extern sqlite3_changes(db:*void) ret int;

struct SQLite {
    handle:*void,
    frame open(path:string) ret SQLite {
        if(path==nullptr){throw "Invalid SQLite path";}
        local db:SQLite;db.handle=nullptr;
        # READWRITE | CREATE | FULLMUTEX; no URI interpretation.
        local code:int=sqlite3_open_v2(path,&db.handle,65542,nullptr);
        if(code!=0){if(db.handle!=nullptr){sqlite3_close_v2(db.handle);}throw "Cannot open SQLite database";}
        sqlite3_busy_timeout(db.handle,5000);
        try {db.exec("PRAGMA foreign_keys = ON");} catch {db.close();throw "Cannot configure SQLite database";}
        return db;
    }
    frame check(this:*SQLite){if(this.handle==nullptr){throw "SQLite connection is closed";}}
    frame errorMessage(this:*SQLite) ret string {this.check();return sqlite3_errmsg(this.handle);}
    frame prepare(this:*SQLite,sql:string) ret Statement {
        this.check();if(sql==nullptr){throw "Invalid SQL";}
        local s:Statement=Statement.new();
        local tail:*char=nullptr;
        local code:int=sqlite3_prepare_v2(this.handle,sql,-1,&s.handle,&tail);
        if(code!=0 || s.handle==nullptr){if(s.handle!=nullptr){sqlite3_finalize(s.handle);}throw "Cannot prepare SQL statement";}
        # Reject extra statements instead of silently ignoring them.
        loop(tail[0]==' '||tail[0]=='\t'||tail[0]=='\r'||tail[0]=='\n'){tail=tail+1;}
        if(tail[0]!=0){s.close();throw "Expected exactly one SQL statement";}
        return s;
    }
    frame exec(this:*SQLite,sql:string){local s:Statement=this.prepare(sql);local owner:*Statement=&s;defer owner.close();if(s.step()){throw "Use prepared statements to read query rows";}}
    frame begin(this:*SQLite){this.exec("BEGIN IMMEDIATE");}
    frame commit(this:*SQLite){this.exec("COMMIT");}
    frame rollback(this:*SQLite){this.exec("ROLLBACK");}
    frame lastInsertId(this:*SQLite) ret long {this.check();return sqlite3_last_insert_rowid(this.handle);}
    frame changes(this:*SQLite) ret int {this.check();return sqlite3_changes(this.handle);}
    # close_v2 lets already-prepared statements finish; no new statements may be created.
    frame close(this:*SQLite){if(this.handle!=nullptr){sqlite3_close_v2(this.handle);this.handle=nullptr;}}
}
struct Statement {
    handle:*void,
    state:int, # 0 ready, 1 row, 2 done/error
    frame new() ret Statement {local s:Statement;s.handle=nullptr;s.state=0;return s;}
    frame check(this:*Statement){if(this.handle==nullptr){throw "SQLite statement is closed";}}
    frame binding(this:*Statement){this.check();if(this.state!=0){throw "Reset statement before binding";}}
    frame bindInt(this:*Statement,index:int,value:long) ret *Statement {this.binding();if(sqlite3_bind_int64(this.handle,index,value)!=0){throw "Cannot bind integer";}return this;}
    frame bindReal(this:*Statement,index:int,value:double) ret *Statement {this.binding();if(sqlite3_bind_double(this.handle,index,value)!=0){throw "Cannot bind real";}return this;}
    # SQLITE_TRANSIENT (-1) copies caller bytes before returning.
    frame bindText(this:*Statement,index:int,value:string) ret *Statement {this.binding();if(sqlite3_bind_text(this.handle,index,value,-1,cast<*void>(cast<long>(-1)))!=0){throw "Cannot bind text";}return this;}
    frame bindBlob(this:*Statement,index:int,value:*void,size:int) ret *Statement {this.binding();if(size<0 || (size>0 && value==nullptr)){throw "Invalid blob buffer";}if(sqlite3_bind_blob(this.handle,index,value,size,cast<*void>(cast<long>(-1)))!=0){throw "Cannot bind blob";}return this;}
    frame bindNull(this:*Statement,index:int) ret *Statement {this.binding();if(sqlite3_bind_null(this.handle,index)!=0){throw "Cannot bind null";}return this;}
    frame step(this:*Statement) ret bool {
        this.check();if(this.state==2){throw "Reset completed statement before stepping";}
        local code:int=sqlite3_step(this.handle);if(code==100){this.state=1;return true;}
        this.state=2;if(code==101){return false;}throw "SQLite statement execution failed";
    }
    frame column(this:*Statement,index:int){this.check();if(this.state!=1||index<0||index>=sqlite3_column_count(this.handle)){throw "Invalid SQLite row or column";}}
    frame integer(this:*Statement,index:int) ret long {this.column(index);return sqlite3_column_int64(this.handle,index);}
    frame real(this:*Statement,index:int) ret double {this.column(index);return sqlite3_column_double(this.handle,index);}
    frame text(this:*Statement,index:int) ret string {this.column(index);return sqlite3_column_text(this.handle,index);}
    frame blob(this:*Statement,index:int) ret *void {this.column(index);return sqlite3_column_blob(this.handle,index);}
    frame bytes(this:*Statement,index:int) ret int {this.column(index);return sqlite3_column_bytes(this.handle,index);}
    frame isNull(this:*Statement,index:int) ret bool {this.column(index);return sqlite3_column_type(this.handle,index)==5;}
    # Resets execution and clears bindings, even after an execution error.
    frame reset(this:*Statement){this.check();sqlite3_reset(this.handle);if(sqlite3_clear_bindings(this.handle)!=0){throw "Cannot reset SQLite bindings";}this.state=0;}
    frame close(this:*Statement){if(this.handle!=nullptr){sqlite3_finalize(this.handle);this.handle=nullptr;}this.state=2;}
}
