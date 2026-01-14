import strcpy, strlen, strchr, strstr, atoi, malloc, free, strncmp, memcpy from "./libc.bpl";

export [Url];

struct Url {
    host: string,
    port: int,
    path: string,

    frame new(host: string, port: int, path: string) ret Url {
        local u: Url;
        u.host = host;
        u.port = port;
        u.path = path;
        return u;
    }

    frame parse(raw: string) ret Url {
        # Defaults
        local host: string = "localhost";
        local port: int = 80;
        local path: string = "/";

        # Very basic parser
        # Expects http://host:port/path or http://host/path

        local ptr: string = raw;
        if (strncmp(ptr, "http://", 7) == 0) {
            ptr = cast<string>(cast<*void>(cast<long>(ptr) + 7));
        } else {
            if (strncmp(ptr, "https://", 8) == 0) {
                ptr = cast<string>(cast<*void>(cast<long>(ptr) + 8));
                port = 443;
            }
        }

        # Now ptr points to host...
        local host_start: string = ptr;

        # Find path start '/'
        local path_start_ptr: string = strchr(ptr, 47); # '/' is 47
        local port_start_ptr: string = strchr(ptr, 58); # ':' is 58

        if (cast<long>(path_start_ptr) == 0) {
            # No path, everything is host/port
            path = "/";
            if (cast<long>(port_start_ptr) != 0) {
                # Has port
                # host is [host_start, port_start_ptr)
                local hlen: ulong = cast<ulong>(cast<long>(port_start_ptr) - cast<long>(host_start));
                host = malloc(hlen + 1);
                memcpy(host, host_start, hlen);
                local term1: *char = cast<*char>(cast<*void>(cast<long>(host) + cast<long>(hlen)));
                term1[0] = cast<char>(0);

                port = atoi(cast<string>(cast<*void>(cast<long>(port_start_ptr) + 1)));
            } else {
                # No port
                local hlen: ulong = strlen(host_start);
                host = malloc(hlen + 1);
                strcpy(host, host_start);
            }
        } else {
            # slice path
            local plen: ulong = strlen(path_start_ptr);
            path = malloc(plen + 1);
            strcpy(path, path_start_ptr);

            if ((cast<long>(port_start_ptr) != 0) && (cast<long>(port_start_ptr) < cast<long>(path_start_ptr))) {
                # Has port before path
                local hlen: ulong = cast<ulong>(cast<long>(port_start_ptr) - cast<long>(host_start));
                host = malloc(hlen + 1);
                memcpy(host, host_start, hlen);
                local termMiddle: *char = cast<*char>(cast<*void>(cast<long>(host) + cast<long>(hlen)));
                termMiddle[0] = cast<char>(0);

                # Parse port
                # We need to copy the port string to be safe for atoi? atoi stops at non-digit usually?
                # ideally we isolate the number.
                # port is between port_start_ptr+1 and path_start_ptr
                local port_len: ulong = cast<ulong>(cast<long>(path_start_ptr) - cast<long>(port_start_ptr) - 1);
                local port_str: string = malloc(port_len + 1);
                memcpy(port_str, cast<string>(cast<*void>(cast<long>(port_start_ptr) + 1)), port_len);
                local term2: *char = cast<*char>(cast<*void>(cast<long>(port_str) + cast<long>(port_len)));
                term2[0] = cast<char>(0);
                port = atoi(port_str);
                free(port_str);
            } else {
                # No port
                local hlen: ulong = cast<ulong>(cast<long>(path_start_ptr) - cast<long>(host_start));
                host = malloc(hlen + 1);
                memcpy(host, host_start, hlen);
                local term3: *char = cast<*char>(cast<*void>(cast<long>(host) + cast<long>(hlen)));
                term3[0] = cast<char>(0);
            }
        }

        return Url.new(host, port, path);
    }
}
