# HTTP Server Example

This example demonstrates a simple HTTP server written in BPL.
It serves files from the current directory.

## Features

-   Listens on port 8108, or the port given as the first argument.
-   Handles GET requests.
-   Prevents directory traversal attacks (`..`).
-   Serves files or returns 404.

## Running

From this directory, so `test1.txt` is served:

```bash
bpl run main.bpl 8108
```

## Testing

```bash
curl http://localhost:8108/test1.txt
```
