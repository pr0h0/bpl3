export [timespec];
export [pollfd];
export clock_gettime;
export poll;
# Optional OpenSSL 3 transport. Linux IPv4, memory BIOs: socket writes always use MSG_NOSIGNAL.
export [TlsContext];
export [TlsConnection];
extern dlopen(path: string, flags: int) ret *void;
extern dlsym(handle: *void, name: string) ret *void;
extern dlclose(handle: *void) ret int;
extern send(fd: int, data: *void, size: ulong, flags: int) ret long;
extern recv(fd: int, data: *void, size: ulong, flags: int) ret long;
extern poll(fds: *pollfd, count: ulong, timeout: int) ret int;
extern clock_gettime(clock: int, now: *timespec) ret int;
extern __errno_location() ret *int;
extern inet_pton(family: int, address: string, out: *void) ret int;
struct pollfd {
    fd: int,
    events: short,
    revents: short,
}
struct timespec {
    tv_sec: long,
    tv_nsec: long,
}
struct TlsApi {
    handle: *void,
    TLS_server_method: Func<*void>(),
    TLS_client_method: Func<*void>(),
    SSL_CTX_new: Func<*void>(*void),
    SSL_CTX_free: Func<void>(*void),
    SSL_CTX_ctrl: Func<long>(*void, int, long, *void),
    SSL_CTX_use_certificate_chain_file: Func<int>(*void, string),
    SSL_CTX_use_PrivateKey_file: Func<int>(*void, string, int),
    SSL_CTX_check_private_key: Func<int>(*void),
    SSL_CTX_set_verify: Func<void>(*void, int, *void),
    SSL_CTX_set_default_verify_paths: Func<int>(*void),
    SSL_CTX_load_verify_locations: Func<int>(*void, string, string),
    SSL_new: Func<*void>(*void),
    SSL_free: Func<void>(*void),
    SSL_set_bio: Func<void>(*void, *void, *void),
    SSL_set_connect_state: Func<void>(*void),
    SSL_set_accept_state: Func<void>(*void),
    SSL_ctrl: Func<long>(*void, int, long, *void),
    SSL_set1_host: Func<int>(*void, string),
    SSL_get0_param: Func<*void>(*void),
    X509_VERIFY_PARAM_set1_ip_asc: Func<int>(*void, string),
    SSL_do_handshake: Func<int>(*void),
    SSL_read: Func<int>(*void, *void, int),
    SSL_write: Func<int>(*void, *void, int),
    SSL_shutdown: Func<int>(*void),
    SSL_get_error: Func<int>(*void, int),
    SSL_get_verify_result: Func<long>(*void),
    BIO_s_mem: Func<*void>(),
    BIO_new: Func<*void>(*void),
    BIO_free: Func<int>(*void),
    BIO_read: Func<int>(*void, *void, int),
    BIO_write: Func<int>(*void, *void, int),
    BIO_ctrl: Func<long>(*void, int, long, *void),
    ERR_clear_error: Func<void>(),
    frame symbol(this: *TlsApi, name: string) ret *void {
        local value: *void = dlsym(this.handle, name);
        if (value == nullptr) {
            throw "OpenSSL 3 is missing a required TLS symbol";
        }
        return value;
    }
    frame load(this: *TlsApi) {
        this.handle = dlopen("libssl.so.3", 2);
        if (this.handle == nullptr) {
            throw "Native TLS requires OpenSSL 3 (libssl.so.3)";
        }
        try {
            this.TLS_server_method = cast<Func<*void>()>(this.symbol("TLS_server_method"));
            this.TLS_client_method = cast<Func<*void>()>(this.symbol("TLS_client_method"));
            this.SSL_CTX_new = cast<Func<*void>(*void)>(this.symbol("SSL_CTX_new"));
            this.SSL_CTX_free = cast<Func<void>(*void)>(this.symbol("SSL_CTX_free"));
            this.SSL_CTX_ctrl = cast<Func<long>(*void, int, long, *void)>(this.symbol("SSL_CTX_ctrl"));
            this.SSL_CTX_use_certificate_chain_file = cast<Func<int>(*void, string)>(this.symbol("SSL_CTX_use_certificate_chain_file"));
            this.SSL_CTX_use_PrivateKey_file = cast<Func<int>(*void, string, int)>(this.symbol("SSL_CTX_use_PrivateKey_file"));
            this.SSL_CTX_check_private_key = cast<Func<int>(*void)>(this.symbol("SSL_CTX_check_private_key"));
            this.SSL_CTX_set_verify = cast<Func<void>(*void, int, *void)>(this.symbol("SSL_CTX_set_verify"));
            this.SSL_CTX_set_default_verify_paths = cast<Func<int>(*void)>(this.symbol("SSL_CTX_set_default_verify_paths"));
            this.SSL_CTX_load_verify_locations = cast<Func<int>(*void, string, string)>(this.symbol("SSL_CTX_load_verify_locations"));
            this.SSL_new = cast<Func<*void>(*void)>(this.symbol("SSL_new"));
            this.SSL_free = cast<Func<void>(*void)>(this.symbol("SSL_free"));
            this.SSL_set_bio = cast<Func<void>(*void, *void, *void)>(this.symbol("SSL_set_bio"));
            this.SSL_set_connect_state = cast<Func<void>(*void)>(this.symbol("SSL_set_connect_state"));
            this.SSL_set_accept_state = cast<Func<void>(*void)>(this.symbol("SSL_set_accept_state"));
            this.SSL_ctrl = cast<Func<long>(*void, int, long, *void)>(this.symbol("SSL_ctrl"));
            this.SSL_set1_host = cast<Func<int>(*void, string)>(this.symbol("SSL_set1_host"));
            this.SSL_get0_param = cast<Func<*void>(*void)>(this.symbol("SSL_get0_param"));
            this.X509_VERIFY_PARAM_set1_ip_asc = cast<Func<int>(*void, string)>(this.symbol("X509_VERIFY_PARAM_set1_ip_asc"));
            this.SSL_do_handshake = cast<Func<int>(*void)>(this.symbol("SSL_do_handshake"));
            this.SSL_read = cast<Func<int>(*void, *void, int)>(this.symbol("SSL_read"));
            this.SSL_write = cast<Func<int>(*void, *void, int)>(this.symbol("SSL_write"));
            this.SSL_shutdown = cast<Func<int>(*void)>(this.symbol("SSL_shutdown"));
            this.SSL_get_error = cast<Func<int>(*void, int)>(this.symbol("SSL_get_error"));
            this.SSL_get_verify_result = cast<Func<long>(*void)>(this.symbol("SSL_get_verify_result"));
            this.BIO_s_mem = cast<Func<*void>()>(this.symbol("BIO_s_mem"));
            this.BIO_new = cast<Func<*void>(*void)>(this.symbol("BIO_new"));
            this.BIO_free = cast<Func<int>(*void)>(this.symbol("BIO_free"));
            this.BIO_read = cast<Func<int>(*void, *void, int)>(this.symbol("BIO_read"));
            this.BIO_write = cast<Func<int>(*void, *void, int)>(this.symbol("BIO_write"));
            this.BIO_ctrl = cast<Func<long>(*void, int, long, *void)>(this.symbol("BIO_ctrl"));
            this.ERR_clear_error = cast<Func<void>()>(this.symbol("ERR_clear_error"));
        } catch {
            dlclose(this.handle);
            this.handle = nullptr;
            throw "Cannot initialize OpenSSL 3 TLS bindings";
        }
    }
}
struct TlsContext {
    api: TlsApi,
    ctx: *void,
    server: bool,
    frame empty() ret TlsContext {
        local context: TlsContext;
        context.ctx = nullptr;
        context.api.handle = nullptr;
        context.server = false;
        return context;
    }
    # caFile=nullptr uses the system trust store. No verification-disable API.
    frame client(caFile: string) ret TlsContext {
        local context: TlsContext = TlsContext.empty();
        context.initialize(false, nullptr, nullptr, caFile);
        return context;
    }
    # certificateFile is PEM leaf + intermediates; keyFile is an unencrypted PEM key.
    frame serverContext(certificateFile: string, keyFile: string) ret TlsContext {
        local context: TlsContext = TlsContext.empty();
        context.initialize(true, certificateFile, keyFile, nullptr);
        return context;
    }
    frame initialize(this: *TlsContext, server: bool, certificateFile: string, keyFile: string, caFile: string) {
        if ((this.ctx != nullptr) || (this.api.handle != nullptr)) {
            throw "TLS context is already initialized";
        }
        this.api.load();
        this.server = server;
        try {
            local method: *void = nullptr;
            if (server) {
                method = this.api.TLS_server_method();
            } else {
                method = this.api.TLS_client_method();
            }
            this.ctx = this.api.SSL_CTX_new(method);
            if (this.ctx == nullptr) {
                throw "Cannot create TLS context";
            }
            # SSL_CTRL_SET_MIN_PROTO_VERSION: TLS 1.2 minimum, TLS 1.3 also enabled.
            if (this.api.SSL_CTX_ctrl(this.ctx, 123, 771, nullptr) != 1) {
                throw "Cannot set TLS protocol minimum";
            }
            if (server) {
                if ((certificateFile == nullptr) || (keyFile == nullptr)) {
                    throw "TLS certificate and key paths are required";
                }
                if (this.api.SSL_CTX_use_certificate_chain_file(this.ctx, certificateFile) != 1) {
                    throw "Cannot load TLS certificate chain";
                }
                if ((this.api.SSL_CTX_use_PrivateKey_file(this.ctx, keyFile, 1) != 1) || (this.api.SSL_CTX_check_private_key(this.ctx) != 1)) {
                    throw "Cannot load matching TLS private key";
                }
            } else {
                this.api.SSL_CTX_set_verify(this.ctx, 1, nullptr);
                local loaded: int = 0;
                if (caFile == nullptr) {
                    loaded = this.api.SSL_CTX_set_default_verify_paths(this.ctx);
                } else {
                    loaded = this.api.SSL_CTX_load_verify_locations(this.ctx, caFile, nullptr);
                }
                if (loaded != 1) {
                    throw "Cannot load TLS certificate trust store";
                }
            }
        } catch {
            this.destroy();
            throw "TLS context configuration failed (certificate, key, or trust store)";
        }
    }
    frame destroy(this: *TlsContext) {
        if (this.ctx != nullptr) {
            this.api.SSL_CTX_free(this.ctx);
            this.ctx = nullptr;
        }
        if (this.api.handle != nullptr) {
            dlclose(this.api.handle);
            this.api.handle = nullptr;
        }
    }
}
struct TlsConnection {
    context: *TlsContext,
    ssl: *void,
    input: *void,
    output: *void,
    fd: int,
    frame empty() ret TlsConnection {
        local connection: TlsConnection;
        connection.context = nullptr;
        connection.ssl = nullptr;
        connection.input = nullptr;
        connection.output = nullptr;
        connection.fd = -1;
        return connection;
    }
    frame milliseconds() ret long {
        local time: timespec;
        if (clock_gettime(1, &time) != 0) {
            return -1;
        }
        return (time.tv_sec * 1000) + (time.tv_nsec / 1000000);
    }
    frame deadline(seconds: long) ret long {
        if ((seconds < 1) || (seconds > 300)) {
            throw "TLS deadline must be 1 to 300 seconds";
        }
        local now: long = TlsConnection.milliseconds();
        if (now < 0) {
            throw "Cannot read TLS clock";
        }
        return now + (seconds * 1000);
    }
    frame wait(this: *TlsConnection, events: short, deadline: long) ret bool {
        loop {
            local now: long = TlsConnection.milliseconds();
            local left: long = deadline - now;
            if ((now < 0) || (left <= 0)) {
                return false;
            }
            if (left > 300000) {
                left = 300000;
            }
            local fd: pollfd;
            fd.fd = this.fd;
            fd.events = events;
            fd.revents = 0;
            local ready: int = poll(&fd, 1, cast<int>(left));
            if (ready > 0) {
                return true;
            }
            if (ready == 0) {
                return false;
            }
            local error: *int = __errno_location();
            if (error[0] != 4) {
                return false;
            }
        }
        return false;
    }
    # SSL owns both BIOs after SSL_set_bio. The socket and context remain caller-owned.
    frame open(this: *TlsConnection, context: *TlsContext, fd: int, host: string, deadline: long) ret bool {
        if ((this.ssl != nullptr) || (context == nullptr) || (context.ctx == nullptr) || (fd < 0)) {
            return false;
        }
        this.context = context;
        this.fd = fd;
        this.ssl = context.api.SSL_new(context.ctx);
        if (this.ssl == nullptr) {
            return false;
        }
        this.input = context.api.BIO_new(context.api.BIO_s_mem());
        this.output = context.api.BIO_new(context.api.BIO_s_mem());
        if ((this.input == nullptr) || (this.output == nullptr)) {
            if (this.input != nullptr) {
                context.api.BIO_free(this.input);
            }
            if (this.output != nullptr) {
                context.api.BIO_free(this.output);
            }
            this.input = nullptr;
            this.output = nullptr;
            this.destroy();
            return false;
        }
        context.api.SSL_set_bio(this.ssl, this.input, this.output);
        if (context.server) {
            context.api.SSL_set_accept_state(this.ssl);
        } else {
            if ((host == nullptr) || (host[0] == 0)) {
                return false;
            }
            local address: char[4];
            if (inet_pton(2, host, &address[0]) == 1) {
                if (context.api.X509_VERIFY_PARAM_set1_ip_asc(context.api.SSL_get0_param(this.ssl), host) != 1) {
                    return false;
                }
            } else {
                if ((context.api.SSL_set1_host(this.ssl, host) != 1) || (context.api.SSL_ctrl(this.ssl, 55, 0, cast<*void>(host)) != 1)) {
                    return false;
                }
            }
            context.api.SSL_set_connect_state(this.ssl);
        }
        loop {
            if (TlsConnection.milliseconds() >= deadline) {
                return false;
            }
            context.api.ERR_clear_error();
            local result: int = context.api.SSL_do_handshake(this.ssl);
            local error: int = 0;
            if (result != 1) {
                error = context.api.SSL_get_error(this.ssl, result);
            }
            if (!this.flush(deadline)) {
                return false;
            }
            if (result == 1) {
                return context.server || (context.api.SSL_get_verify_result(this.ssl) == 0);
            }
            if (error == 2) {
                if (!this.receive(deadline)) {
                    return false;
                }
            } else if (error != 3) {
                return false;
            }
        }
        return false;
    }
    frame flush(this: *TlsConnection, deadline: long) ret bool {
        local buffer: char[16384];
        loop (this.context.api.BIO_ctrl(this.output, 10, 0, nullptr) > 0) {
            local size: int = this.context.api.BIO_read(this.output, &buffer[0], 16384);
            if (size <= 0) {
                return false;
            }
            local used: int = 0;
            loop (used < size) {
                if (!this.wait(4, deadline)) {
                    return false;
                }
                local n: long = send(this.fd, &buffer[used], cast<ulong>(size - used), 16448);
                if (n <= 0) {
                    local error: *int = __errno_location();
                    if ((n < 0) && ((error[0] == 4) || (error[0] == 11))) {
                        continue;
                    }
                    return false;
                }
                used = used + cast<int>(n);
            }
        }
        return true;
    }
    frame receive(this: *TlsConnection, deadline: long) ret bool {
        local buffer: char[16384];
        loop {
            if (!this.wait(1, deadline)) {
                return false;
            }
            local n: long = recv(this.fd, &buffer[0], 16384, 64);
            if (n <= 0) {
                local error: *int = __errno_location();
                if ((n < 0) && ((error[0] == 4) || (error[0] == 11))) {
                    continue;
                }
                return false;
            }
            return this.context.api.BIO_write(this.input, &buffer[0], cast<int>(n)) == cast<int>(n);
        }
        return false;
    }
    # Zero means authenticated TLS close_notify; bare TCP EOF is a failure.
    frame read(this: *TlsConnection, data: string, size: long, deadline: long) ret long {
        if ((this.ssl == nullptr) || (size <= 0) || (size > 2147483647)) {
            return -1;
        }
        loop {
            if (TlsConnection.milliseconds() >= deadline) {
                return -1;
            }
            this.context.api.ERR_clear_error();
            local n: int = this.context.api.SSL_read(this.ssl, cast<*void>(data), cast<int>(size));
            local error: int = 0;
            if (n <= 0) {
                error = this.context.api.SSL_get_error(this.ssl, n);
            }
            if (!this.flush(deadline)) {
                return -1;
            }
            if (n > 0) {
                return cast<long>(n);
            }
            if (error == 6) {
                return 0;
            }
            if (error == 2) {
                if (!this.receive(deadline)) {
                    return -1;
                }
            } else if (error != 3) {
                return -1;
            }
        }
        return -1;
    }
    frame writeAll(this: *TlsConnection, data: string, size: long, deadline: long) ret bool {
        if ((this.ssl == nullptr) || (size < 0) || ((size > 0) && (data == nullptr))) {
            return false;
        }
        local used: long = 0;
        loop (used < size) {
            if (TlsConnection.milliseconds() >= deadline) {
                return false;
            }
            local amount: long = size - used;
            if (amount > 16384) {
                amount = 16384;
            }
            this.context.api.ERR_clear_error();
            local n: int = this.context.api.SSL_write(this.ssl, cast<*void>(data + used), cast<int>(amount));
            local error: int = 0;
            if (n <= 0) {
                error = this.context.api.SSL_get_error(this.ssl, n);
            }
            if (!this.flush(deadline)) {
                return false;
            }
            if (n > 0) {
                used = used + cast<long>(n);
            } else if (error == 2) {
                if (!this.receive(deadline)) {
                    return false;
                }
            } else if (error != 3) {
                return false;
            }
        }
        return true;
    }
    # Send close_notify without waiting for the peer's response.
    frame shutdown(this: *TlsConnection, deadline: long) {
        if (this.ssl != nullptr) {
            this.context.api.ERR_clear_error();
            this.context.api.SSL_shutdown(this.ssl);
            this.flush(deadline);
        }
    }
    frame destroy(this: *TlsConnection) {
        if (this.ssl != nullptr) {
            this.context.api.SSL_free(this.ssl);
            this.ssl = nullptr;
        }
        this.input = nullptr;
        this.output = nullptr;
    }
}
