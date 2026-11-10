# RFC 6455 WebSocket server connections on top of bpl-express.

import [Request], [Response] from "bpl-express";
import [TlsConnection] from "bpl-tls";
import poll, [pollfd] from "bpl-express/src/libc.bpl";
import [Base64] from "std/base64.bpl";
import [Sha1] from "std/sha1.bpl";
import [Option] from "std/option.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern malloc(size: long) ret *void;
extern realloc(ptr: *void, size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;
extern memcpy(dest: *void, src: *void, size: ulong) ret *void;
extern send(fd: int, data: string, size: ulong, flags: int) ret long;
extern read(fd: int, data: string, size: ulong) ret long;
extern __errno_location() ret *int;

export [WebSocket];
export [WsMessage];
export [WsKind];

enum WsKind {
    # A complete text message (valid UTF-8).
    Text,
    # A complete binary message.
    Binary,
    # The peer closed the connection (close_code / data hold its reason).
    Close,
    # No message arrived within the read timeout; the connection stays open.
    Timeout,
    # Protocol or I/O failure; the connection was closed (close_code says why).
    Error,
}

struct WsMessage {
    kind: WsKind,
    # Owned payload, NUL-terminated after `size` bytes (binary may hold NULs).
    data: string,
    size: long,
    close_code: int,
    frame destroy(this: *WsMessage) {
        free(this.data);
        this.data = nullptr;
        this.size = 0;
    }
    frame isText(this: *WsMessage) ret bool {
        return this.kind == WsKind.Text;
    }
    frame isBinary(this: *WsMessage) ret bool {
        return this.kind == WsKind.Binary;
    }
    # True for Close and Error: stop reading.
    frame ended(this: *WsMessage) ret bool {
        return (this.kind == WsKind.Close) || (this.kind == WsKind.Error);
    }
}

frame wsLower(c: char) ret char {
    if ((c >= 'A') && (c <= 'Z')) {
        return c + cast<char>(32);
    }
    return c;
}

# Whether a comma-separated header value lists `token` (ASCII case-insensitive).
frame wsHasToken(value: string, token: string) ret bool {
    local length: long = strlen(token);
    local i: long = 0;
    loop (value[i] != 0) {
        loop ((value[i] == ' ') || (value[i] == '\t') || (value[i] == ',')) {
            i = i + 1;
        }
        local start: long = i;
        loop ((value[i] != 0) && (value[i] != ',')) {
            i = i + 1;
        }
        local end: long = i;
        loop ((end > start) && ((value[end - 1] == ' ') || (value[end - 1] == '\t'))) {
            end = end - 1;
        }
        if ((end - start) == length) {
            local same: bool = true;
            loop (local k: long = 0; k < length; k = k + 1) {
                if (wsLower(value[start + k]) != wsLower(token[k])) {
                    same = false;
                    break;
                }
            }
            if (same) {
                return true;
            }
        }
    }
    return false;
}

# Strict UTF-8 (no overlongs, surrogates or values above U+10FFFF).
frame wsValidUtf8(data: string, size: long) ret bool {
    local i: long = 0;
    loop (i < size) {
        local c: int = cast<int>(cast<u8>(data[i]));
        if (c < 0x80) {
            i = i + 1;
            continue;
        }
        local need: int = 0;
        local minimum: int = 0;
        local code: int = 0;
        if ((c >= 0xC2) && (c <= 0xDF)) {
            need = 1;
            minimum = 0x80;
            code = c & 0x1F;
        } else if ((c >= 0xE0) && (c <= 0xEF)) {
            need = 2;
            minimum = 0x800;
            code = c & 0x0F;
        } else if ((c >= 0xF0) && (c <= 0xF4)) {
            need = 3;
            minimum = 0x10000;
            code = c & 0x07;
        } else {
            return false;
        }
        if ((i + cast<long>(need)) >= size) {
            return false;
        }
        loop (local k: int = 1; k <= need; k = k + 1) {
            local next: int = cast<int>(cast<u8>(data[i + cast<long>(k)]));
            if ((next & 0xC0) != 0x80) {
                return false;
            }
            code = (code << 6) | (next & 0x3F);
        }
        if ((code < minimum) || (code > 0x10FFFF) || ((code >= 0xD800) && (code <= 0xDFFF))) {
            return false;
        }
        i = i + cast<long>(need) + 1;
    }
    return true;
}

struct WebSocket {
    fd: int,
    tls: *TlsConnection,
    open: bool,
    # Largest accepted message (after joining fragments), in bytes.
    max_message: long,
    # Milliseconds receive() waits for a message; Timeout is returned after.
    read_timeout_ms: long,
    # Buffered unread bytes from the connection.
    buffer: string,
    used: long,
    capacity: long,

    # Whether `req` asks to upgrade to a WebSocket (RFC 6455 4.2.1).
    frame isUpgrade(req: *Request) ret bool {
        local upgrade: Option<string> = req.header("upgrade");
        local connection: Option<string> = req.header("connection");
        local version: Option<string> = req.header("sec-websocket-version");
        local key: Option<string> = req.header("sec-websocket-key");
        if (!upgrade.isSome() || !connection.isSome() || !version.isSome() || !key.isSome()) {
            return false;
        }
        if (!wsHasToken(upgrade.unwrap(), "websocket") || !wsHasToken(connection.unwrap(), "upgrade") || (strcmp(version.unwrap(), "13") != 0)) {
            return false;
        }
        # The key is base64 of 16 bytes: 24 characters ending in "==".
        local text: string = key.unwrap();
        return (strlen(text) == 24) && (Base64.decodedLength(text) == 16);
    }
    # base64(SHA-1(key + RFC 6455 GUID)).
    frame acceptKey(key: string) ret string {
        local input: StringBuilder = StringBuilder.new(64);
        input.append(key);
        input.append("258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
        local digest: u8[20];
        Sha1.digest(cast<*u8>(input.toString()), cast<long>(input.len()), &digest[0]);
        input.destroy();
        return Base64.encode(&digest[0], 20);
    }
    # Completes the handshake on the request's connection and returns the
    # open socket. Throws (before writing anything) when the request is not a
    # valid upgrade: answer 400 or 426 yourself after checking isUpgrade().
    # `protocol` (or nullptr) is echoed as Sec-WebSocket-Protocol; pick one
    # the client offered.
    frame accept(req: *Request, res: *Response, protocol: string) ret WebSocket {
        if (!WebSocket.isUpgrade(req)) {
            throw "Request is not a WebSocket upgrade";
        }
        if (res.headers_sent || res.body_sent) {
            throw "Response already started";
        }
        local accept: string = WebSocket.acceptKey(req.header("sec-websocket-key").unwrap());
        local head: StringBuilder = StringBuilder.new(160);
        head.append("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ");
        head.append(accept);
        free(accept);
        if (protocol != nullptr) {
            loop (local i: int = 0; protocol[i] != 0; i = i + 1) {
                if ((cast<u8>(protocol[i]) <= cast<u8>(32)) || (protocol[i] == ',') || (protocol[i] == 127)) {
                    head.destroy();
                    throw "Invalid WebSocket subprotocol";
                }
            }
            head.append("\r\nSec-WebSocket-Protocol: ");
            head.append(protocol);
        }
        head.append("\r\n\r\n");
        local socket: WebSocket;
        socket.fd = res.client_fd;
        socket.tls = res.tls;
        socket.open = true;
        socket.max_message = 1048576;
        socket.read_timeout_ms = 60000;
        socket.capacity = 4096;
        socket.used = 0;
        socket.buffer = cast<string>(malloc(socket.capacity));
        if (socket.buffer == nullptr) {
            head.destroy();
            throw "WebSocket allocation failed";
        }
        local ok: bool = socket.writeAll(head.toString(), cast<long>(head.len()));
        head.destroy();
        # The framework must not write an HTTP response after the upgrade,
        # nor keep the connection for another HTTP request.
        res.headers_sent = true;
        res.body_sent = true;
        res.keep_alive = false;
        if (!ok) {
            socket.open = false;
        }
        return socket;
    }
    frame setMaxMessage(this: *WebSocket, bytes: long) {
        if ((bytes < 125) || (bytes > 67108864)) {
            throw "WebSocket message limit must be 125 bytes to 64 MiB";
        }
        this.max_message = bytes;
    }
    frame setReadTimeout(this: *WebSocket, milliseconds: long) {
        if ((milliseconds < 1) || (milliseconds > 86400000)) {
            throw "WebSocket read timeout must be 1 ms to 24 hours";
        }
        this.read_timeout_ms = milliseconds;
    }

    # ---- I/O ----------------------------------------------------------

    frame writeAll(this: *WebSocket, data: string, size: long) ret bool {
        if (this.tls != nullptr) {
            return this.tls.writeAll(data, size, TlsConnection.deadline(10));
        }
        local offset: long = 0;
        loop (offset < size) {
            # MSG_NOSIGNAL: a vanished peer must not kill the process.
            local written: long = send(this.fd, data + offset, cast<ulong>(size - offset), 16384);
            if (written < 0) {
                local error: *int = __errno_location();
                if (error[0] == 4) {
                    continue;
                }
                return false;
            }
            if (written == 0) {
                return false;
            }
            offset = offset + written;
        }
        return true;
    }
    # Reads more bytes into the buffer. 1 = got data, 0 = timeout, -1 = closed
    # or failed.
    frame fill(this: *WebSocket, deadline: long) ret int {
        if (this.used == this.capacity) {
            local grown: long = this.capacity * 2;
            local next: string = cast<string>(realloc(this.buffer, grown));
            if (next == nullptr) {
                return -1;
            }
            this.buffer = next;
            this.capacity = grown;
        }
        local remaining: long = deadline - TlsConnection.milliseconds();
        if (remaining <= 0) {
            return 0;
        }
        local count: long = 0;
        if (this.tls != nullptr) {
            count = this.tls.read(this.buffer + this.used, this.capacity - this.used, deadline);
            if ((count < 0) && (TlsConnection.milliseconds() >= deadline)) {
                return 0;
            }
        } else {
            local ready: pollfd;
            ready.fd = this.fd;
            ready.events = 1;
            ready.revents = 0;
            local wait: int = 2147483647;
            if (remaining < 2147483647) {
                wait = cast<int>(remaining);
            }
            local available: int = poll(&ready, 1, wait);
            if (available == 0) {
                return 0;
            }
            if (available < 0) {
                local error: *int = __errno_location();
                if (error[0] == 4) {
                    return this.fill(deadline);
                }
                return -1;
            }
            count = read(this.fd, this.buffer + this.used, cast<ulong>(this.capacity - this.used));
        }
        if (count <= 0) {
            return -1;
        }
        this.used = this.used + count;
        return 1;
    }
    # Ensures `size` bytes are buffered.
    frame need(this: *WebSocket, size: long, deadline: long) ret int {
        loop (this.used < size) {
            local status: int = this.fill(deadline);
            if (status <= 0) {
                return status;
            }
        }
        return 1;
    }
    frame consume(this: *WebSocket, size: long) {
        local left: long = this.used - size;
        loop (local i: long = 0; i < left; i = i + 1) {
            this.buffer[i] = this.buffer[size + i];
        }
        this.used = left;
    }

    frame writeFrame(this: *WebSocket, opcode: int, data: string, size: long) ret bool {
        if (!this.open) {
            return false;
        }
        local header: u8[10];
        header[0] = cast<u8>(0x80 | opcode);
        local headerSize: int = 2;
        if (size < 126) {
            header[1] = cast<u8>(size);
        } else if (size < 65536) {
            header[1] = cast<u8>(126);
            header[2] = cast<u8>((size >> 8) & 255);
            header[3] = cast<u8>(size & 255);
            headerSize = 4;
        } else {
            header[1] = cast<u8>(127);
            loop (local i: int = 0; i < 8; i = i + 1) {
                header[2 + i] = cast<u8>((size >> cast<long>(56 - (i * 8))) & 255);
            }
            headerSize = 10;
        }
        if (!this.writeAll(cast<string>(&header[0]), cast<long>(headerSize)) || ((size > 0) && !this.writeAll(data, size))) {
            this.open = false;
            return false;
        }
        return true;
    }
    frame sendText(this: *WebSocket, text: string) ret bool {
        local size: long = strlen(text);
        if (!wsValidUtf8(text, size)) {
            throw "WebSocket text must be valid UTF-8";
        }
        return this.writeFrame(1, text, size);
    }
    frame sendBinary(this: *WebSocket, data: string, size: long) ret bool {
        if ((size < 0) || ((size > 0) && (data == nullptr))) {
            throw "Invalid WebSocket buffer";
        }
        return this.writeFrame(2, data, size);
    }
    frame ping(this: *WebSocket, data: string) ret bool {
        local size: long = strlen(data);
        if (size > 125) {
            throw "WebSocket ping payload is limited to 125 bytes";
        }
        return this.writeFrame(9, data, size);
    }
    # Sends a close frame (code 1000-4999, reason up to 123 bytes) and stops
    # the socket. The peer's reply is not awaited.
    frame close(this: *WebSocket, code: int, reason: string) {
        if (!this.open) {
            return;
        }
        if ((code < 1000) || (code > 4999) || (code == 1004) || (code == 1005) || (code == 1006) || (code == 1015)) {
            throw "Invalid WebSocket close code";
        }
        local length: long = 0;
        if (reason != nullptr) {
            length = strlen(reason);
        }
        if (length > 123) {
            throw "WebSocket close reason is limited to 123 bytes";
        }
        local payload: u8[125];
        payload[0] = cast<u8>((code >> 8) & 255);
        payload[1] = cast<u8>(code & 255);
        loop (local i: long = 0; i < length; i = i + 1) {
            payload[2 + i] = cast<u8>(reason[i]);
        }
        this.writeFrame(8, cast<string>(&payload[0]), length + 2);
        this.open = false;
    }
    frame fail(this: *WebSocket, code: int) ret WsMessage {
        if (this.open) {
            this.close(code, "");
        }
        this.open = false;
        local message: WsMessage;
        message.kind = WsKind.Error;
        message.data = nullptr;
        message.size = 0;
        message.close_code = code;
        return message;
    }

    # Waits for the next data message. Pings are answered and pongs skipped
    # automatically. Close and Error end the connection.
    frame receive(this: *WebSocket) ret WsMessage {
        local message: WsMessage;
        message.kind = WsKind.Timeout;
        message.data = nullptr;
        message.size = 0;
        message.close_code = 0;
        if (!this.open) {
            return this.fail(1006);
        }
        local deadline: long = TlsConnection.milliseconds() + this.read_timeout_ms;
        local assembled: string = nullptr;
        local assembledSize: long = 0;
        local assembling: int = 0;
        loop {
            local status: int = this.need(2, deadline);
            if ((status == 0) && (assembling == 0) && (this.used == 0)) {
                return message;
            }
            if (status <= 0) {
                free(assembled);
                if (status == 0) {
                    # A message stalled midway: treat as a protocol timeout.
                    return this.fail(1002);
                }
                this.open = false;
                return this.fail(1006);
            }
            local b0: int = cast<int>(cast<u8>(this.buffer[0]));
            local b1: int = cast<int>(cast<u8>(this.buffer[1]));
            local fin: bool = (b0 & 0x80) != 0;
            local opcode: int = b0 & 0x0F;
            local masked: bool = (b1 & 0x80) != 0;
            local length: long = cast<long>(b1 & 0x7F);
            local headerSize: long = 2;
            # Reserved bits need a negotiated extension; none is supported.
            if (((b0 & 0x70) != 0) || !masked) {
                free(assembled);
                return this.fail(1002);
            }
            if (length == 126) {
                headerSize = 4;
            } else if (length == 127) {
                headerSize = 10;
            }
            status = this.need(headerSize + 4, deadline);
            if (status <= 0) {
                free(assembled);
                return this.fail(1002);
            }
            if (length == 126) {
                length = (cast<long>(cast<u8>(this.buffer[2])) << 8) | cast<long>(cast<u8>(this.buffer[3]));
                if (length < 126) {
                    free(assembled);
                    return this.fail(1002);
                }
            } else if (length == 127) {
                if ((cast<u8>(this.buffer[2]) & cast<u8>(0x80)) != cast<u8>(0)) {
                    free(assembled);
                    return this.fail(1002);
                }
                length = 0;
                loop (local i: int = 0; i < 8; i = i + 1) {
                    length = (length << 8) | cast<long>(cast<u8>(this.buffer[2 + i]));
                }
                if (length < 65536) {
                    free(assembled);
                    return this.fail(1002);
                }
            }
            local control: bool = opcode >= 8;
            if (control && (!fin || (length > 125))) {
                free(assembled);
                return this.fail(1002);
            }
            if (!control && ((assembledSize + length) > this.max_message)) {
                free(assembled);
                return this.fail(1009);
            }
            local start: long = headerSize + 4;
            status = this.need(start + length, deadline);
            if (status <= 0) {
                free(assembled);
                return this.fail(1002);
            }
            local mask: string = this.buffer + headerSize;
            loop (local i: long = 0; i < length; i = i + 1) {
                this.buffer[start + i] = cast<char>(cast<u8>(this.buffer[start + i]) ^ cast<u8>(mask[i % 4]));
            }
            local payload: string = this.buffer + start;
            if (opcode == 9) {
                local pong: string = cast<string>(malloc(length + 1));
                memcpy(pong, payload, cast<ulong>(length));
                this.consume(start + length);
                local ok: bool = this.writeFrame(10, pong, length);
                free(pong);
                if (!ok) {
                    free(assembled);
                    return this.fail(1006);
                }
                continue;
            }
            if (opcode == 10) {
                this.consume(start + length);
                continue;
            }
            if (opcode == 8) {
                local code: int = 1005;
                if (length == 1) {
                    free(assembled);
                    return this.fail(1002);
                }
                if (length >= 2) {
                    code = (cast<int>(cast<u8>(payload[0])) << 8) | cast<int>(cast<u8>(payload[1]));
                    local allowed: bool = ((code >= 1000) && (code <= 1003)) || ((code >= 1007) && (code <= 1014)) || ((code >= 3000) && (code <= 4999));
                    if (!allowed || !wsValidUtf8(payload + 2, length - 2)) {
                        free(assembled);
                        return this.fail(1002);
                    }
                }
                message.kind = WsKind.Close;
                message.close_code = code;
                message.size = 0;
                message.data = cast<string>(malloc(length + 1));
                if (length > 2) {
                    memcpy(message.data, payload + 2, cast<ulong>(length - 2));
                    message.size = length - 2;
                }
                message.data[message.size] = 0;
                this.consume(start + length);
                free(assembled);
                # Echo the close (RFC 6455 5.5.1), then stop.
                local reply: u8[2];
                local replyCode: int = code;
                if (replyCode == 1005) {
                    replyCode = 1000;
                }
                reply[0] = cast<u8>((replyCode >> 8) & 255);
                reply[1] = cast<u8>(replyCode & 255);
                this.writeFrame(8, cast<string>(&reply[0]), 2);
                this.open = false;
                return message;
            }
            if ((opcode != 0) && (opcode != 1) && (opcode != 2)) {
                free(assembled);
                return this.fail(1002);
            }
            if ((opcode == 0) && (assembling == 0)) {
                free(assembled);
                return this.fail(1002);
            }
            if ((opcode != 0) && (assembling != 0)) {
                free(assembled);
                return this.fail(1002);
            }
            if (opcode != 0) {
                assembling = opcode;
            }
            local grown: string = cast<string>(realloc(assembled, assembledSize + length + 1));
            if (grown == nullptr) {
                free(assembled);
                return this.fail(1011);
            }
            assembled = grown;
            memcpy(assembled + assembledSize, payload, cast<ulong>(length));
            assembledSize = assembledSize + length;
            assembled[assembledSize] = 0;
            this.consume(start + length);
            if (fin) {
                if ((assembling == 1) && !wsValidUtf8(assembled, assembledSize)) {
                    free(assembled);
                    return this.fail(1007);
                }
                message.kind = WsKind.Binary;
                if (assembling == 1) {
                    message.kind = WsKind.Text;
                }
                message.data = assembled;
                message.size = assembledSize;
                return message;
            }
        }
        return message;
    }
    # Releases buffers. The underlying connection is closed by bpl-express
    # when the handler returns.
    frame destroy(this: *WebSocket) {
        free(this.buffer);
        this.buffer = nullptr;
        this.open = false;
    }
}
