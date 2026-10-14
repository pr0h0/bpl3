# bpl-tls

Optional native TLS transport for Linux IPv4 applications using OpenSSL 3.
`libssl.so.3` is loaded only when a TLS context is created. Plain HTTP does not
need OpenSSL. No development headers or extra linker flags are required on
Linux with glibc 2.34 or newer; older glibc builds may need `--clang-flag=-ldl`.

The server supports TLS 1.2 and 1.3 with OpenSSL's default cipher configuration.
Clients require a trusted certificate chain and a matching DNS hostname or IPv4
subject alternative name. DNS wildcards must cover an entire label and do not
match multiple labels. DNS connections send SNI. There is no verification-disable
option. `TlsContext.client(nullptr)` uses OpenSSL's system trust paths;
`TlsContext.client("ca.pem")` uses an explicit CA bundle instead.

`TlsContext.serverContext("fullchain.pem", "key.pem")` loads a PEM certificate
chain and matching unencrypted PEM private key. Encrypted keys fail without a password
prompt. Keep private keys accessible only
to the service account. Certificate issuance and renewal are external; restart
listeners with renewed files to reload them. Contexts must outlive their connections.
Do not copy owning contexts or connections and destroy each copy.

`TlsConnection.empty()` creates a connection that can be opened with
`open(&context, socketFd, hostname, deadline)`. The hostname is required for
clients and ignored for servers. Deadlines are absolute monotonic milliseconds;
`TlsConnection.deadline(seconds)` creates one for 1–300 seconds.
`read`, `writeAll`, and `shutdown` accept these deadlines. `destroy` frees TLS state;
it does not close the socket or free the context. Destroy connections before contexts.

TLS uses memory BIOs and bounded socket polling. Encrypted writes use Linux
MSG_NOSIGNAL, so a disconnected peer does not change application signal handling
or terminate the process with SIGPIPE. Partial operations and TLS WANT_READ /
WANT_WRITE are retried within deadlines. Zero from `read` means TLS close_notify;
bare TCP EOF is an error. `shutdown` sends close_notify without waiting for the
peer's reply.

This package does not implement HTTP/2, HTTP/3, mutual TLS, multiple certificates
selected by SNI, certificate automation, or live certificate reloading.

Implementation follows the [OpenSSL nonblocking client guide](https://docs.openssl.org/3.2/man7/ossl-guide-tls-client-non-block/)
and [TLS error handling contract](https://docs.openssl.org/master/man3/SSL_get_error/).
