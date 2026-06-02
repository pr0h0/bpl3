extern socket(domain: int, sock_type: int, protocol: int) ret int;
extern bind(sockfd: int, addr: *sockaddr_in, addrlen: uint) ret int;
extern listen(sockfd: int, backlog: int) ret int;
extern accept(sockfd: int, addr: *sockaddr_in, addrlen: *uint) ret int;
extern read(fd: int, buf: string, count: ulong) ret long;
extern write(fd: int, buf: string, count: ulong) ret long;
extern close(fd: int) ret int;
extern open(pathname: string, flags: int) ret int;
import [printf] from "std/c.bpl";
extern exit(status: int) ret void;
extern memset(s: *void, c: int, n: ulong) ret *void;
extern setsockopt(sockfd: int, level: int, optname: int, optval: *void, optlen: uint) ret int;
import [atoi] from "std/c.bpl";
extern lseek(fd: int, offset: long, whence: int) ret long;
extern sprintf(str: string, format: string, ...) ret int;
extern strlen(s: string) ret ulong;

struct sockaddr_in {
    sin_family: short,
    sin_port: ushort,
    sin_addr: uint,
    sin_zero: ulong,
}

frame main(argc: int, argv: *string) ret int {
    local server_fd: int;
    local new_socket: int;
    local address: sockaddr_in;
    local addrlen: uint = 16;
    local buffer: char[1024];
    local valread: long;
    local opt: int = 1;
    local port: int = 8108;

    if (argc > 1) {
        port = atoi(argv[1]);
    }
    printf("Using port: %d\n", port);

    # Create socket
    server_fd = socket(2, 1, 0); # AF_INET, SOCK_STREAM, 0
    if (server_fd < 0) {
        printf("Socket creation failed\n");
        exit(1);
    }
    # Set SO_REUSEADDR
    if (setsockopt(server_fd, 1, 2, cast<*void>(&opt), 4) < 0) {
        printf("Setsockopt failed\n");
        exit(1);
    }
    # Bind
    address.sin_family = 2; # AF_INET
    address.sin_port = htons(cast<ushort>(port));
    address.sin_addr = 0; # INADDR_ANY
    address.sin_zero = 0;

    if (bind(server_fd, &address, 16) < 0) {
        printf("Bind failed\n");
        exit(1);
    }
    # Listen
    if (listen(server_fd, 3) < 0) {
        printf("Listen failed\n");
        exit(1);
    }
    printf("Server listening on port %d\n", port);

    loop {
        addrlen = 16;
        new_socket = accept(server_fd, &address, &addrlen);
        if (new_socket < 0) {
            printf("Accept failed\n");
            continue;
        }
        # Clear buffer
        memset(cast<*void>(&buffer[0]), 0, cast<ulong>(1024));

        valread = read(new_socket, cast<string>(&buffer[0]), cast<ulong>(1023));
        if (valread > 0) {
            buffer[valread] = 0;
            printf("Received request:\n%s\n", cast<string>(&buffer[0]));
            handleRequest(new_socket, cast<string>(&buffer[0]));
        }
        close(new_socket);
    }

    return 0;
}

frame handleRequest(client_fd: int, request: string) {
    # Check for GET
    if ((request[0] != 'G') || (request[1] != 'E') || (request[2] != 'T') || (request[3] != ' ')) {
        send_404(client_fd);
        return;
    }
    # Extract path
    local path_start: int = 4;
    local path_end: int = 4;

    loop ((request[path_end] != ' ') && (request[path_end] != 0)) {
        path_end = path_end + 1;
        if (path_end >= 1024) {
            send_404(client_fd);
            return;
        }
    }

    if (request[path_end] == 0) {
        send_404(client_fd);
        return;
    }
    request[path_end] = 0;
    local path: string = &request[path_start];

    printf("Requested path: %s\n", path);

    if (containsDotDot(path) != 0) {
        printf("Security violation: .. detected\n");
        send_404(client_fd);
        return;
    }
    if (path[0] == '/') {
        path = &path[1];
    }
    if (path[0] == 0) {
        send_404(client_fd);
        return;
    }
    serveFile(client_fd, path);
}

frame containsDotDot(s: string) ret int {
    local i: int = 0;
    loop (s[i] != 0) {
        if ((s[i] == '.') && (s[i + 1] == '.')) {
            return 1;
        }
        i = i + 1;
    }
    return 0;
}

frame serveFile(client_fd: int, filename: string) {
    local file_fd: int;
    local file_buffer: char[1024];
    local bytes_read: long;
    local file_size: long;
    local header_buffer: char[256];
    local header_len: int;

    file_fd = open(filename, 0); # O_RDONLY
    if (file_fd < 0) {
        printf("File not found: %s\n", filename);
        send_404(client_fd);
        return;
    }
    # Get file size
    file_size = lseek(file_fd, 0, 2); # SEEK_END
    lseek(file_fd, 0, 0); # SEEK_SET

    # Format header with Content-Length
    sprintf(cast<string>(&header_buffer[0]), "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: %ld\r\n\r\n", file_size);
    header_len = cast<int>(strlen(cast<string>(&header_buffer[0])));

    write(client_fd, cast<string>(&header_buffer[0]), cast<ulong>(header_len));

    loop {
        bytes_read = read(file_fd, cast<string>(&file_buffer[0]), cast<ulong>(1024));
        if (bytes_read <= 0) {
            break;
        }
        write(client_fd, cast<string>(&file_buffer[0]), cast<ulong>(bytes_read));
    }

    close(file_fd);
}

frame send_404(client_fd: int) {
    local response: string = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\n\r\n404 Not Found";
    write(client_fd, response, cast<ulong>(66));
}

frame htons(v: ushort) ret ushort {
    return ((v & 0xFF) << cast<ushort>(8)) | ((v & 0xFF00) >> cast<ushort>(8));
}
