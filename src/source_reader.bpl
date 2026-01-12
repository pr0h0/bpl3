# Source Reader and Manager

export [SourceFile];
export [SourceManager];

import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [FS] from "std/fs.bpl";

struct SourceFile {
    path: String,
    content: String,
    lines: Array<int>,
    # Starting index of each line (0-based line index -> char index)

    frame new(path: string, content: string) ret SourceFile {
        local s: SourceFile;
        s.path = String.new(path);
        s.content = String.new(content);
        s.lines = Array<int>.new(16);
        s._computeLines();
        return s;
    }

    frame fromString(path: string, content: String) ret SourceFile {
        local s: SourceFile;
        s.path = String.new(path);
        s.content = content.clone(); # Clone so we own it properly, or move? Assuming clone for safety.
        s.lines = Array<int>.new(16);
        s._computeLines();
        return s;
    }

    frame destroy(this: *SourceFile) {
        this.path.destroy();
        this.content.destroy();
        this.lines.destroy();
    }

    frame _computeLines(this: *SourceFile) {
        this.lines.length = 0;
        this.lines.push(0); # Line 1 starts at 0
        local i: int = 0;
        local len: int = this.content.length;
        loop (i < len) {
            if (this.content.get(i) == '\n') {
                this.lines.push(i + 1);
            }
            i = i + 1;
        }
    }

    frame getLineCount(this: *SourceFile) ret int {
        return this.lines.length;
    }

    frame getLineStart(this: *SourceFile, lineIdx: int) ret int {
        # lineIdx is 0-based
        if (lineIdx < 0) 
            return 0;
        if (lineIdx >= this.lines.length) 
            return this.content.length;
        return this.lines.get(lineIdx);
    }

    frame getLineContent(this: *SourceFile, lineIdx: int) ret String {
        local start: int = this.getLineStart(lineIdx);
        local end: int = 0;
        if ((lineIdx + 1) < this.lines.length) {
            end = this.getLineStart(lineIdx + 1) - 1; # Exclude \n if possible?
            # Actually getLineStart points to char AFTER \n.
            # So line N goes from lines[current] to lines[next]-1.
            # lines[next] is index of char after \n.
            # So lines[next]-1 is the \n itself.
        } else {
            end = this.content.length;
        }

        # Check for newline at end and trim it?
        # Usually snippet printing wants the line content without newline.
        # But let's just substring.
        if (end < start) 
            end = start;
        # String substring(start, len) in std/string.bpl? Or slice?
        # Let's check String.
        # For now assume a substring helper.
        return this.content.substring(start, end - start);
    }
}

struct SourceManager {
    files: Array<SourceFile>,
    lookup: Map<string, int>,
    # Path C-string to Index

    frame new() ret SourceManager {
        local sm: SourceManager;
        sm.files = Array<SourceFile>.new(8);
        sm.lookup = Map<string, int>.new();
        return sm;
    }

    frame destroy(this: *SourceManager) {
        local i: int = 0;
        loop (i < this.files.length) {
            local f: *SourceFile = this.files.getRef(i);
            f.destroy();
            i = i + 1;
        }
        this.files.destroy();
        this.lookup.destroy();
    }

    frame addFile(this: *SourceManager, path: string, content: string) ret int {
        if (this.lookup.has(path)) {
            return this.lookup.get(path).unwrap();
        }
        local sf: SourceFile = SourceFile.new(path, content);
        local idx: int = this.files.length;
        this.files.push(sf);
        this.lookup.set(path, idx);
        return idx;
    }

    frame readFile(this: *SourceManager, path: string) ret int {
        if (this.lookup.has(path)) {
            return this.lookup.get(path).unwrap();
        }
        local content: String = FS.readFile(path);
        local sf: SourceFile = SourceFile.fromString(path, content);
        content.destroy(); # fromString cloned it

        local idx: int = this.files.length;
        this.files.push(sf);
        this.lookup.set(path, idx);
        return idx;
    }

    frame getFile(this: *SourceManager, idx: int) ret *SourceFile {
        return this.files.getRef(idx);
    }
}
