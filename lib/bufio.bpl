# Buffered reading and writing on file descriptors (native targets).
#
# BufferedReader reads lines of any length (LF or CRLF), single bytes,
# delimited chunks or the whole stream. BufferedWriter collects output and
# writes it in large chunks; call `flush` (or `close`) before the data must
# be visible. Writers on stdout/stderr first flush C stdio, so output stays
# ordered with printf.

export [BufferedReader];
export [BufferedWriter];

import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [IOError] from "std/errors.bpl";
import __bpl_write as writeFd from "std/c_runtime.bpl";

extern read(fd: int, buffer: *void, count: long) ret long;
extern fopen(path: string, mode: string) ret *void;
extern fclose(stream: *void) ret int;
extern fileno(stream: *void) ret int;
extern fflush(stream: *void) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;

global BUFIO_SIZE: int = 65536;

struct BufferedReader {
    fd: int,
    stream: *void,
    buffer: *u8,
    start: int,
    end: int,
    eof: bool,
    frame _make(fd: int, stream: *void) ret BufferedReader {
        local reader: BufferedReader;
        reader.fd = fd;
        reader.stream = stream;
        reader.buffer = cast<*u8>(malloc(cast<long>(BUFIO_SIZE)));
        if (reader.buffer == nullptr) {
            if (stream != nullptr) {
                fclose(stream);
            }
            throw "BufferedReader allocation failed";
        }
        reader.start = 0;
        reader.end = 0;
        reader.eof = false;
        return reader;
    }

    # Reads an already open descriptor (not closed by `close`).
    frame fromFd(fd: int) ret BufferedReader {
        return BufferedReader._make(fd, nullptr);
    }

    frame stdin() ret BufferedReader {
        return BufferedReader._make(0, nullptr);
    }

    # Opens `path` for reading; throws IOError when it cannot be opened.
    frame open(path: string) ret BufferedReader {
        local stream: *void = fopen(path, "rb");
        if (stream == nullptr) {
            throw IOError { code: 2, message: "Cannot open file for reading" };
        }
        return BufferedReader._make(fileno(stream), stream);
    }

    # Refills the buffer; false at end of input. Throws IOError on errors.
    frame _fill(this: *BufferedReader) ret bool {
        if (this.eof) {
            return false;
        }
        if (this.start > 0) {
            local kept: int = this.end - this.start;
            loop (local i: int = 0; i < kept; i = i + 1) {
                this.buffer[i] = this.buffer[this.start + i];
            }
            this.start = 0;
            this.end = kept;
        }
        local count: long = read(this.fd, cast<*void>(this.buffer + this.end), cast<long>(BUFIO_SIZE - this.end));
        if (count < cast<long>(0)) {
            throw IOError { code: 5, message: "Cannot read from descriptor" };
        }
        if (count == cast<long>(0)) {
            this.eof = true;
            return false;
        }
        this.end = this.end + cast<int>(count);
        return true;
    }

    # The next byte (0-255), or -1 at end of input.
    frame readByte(this: *BufferedReader) ret int {
        if ((this.start == this.end) && !this._fill()) {
            return -1;
        }
        local value: int = cast<int>(this.buffer[this.start]);
        this.start = this.start + 1;
        return value;
    }

    # The next byte without consuming it, or -1 at end of input.
    frame peekByte(this: *BufferedReader) ret int {
        if ((this.start == this.end) && !this._fill()) {
            return -1;
        }
        return cast<int>(this.buffer[this.start]);
    }

    # Reads up to and including `delimiter` (or to the end). None when no
    # bytes remain.
    frame readUntil(this: *BufferedReader, delimiter: u8) ret Option<String> {
        local out: StringBuilder = StringBuilder.new(80);
        local any: bool = false;
        loop {
            if ((this.start == this.end) && !this._fill()) {
                break;
            }
            local found: bool = false;
            local i: int = this.start;
            loop (i < this.end) {
                local byte: u8 = this.buffer[i];
                out.appendChar(cast<char>(byte));
                i = i + 1;
                if (byte == delimiter) {
                    found = true;
                    break;
                }
            }
            any = any || (i > this.start);
            this.start = i;
            if (found) {
                break;
            }
        }
        if (!any) {
            out.destroy();
            return Option<String>.None;
        }
        local result: String;
        result.data = out.buffer;
        result.length = out.length;
        return Option<String>.Some(result);
    }

    # The next line without its LF or CRLF terminator. None at end of input.
    frame readLine(this: *BufferedReader) ret Option<String> {
        local chunk: Option<String> = this.readUntil(cast<u8>(10));
        if (chunk.isNone()) {
            return chunk;
        }
        local line: String = chunk.unwrap();
        if ((line.length > 0) && (line.data[line.length - 1] == '\n')) {
            line.length = line.length - 1;
            if ((line.length > 0) && (line.data[line.length - 1] == '\r')) {
                line.length = line.length - 1;
            }
            line.data[line.length] = cast<char>(0);
        }
        return Option<String>.Some(line);
    }

    # Reads up to `length` bytes into `data`; returns the count (0 at end).
    frame readBytes(this: *BufferedReader, data: *u8, length: int) ret int {
        local copied: int = 0;
        loop (copied < length) {
            if ((this.start == this.end) && !this._fill()) {
                break;
            }
            loop ((copied < length) && (this.start < this.end)) {
                data[copied] = this.buffer[this.start];
                copied = copied + 1;
                this.start = this.start + 1;
            }
        }
        return copied;
    }

    # The rest of the stream as a String.
    frame readAll(this: *BufferedReader) ret String {
        local out: StringBuilder = StringBuilder.new(1024);
        loop {
            loop (local i: int = this.start; i < this.end; i = i + 1) {
                out.appendChar(cast<char>(this.buffer[i]));
            }
            this.start = this.end;
            if (!this._fill()) {
                break;
            }
        }
        local result: String;
        result.data = out.buffer;
        result.length = out.length;
        return result;
    }

    # Releases the buffer and closes a file opened by `open`.
    frame close(this: *BufferedReader) {
        if (this.buffer != nullptr) {
            free(cast<*void>(this.buffer));
            this.buffer = nullptr;
        }
        if (this.stream != nullptr) {
            fclose(this.stream);
            this.stream = nullptr;
        }
    }
}

struct BufferedWriter {
    fd: int,
    stream: *void,
    buffer: *u8,
    length: int,
    failed: bool,
    frame _make(fd: int, stream: *void) ret BufferedWriter {
        local writer: BufferedWriter;
        writer.fd = fd;
        writer.stream = stream;
        writer.buffer = cast<*u8>(malloc(cast<long>(BUFIO_SIZE)));
        if (writer.buffer == nullptr) {
            if (stream != nullptr) {
                fclose(stream);
            }
            throw "BufferedWriter allocation failed";
        }
        writer.length = 0;
        writer.failed = false;
        return writer;
    }

    frame fromFd(fd: int) ret BufferedWriter {
        return BufferedWriter._make(fd, nullptr);
    }

    frame stdout() ret BufferedWriter {
        return BufferedWriter._make(1, nullptr);
    }

    frame stderr() ret BufferedWriter {
        return BufferedWriter._make(2, nullptr);
    }

    # Creates or truncates `path`; throws IOError when it cannot be opened.
    frame create(path: string) ret BufferedWriter {
        local stream: *void = fopen(path, "wb");
        if (stream == nullptr) {
            throw IOError { code: 2, message: "Cannot open file for writing" };
        }
        return BufferedWriter._make(fileno(stream), stream);
    }

    # Opens `path` for appending; throws IOError when it cannot be opened.
    frame append(path: string) ret BufferedWriter {
        local stream: *void = fopen(path, "ab");
        if (stream == nullptr) {
            throw IOError { code: 2, message: "Cannot open file for appending" };
        }
        return BufferedWriter._make(fileno(stream), stream);
    }

    # Writes the buffered bytes; returns false after any write error.
    frame flush(this: *BufferedWriter) ret bool {
        if ((this.fd == 1) || (this.fd == 2)) {
            fflush(nullptr);
        }
        local written: int = 0;
        loop (written < this.length) {
            local count: long = writeFd(this.fd, cast<*char>(this.buffer + written), cast<long>(this.length - written));
            if (count <= cast<long>(0)) {
                this.failed = true;
                break;
            }
            written = written + cast<int>(count);
        }
        this.length = 0;
        return !this.failed;
    }

    frame writeBytes(this: *BufferedWriter, data: *u8, length: int) ret bool {
        loop (local i: int = 0; i < length; i = i + 1) {
            if (this.length == BUFIO_SIZE) {
                this.flush();
            }
            this.buffer[this.length] = data[i];
            this.length = this.length + 1;
        }
        return !this.failed;
    }

    frame write(this: *BufferedWriter, text: string) ret bool {
        if (text == nullptr) {
            return !this.failed;
        }
        return this.writeBytes(cast<*u8>(text), cast<int>(strlen(text)));
    }

    frame writeLine(this: *BufferedWriter, text: string) ret bool {
        this.write(text);
        return this.writeByte(cast<u8>(10));
    }

    frame writeByte(this: *BufferedWriter, value: u8) ret bool {
        if (this.length == BUFIO_SIZE) {
            this.flush();
        }
        this.buffer[this.length] = value;
        this.length = this.length + 1;
        return !this.failed;
    }

    frame writeLong(this: *BufferedWriter, value: long) ret bool {
        local digits: StringBuilder = StringBuilder.new(24);
        digits.appendLong(value);
        local ok: bool = this.write(digits.buffer);
        digits.destroy();
        return ok;
    }

    # Flushes, releases the buffer and closes a file opened by `create` or
    # `append`. Returns whether every write succeeded.
    frame close(this: *BufferedWriter) ret bool {
        local ok: bool = true;
        if (this.buffer != nullptr) {
            ok = this.flush();
            free(cast<*void>(this.buffer));
            this.buffer = nullptr;
        }
        if (this.stream != nullptr) {
            if (fclose(this.stream) != 0) {
                ok = false;
            }
            this.stream = nullptr;
        }
        return ok;
    }
}
