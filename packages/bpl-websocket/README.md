# bpl-websocket

Server-side WebSockets (RFC 6455) for [bpl-express](../bpl-express/README.md)
routes: the handshake, masked client frames, fragmentation, ping/pong, close
handshakes, UTF-8 validation and message size limits.

```bpl
import [App], [Request], [Response] from "bpl-express";
import [WebSocket], [WsMessage], [WsKind] from "bpl-websocket";

frame initialize() {}

frame echo(req: *Request, res: *Response) {
    if (!WebSocket.isUpgrade(req)) {
        res.status(426).setHeader("Upgrade", "websocket").text("WebSocket required");
        return;
    }
    local socket: WebSocket = WebSocket.accept(req, res, nullptr);
    local cleanup: *WebSocket = &socket;
    defer cleanup.destroy();
    loop {
        local message: WsMessage = socket.receive();
        if (message.ended()) {
            message.destroy();
            break;
        }
        if (message.isText()) {
            socket.sendText(message.data);
        } else if (message.isBinary()) {
            socket.sendBinary(message.data, message.size);
        }
        # WsKind.Timeout: nothing arrived within the read timeout.
        message.destroy();
    }
}

frame main() {
    local app: App = App.new();
    app.router.get("/ws", echo);
    # Each open WebSocket occupies its process; use workers for concurrency.
    app.listenWorkers(3000, "127.0.0.1", 4, initialize);
}
```

## API

- `WebSocket.isUpgrade(req)` checks `Upgrade: websocket`, a `Connection`
  header listing `Upgrade`, `Sec-WebSocket-Version: 13` and a 16-byte
  base64 `Sec-WebSocket-Key`. Answer other requests yourself (426 with
  `Upgrade: websocket` is conventional).
- `WebSocket.accept(req, res, protocol)` writes the `101 Switching Protocols`
  response and returns the open socket. `protocol` is echoed as
  `Sec-WebSocket-Protocol` (pass one the client offered in
  `sec-websocket-protocol`, or `nullptr`). It throws, without writing,
  for a non-upgrade request. Check the `Origin` header before accepting
  if browsers on other sites must not connect: WebSockets are not covered by
  CORS.
- `receive()` returns the next `WsMessage`: `Text` (validated UTF-8),
  `Binary`, `Close` (the peer closed; `close_code`, and the reason in
  `data`), `Timeout` (nothing within `setReadTimeout(ms)`, default 60 s; the
  socket stays open), or `Error` (protocol or I/O failure; the socket sent
  the matching close code and stopped). `ended()` is true for `Close` and
  `Error`. Pings are answered with pongs and pongs are skipped
  automatically. Messages own `data` (NUL-terminated after `size` bytes);
  destroy each one.
- `sendText(text)` (throws on invalid UTF-8), `sendBinary(data, size)` and
  `ping(payload)` return false once the connection failed.
  `close(code, reason)` sends a close frame (1000 to 4999, excluding the
  reserved 1004-1006 and 1015; reason up to 123 bytes).
- `setMaxMessage(bytes)` limits a whole (reassembled) message, 125 bytes to
  64 MiB, default 1 MiB.
- `destroy()` frees the socket's buffers; bpl-express closes the connection
  when the handler returns.

Protocol errors close the connection with the RFC 6455 code: 1002 for
unmasked client frames, reserved bits (no extensions such as
permessage-deflate are negotiated), unknown opcodes, continuation frames
without a start or a new message inside a fragmented one, fragmented or
oversized control frames, non-minimal lengths and invalid close payloads;
1007 for invalid UTF-8 in text; 1009 for messages over the limit. A close
from the peer is echoed before `receive` returns `Close`.

## Deployment notes

The handler runs for the whole life of the connection, so the connection
holds its process: the sequential `listen` server serves nothing else
meanwhile. Use `listenWorkers` (up to 8 processes), set read timeouts, and
send periodic pings to detect dead peers. There is no broadcast hub or shared
state between workers; use a database or another channel for fan-out. Over
`listenTLS`/`listenTLSWorkers` the socket reads and writes through the TLS
connection (`wss://`); the package tests cover plain `ws://`. `accept`
disables HTTP keep-alive for the upgraded connection.
