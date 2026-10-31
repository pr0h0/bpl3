/**
 * BPL Runtime Support Library
 * 
 * This file provides native runtime support:
 * - Thread-local exception, defer, and stack state; process argument state
 * - Signal handlers for crashes (SIGSEGV, SIGFPE, SIGILL, SIGABRT)
 * - Stack trace generation using execinfo
 * - Formatted error printing with colors
 * 
 * The compiler generates defer, try/catch, and longjmp control flow. Runtime
 * check helpers and error types are defined together in errors.bpl.
 * 
 * Compile with: clang -c -fPIC -O2 runtime_support.c -o runtime_support.o
 */

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <stdint.h>
#include <errno.h>
#include <sys/stat.h>
#include <sys/mman.h>
#include <unistd.h>
#include <dirent.h>
#include <limits.h>
#include <time.h>
#if defined(__linux__) || defined(__APPLE__)
#include <pthread.h>
#endif

#ifdef __linux__
/* Older glibc keeps these in libpthread. A non-threaded host must still link. */
#pragma weak pthread_self
#pragma weak pthread_getattr_np
#pragma weak pthread_attr_getstack
#pragma weak pthread_attr_destroy
#endif

#ifdef __linux__
#include <execinfo.h>
#include <dlfcn.h>
#endif

#ifdef __APPLE__
#include <execinfo.h>
#include <dlfcn.h>
#endif

/* ============ Constants ============ */
#define BPL_MAX_BACKTRACE_FRAMES 64
#define BPL_MAX_STACK_DEPTH 10000

/* ============ Runtime State ============ */
/* Control state belongs to the OS thread running BPL. argc/argv describe
 * the process and intentionally remain shared. Generated LLVM uses matching
 * thread-local declarations for native targets. */
_Thread_local int32_t __bpl_stack_depth;
_Thread_local void *__bpl_stack_limit;
int32_t __bpl_argc_value;
char **__bpl_argv_value;
_Thread_local void *defer_top;
_Thread_local void *exception_top;
_Thread_local int64_t exception_value;
_Thread_local int32_t exception_type;

/* ============ Local State for BPL Stack Trace ============ */
static _Thread_local const char **__bpl_frame_names;
static _Thread_local const char **__bpl_frame_files;
static _Thread_local int32_t *__bpl_frame_lines;

/* Color codes for terminal output */
#define COLOR_RESET   "\033[0m"
#define COLOR_RED     "\033[1;31m"
#define COLOR_YELLOW  "\033[1;33m"
#define COLOR_CYAN    "\033[1;36m"
#define COLOR_GRAY    "\033[0;90m"
#define COLOR_BOLD    "\033[1m"

/* ============ Stack Trace Printing ============ */

static int __bpl_ensure_frame_storage(void) {
    if (__bpl_frame_names && __bpl_frame_files && __bpl_frame_lines) {
        return 1;
    }

    const char **names = (const char **)calloc(BPL_MAX_STACK_DEPTH, sizeof(*names));
    const char **files = (const char **)calloc(BPL_MAX_STACK_DEPTH, sizeof(*files));
    int32_t *lines = (int32_t *)calloc(BPL_MAX_STACK_DEPTH, sizeof(*lines));

    if (!names || !files || !lines) {
        free((void *)names);
        free((void *)files);
        free(lines);
        return 0;
    }

    __bpl_frame_names = names;
    __bpl_frame_files = files;
    __bpl_frame_lines = lines;
    return 1;
}

/**
 * Print native stack trace using backtrace()
 */
void __bpl_print_stack_trace(void) {
#if defined(__linux__) || defined(__APPLE__)
    void *buffer[BPL_MAX_BACKTRACE_FRAMES];
    int nptrs = backtrace(buffer, BPL_MAX_BACKTRACE_FRAMES);
    
    fprintf(stderr, "\n%s=== Stack Trace ===%s\n", COLOR_CYAN, COLOR_RESET);
    
    char **symbols = backtrace_symbols(buffer, nptrs);
    if (symbols == NULL) {
        fprintf(stderr, "  (unable to get symbols)\n");
        return;
    }
    
    /* Skip first few frames (signal handler, runtime functions) */
    int start = 2;
    for (int i = start; i < nptrs; i++) {
        Dl_info info;
        if (dladdr(buffer[i], &info) && info.dli_sname) {
            fprintf(stderr, "  %s[%d]%s %s%s%s + 0x%lx\n", 
                    COLOR_GRAY, i - start, COLOR_RESET,
                    COLOR_BOLD, info.dli_sname, COLOR_RESET,
                    (unsigned long)((char*)buffer[i] - (char*)info.dli_saddr));
        } else {
            fprintf(stderr, "  %s[%d]%s %s\n", 
                    COLOR_GRAY, i - start, COLOR_RESET, 
                    symbols[i]);
        }
    }
    
    free(symbols);
#else
    fprintf(stderr, "  (stack traces not available on this platform)\n");
#endif
}

/**
 * Print BPL-level stack frames if available
 */
void __bpl_print_bpl_stack_trace(void) {
    if (__bpl_stack_depth <= 0) {
        return;
    }
    
    fprintf(stderr, "\n%s=== BPL Call Stack ===%s\n", COLOR_CYAN, COLOR_RESET);
    
    int depth = __bpl_stack_depth;
    if (depth > BPL_MAX_STACK_DEPTH) depth = BPL_MAX_STACK_DEPTH;
    
    for (int i = depth - 1; i >= 0 && i >= depth - 20; i--) {
        const char *name = __bpl_frame_names ? __bpl_frame_names[i] : NULL;
        const char *file = __bpl_frame_files ? __bpl_frame_files[i] : NULL;
        int32_t line = __bpl_frame_lines ? __bpl_frame_lines[i] : 0;
        
        if (name) {
            if (file && line > 0) {
                fprintf(stderr, "  %s[%d]%s %s%s%s at %s:%d\n",
                        COLOR_GRAY, depth - 1 - i, COLOR_RESET,
                        COLOR_BOLD, name, COLOR_RESET,
                        file, line);
            } else {
                fprintf(stderr, "  %s[%d]%s %s%s%s\n",
                        COLOR_GRAY, depth - 1 - i, COLOR_RESET,
                        COLOR_BOLD, name, COLOR_RESET);
            }
        }
    }
    
    if (depth > 20) {
        fprintf(stderr, "  ... %d more frames\n", depth - 20);
    }
}

/**
 * Capture stack frames into an array for error objects
 */
void **__bpl_capture_stack_frames(int *out_depth) {
#if defined(__linux__) || defined(__APPLE__)
    void *buffer[BPL_MAX_BACKTRACE_FRAMES];
    int nptrs = backtrace(buffer, BPL_MAX_BACKTRACE_FRAMES);
    
    /* Skip runtime frames */
    int start = 3;
    int count = nptrs - start;
    if (count < 0) count = 0;
    
    void **frames = (void **)malloc(count * sizeof(void *));
    if (frames) {
        for (int i = 0; i < count; i++) {
            frames[i] = buffer[start + i];
        }
    }
    
    *out_depth = count;
    return frames;
#else
    *out_depth = 0;
    return NULL;
#endif
}

/* ============ Named Frame Tracking (optional enhancement) ============ */

/**
 * Enter a named stack frame (for enhanced stack traces)
 * This supplements the basic __bpl_enter_stack_frame defined below.
 */
void __bpl_enter_stack_frame_named(const char *name, const char *file, int32_t line) {
    int idx = __bpl_stack_depth - 1;
    if (idx >= 0 && idx < BPL_MAX_STACK_DEPTH && __bpl_ensure_frame_storage()) {
        __bpl_frame_names[idx] = name;
        __bpl_frame_files[idx] = file;
        __bpl_frame_lines[idx] = line;
    }
}

/**
 * Clear frame info on exit
 */
void __bpl_clear_frame_info(void) {
    int idx = __bpl_stack_depth - 1;
    if (
        idx >= 0 &&
        idx < BPL_MAX_STACK_DEPTH &&
        __bpl_frame_names &&
        __bpl_frame_files &&
        __bpl_frame_lines
    ) {
        __bpl_frame_names[idx] = NULL;
        __bpl_frame_files[idx] = NULL;
        __bpl_frame_lines[idx] = 0;
    }
}

/* ============ Signal Handlers ============ */

static void signal_handler(int sig, siginfo_t *info, void *context) {
    (void)context;
    
    const char *sig_name = "Unknown signal";
    const char *sig_desc = "";
    
    switch (sig) {
        case SIGSEGV:
            sig_name = "SIGSEGV";
            sig_desc = "Segmentation fault (invalid memory access)";
            break;
        case SIGFPE:
            sig_name = "SIGFPE";
            sig_desc = "Floating point exception";
            break;
        case SIGILL:
            sig_name = "SIGILL";
            sig_desc = "Illegal instruction";
            break;
        case SIGABRT:
            sig_name = "SIGABRT";
            sig_desc = "Aborted";
            break;
        case SIGBUS:
            sig_name = "SIGBUS";
            sig_desc = "Bus error (bad memory alignment)";
            break;
    }
    
    fprintf(stderr, "\n%s╔══════════════════════════════════════════════╗%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s║          RUNTIME ERROR: %-8s          ║%s\n", COLOR_RED, sig_name, COLOR_RESET);
    fprintf(stderr, "%s╚══════════════════════════════════════════════╝%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "\n%s%s%s\n", COLOR_YELLOW, sig_desc, COLOR_RESET);
    
    if (info && sig == SIGSEGV) {
        fprintf(stderr, "Address: %p\n", info->si_addr);
        if (info->si_addr == NULL) {
            fprintf(stderr, "%sLikely cause: Null pointer dereference%s\n", COLOR_YELLOW, COLOR_RESET);
        }
    }
    
    __bpl_print_bpl_stack_trace();
    __bpl_print_stack_trace();
    
    fprintf(stderr, "\n");
    
    /* Re-raise signal to get core dump */
    signal(sig, SIG_DFL);
    raise(sig);
}

/**
 * Install signal handlers for crash detection
 * Native BPL main calls this explicitly when it already needs the runtime.
 * Loading a BPL library must not replace handlers owned by its host runtime.
 */
void __bpl_install_signal_handlers(void) {
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_sigaction = signal_handler;
    sa.sa_flags = SA_SIGINFO | SA_ONSTACK;
    sigemptyset(&sa.sa_mask);
    
    const int signals[] = {SIGSEGV, SIGFPE, SIGILL, SIGABRT, SIGBUS};
    for (size_t i = 0; i < sizeof(signals) / sizeof(signals[0]); ++i) {
        struct sigaction current;
        if (sigaction(signals[i], NULL, &current) == 0 &&
            current.sa_handler == SIG_DFL) {
            sigaction(signals[i], &sa, NULL);
        }
    }
}

/* ============ Formatted Error Printing ============ */

void __bpl_write_stderr(const char *message) {
    if (message) {
        fputs(message, stderr);
    }
}

/**
 * Print a formatted error box with title
 */
void __bpl_print_error_box(const char *title) {
    fprintf(stderr, "\n%s╔══════════════════════════════════════════════╗%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s║ %-44s ║%s\n", COLOR_RED, title, COLOR_RESET);
    fprintf(stderr, "%s╚══════════════════════════════════════════════╝%s\n", COLOR_RED, COLOR_RESET);
}

/**
 * Print error details
 */
void __bpl_print_error_detail(const char *label, const char *value) {
    if (value) {
        fprintf(stderr, "%s: %s%s%s\n", label, COLOR_BOLD, value, COLOR_RESET);
    }
}

/**
 * Print error location
 */
void __bpl_print_error_location(int32_t line, int32_t col) {
    if (line > 0) {
        fprintf(stderr, "Location: line %d, column %d\n", line, col);
    }
}

/* ============ Panic Function ============ */

__attribute__((noreturn))
void __bpl_panic(const char *message) {
    __bpl_print_error_box("PANIC");
    fprintf(stderr, "\n%s%s%s\n", COLOR_YELLOW, message ? message : "Unrecoverable error", COLOR_RESET);
    
    __bpl_print_bpl_stack_trace();
    __bpl_print_stack_trace();
    
    fprintf(stderr, "\n");
    abort();
}

/* ============ Assertion ============ */

void __bpl_assert(int condition, const char *message, const char *file, int32_t line) {
    if (!condition) {
        __bpl_print_error_box("ASSERTION FAILED");
        
        if (message) {
            fprintf(stderr, "\n%s%s%s\n", COLOR_YELLOW, message, COLOR_RESET);
        }
        if (file) {
            fprintf(stderr, "File: %s, Line: %d\n", file, line);
        }
        
        __bpl_print_bpl_stack_trace();
        __bpl_print_stack_trace();
        
        fprintf(stderr, "\n");
        abort();
    }
}

/* Portable descriptor output: BPL lengths/results remain signed 64-bit even
 * when the native size_t/ssize_t are 32-bit. Preserve write's partial-result
 * semantics and errno; do not truncate a requested length before validation. */
int64_t __bpl_write(int32_t fd, const void *buffer, int64_t length) {
    if (length < 0) { errno = EINVAL; return -1; }
    if ((uint64_t)length > SIZE_MAX) { errno = EOVERFLOW; return -1; }
    if (length > 0 && !buffer) { errno = EFAULT; return -1; }
    return (int64_t)write(fd, buffer, (size_t)length);
}

/* Bounded stdin line input. Status values match std/io.bpl. */
int32_t __bpl_read_line(char *buffer, int32_t capacity, int32_t *length) {
    if (!buffer || capacity <= 0 || !length) return 4;
    *length = 0;
    buffer[0] = '\0';
    int truncated = 0;
    int saw_byte = 0;
    for (;;) {
        int ch = fgetc(stdin);
        if (ch == EOF) {
            if (ferror(stdin)) return 3;
            if (!saw_byte) return 1;
            return truncated ? 2 : 0;
        }
        if (ch == '\n') return truncated ? 2 : 0;
        saw_byte = 1;
        if (*length < capacity - 1) {
            buffer[(*length)++] = (char)ch;
            buffer[*length] = '\0';
        } else {
            truncated = 1;
        }
    }
}

/* Accept existing directories, including directory symlinks, but not files. */
static int __bpl_ensure_directory(const char *path) {
    if (mkdir(path, 0777) == 0) return 0;
    if (errno != EEXIST) return -1;
    struct stat info;
    return stat(path, &info) == 0 && S_ISDIR(info.st_mode) ? 0 : -1;
}

int32_t __bpl_mkdirp(const char *path) {
    if (!path || !*path) return -1;
    size_t size = strlen(path) + 1;
    char *copy = (char *)malloc(size);
    if (!copy) return -1;
    memcpy(copy, path, size);
    int result = 0;
    for (size_t i = 1; i < size - 1; ++i) {
        if (copy[i] == '/' && copy[i - 1] != '/') {
            copy[i] = '\0';
            result = __bpl_ensure_directory(copy);
            copy[i] = '/';
            if (result != 0) break;
        }
    }
    if (result == 0) result = __bpl_ensure_directory(copy);
    free(copy);
    return result;
}

/* Inspect metadata without opening devices or waiting for a FIFO peer. */
int32_t __bpl_path_exists(const char *path) {
    struct stat info;
    return path && stat(path, &info) == 0;
}

/* Keep struct stat and mode constants native. Kinds: other=0, file=1,
 * directory=2, symlink=3. Publish outputs only after all checks succeed. */
int32_t __bpl_file_info(const char *path, int32_t follow_links,
                        int64_t *size, int32_t *kind) {
    if (!size || !kind) return EINVAL;
    *size = 0;
    *kind = 0;
    if (!path || (follow_links != 0 && follow_links != 1)) return EINVAL;
    struct stat info;
    int result = follow_links ? stat(path, &info) : lstat(path, &info);
    if (result != 0) return errno ? errno : EIO;
    if (info.st_size < 0 || (uintmax_t)info.st_size > INT64_MAX) return EOVERFLOW;
    *size = (int64_t)info.st_size;
    if (S_ISREG(info.st_mode)) *kind = 1;
    else if (S_ISDIR(info.st_mode)) *kind = 2;
    else if (S_ISLNK(info.st_mode)) *kind = 3;
    return 0;
}

/* Read modification time from the already opened file, never a second path lookup. */
int32_t __bpl_file_modified(int32_t fd, int64_t *seconds) {
    if (!seconds) return EINVAL;
    *seconds = 0;
    struct stat info;
    if (fstat(fd, &info) != 0) return errno ? errno : EIO;
    *seconds = (int64_t)info.st_mtime;
    return 0;
}

/* Whole-file buffers fit the stdlib's signed int lengths, with room for NUL.
 * Read streams incrementally: procfs, pipes, and changing files need no seek. */
int32_t __bpl_read_file(const char *path, char **data, int32_t *length) {
    if (!data || !length) return EINVAL;
    *data = NULL;
    *length = 0;
    if (!path) return EINVAL;
    FILE *file = fopen(path, "rb");
    if (!file) return errno ? errno : EIO;
    size_t capacity = 4096, used = 0;
    const size_t limit = INT32_MAX - 1;
    char *buffer = malloc(capacity + 1);
    int error = buffer ? 0 : ENOMEM;
    while (!error) {
        if (used == capacity) {
            /* Probe EOF before rejecting an exactly-at-limit stream. */
            int byte = fgetc(file);
            if (byte == EOF) {
                if (ferror(file)) error = errno ? errno : EIO;
                break;
            }
            if (capacity == limit) { error = EFBIG; break; }
            size_t next = capacity > limit / 2 ? limit : capacity * 2;
            char *grown = realloc(buffer, next + 1);
            if (!grown) { error = ENOMEM; break; }
            buffer = grown;
            capacity = next;
            buffer[used++] = (char)byte;
        }
        size_t count = fread(buffer + used, 1, capacity - used, file);
        used += count;
        if (ferror(file)) { error = errno ? errno : EIO; break; }
        if (feof(file)) break;
        if (!count) { error = EIO; break; }
    }
    if (fclose(file) != 0 && !error) error = errno ? errno : EIO;
    if (error) { free(buffer); return error; }
    buffer[used] = 0;
    *data = buffer;
    *length = (int32_t)used;
    return 0;
}

/* Read into caller-owned storage without seeking or allocating. A failed
 * read may already have consumed bytes and modified the destination buffer. */
int32_t __bpl_file_read(FILE *file, void *data, int32_t length, int32_t *count) {
    if (!count) return EINVAL;
    *count = 0;
    if (!file) return EBADF;
    if (length < 0 || (!data && length)) return EINVAL;
    if (!length) return 0;
    if (ferror(file)) return EIO;
    errno = 0;
    size_t actual = fread(data, 1, (size_t)length, file);
    *count = (int32_t)actual;
    if (ferror(file)) return errno ? errno : EIO;
    return 0;
}

int32_t __bpl_file_write(FILE *file, const void *data, int64_t length) {
    if (!file || length < 0 || (!data && length)) return EINVAL;
    if ((uint64_t)length > SIZE_MAX) return EFBIG;
    size_t written = 0;
    while (written < (size_t)length) {
        size_t count = fwrite((const char *)data + written, 1,
                              (size_t)length - written, file);
        written += count;
        if (ferror(file) || !count) return errno ? errno : EIO;
    }
    return ferror(file) ? EIO : 0;
}

int32_t __bpl_write_file(const char *path, const void *data, int64_t length) {
    if (!path || length < 0 || (!data && length)) return EINVAL;
    FILE *file = fopen(path, "wb");
    if (!file) return errno ? errno : EIO;
    int error = __bpl_file_write(file, data, length);
    if (fclose(file) != 0 && !error) error = errno ? errno : EIO;
    return error;
}

const char *__bpl_dirent_name(const struct dirent *entry) {
    return entry ? entry->d_name : NULL;
}

/* Checked raw storage for BPL-owned entries; their layout stays in BPL. */
int32_t __bpl_fs_allocate_entries(int32_t count, int64_t width, void **data) {
    if (!data) return EINVAL;
    *data = NULL;
    if (count < 0 || width <= 0) return EINVAL;
    if (!count) return 0;
    if ((uint64_t)width > SIZE_MAX / (uint32_t)count) return EOVERFLOW;
    *data = malloc((size_t)count * (size_t)width);
    return *data ? 0 : ENOMEM;
}

void __bpl_free_dir_names(char **names, int32_t count) {
    for (int32_t i = 0; i < count; ++i) free(names[i]);
    free(names);
}

/* Own every name, distinguish EOF from failure, and publish only complete
 * results. No dirent or BPL String layout crosses the native ABI. */
int32_t __bpl_list_dir(const char *path, char ***names, int32_t *count) {
    if (!names || !count) return EINVAL;
    *names = NULL;
    *count = 0;
    if (!path) return EINVAL;
    DIR *dir = opendir(path);
    if (!dir) return errno ? errno : EIO;
    char **entries = NULL;
    size_t used = 0, capacity = 0;
    size_t limit = SIZE_MAX / sizeof(char *);
    if (limit > INT32_MAX) limit = INT32_MAX;
    int error = 0;
    for (;;) {
        errno = 0;
        struct dirent *entry = readdir(dir);
        if (!entry) { error = errno; break; }
        const char *name = entry->d_name;
        if (!strcmp(name, ".") || !strcmp(name, "..")) continue;
        size_t length = strlen(name);
        if (length > INT32_MAX - 1 || used == limit) {
            error = EOVERFLOW;
            break;
        }
        if (used == capacity) {
            size_t next = capacity ? (capacity > limit / 2 ? limit : capacity * 2) : 16;
            if (next > limit) next = limit;
            char **grown = realloc(entries, next * sizeof(char *));
            if (!grown) { error = ENOMEM; break; }
            entries = grown;
            capacity = next;
        }
        char *copy = malloc(length + 1);
        if (!copy) { error = ENOMEM; break; }
        memcpy(copy, name, length + 1);
        entries[used++] = copy;
    }
    errno = 0;
    if (closedir(dir) != 0 && !error) error = errno ? errno : EIO;
    if (error) {
        __bpl_free_dir_names(entries, (int32_t)used);
        return error;
    }
    *names = entries;
    *count = (int32_t)used;
    return 0;
}

/* Avoid exposing platform-specific timespec/timeval layouts to BPL. */
int32_t __bpl_clock(int32_t monotonic, int32_t units, int64_t *result) {
    if (!result || (units != 1 && units != 1000 && units != 1000000)) return EINVAL;
    *result = 0;
    struct timespec now;
    if (clock_gettime(monotonic ? CLOCK_MONOTONIC : CLOCK_REALTIME, &now) != 0)
        return errno ? errno : EIO;
    int64_t seconds = (int64_t)now.tv_sec;
    int64_t fraction = now.tv_nsec / (1000000000 / units);
    if (seconds > INT64_MAX / units || seconds < INT64_MIN / units)
        return EOVERFLOW;
    int64_t whole = seconds * units;
    if (whole > INT64_MAX - fraction) return EOVERFLOW;
    *result = whole + fraction;
    return 0;
}

int32_t __bpl_sleep_us(int64_t microseconds) {
    if (microseconds < 0) return EINVAL;
    struct timespec request;
    int64_t seconds = microseconds / 1000000;
    request.tv_sec = (time_t)seconds;
    if ((int64_t)request.tv_sec != seconds) return EOVERFLOW;
    request.tv_nsec = (long)((microseconds % 1000000) * 1000);
    while (nanosleep(&request, &request) != 0) {
        if (errno != EINTR) return errno ? errno : EIO;
    }
    return 0;
}

/* Mapping boundary for the manual allocators: fixed-width BPL sizes must fit
 * both native size_t and pointer differences before reaching the OS. */
void *__bpl_memory_map(uint64_t size) {
    if (size == 0 || size > SIZE_MAX || size > PTRDIFF_MAX) {
        return NULL;
    }
    void *ptr = mmap(NULL, (size_t)size, PROT_READ | PROT_WRITE,
                     MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    return ptr == MAP_FAILED ? NULL : ptr;
}

void __bpl_memory_unmap(void *ptr, uint64_t size) {
    if (ptr && size && size <= SIZE_MAX && size <= PTRDIFF_MAX) {
        munmap(ptr, (size_t)size);
    }
}

uint64_t __bpl_memory_page_size(void) {
    long size = sysconf(_SC_PAGESIZE);
    return size > 0 ? (uint64_t)size : 0;
}

/* ============ Program Arguments ============ */

int32_t __bpl_argc(void) { return __bpl_argc_value; }

char *__bpl_argv_get(int32_t index) {
    if (!__bpl_argv_value || index < 0 || index >= __bpl_argc_value) return NULL;
    return __bpl_argv_value[index];
}

/* ============ Memory Helpers ============ */

/* Used by `struct == null` comparisons in generated code. */
_Bool __bpl_mem_is_zero(const unsigned char *data, uint64_t length) {
    for (uint64_t index = 0; index < length; index++) {
        if (data[index] != 0) return 0;
    }
    return 1;
}

/* ============ Runtime Check Support ============ */

/*
 * The runtime check helpers themselves live in lib/errors.bpl so that the
 * error types, their vtables, and their type ids have a single definition.
 * They construct and throw an error when a handler is active, and otherwise
 * report through the panics below, which never return.
 */

_Bool __bpl_has_exception_handler(void) { return exception_top != NULL; }

static void __bpl_report_location(const char *function, const char *expression,
                                  int32_t line, int32_t column) {
    if (function) __bpl_print_error_detail("Function", function);
    if (expression) __bpl_print_error_detail("Expression", expression);
    __bpl_print_error_location(line, column);
    __bpl_print_bpl_stack_trace();
    __bpl_print_stack_trace();
}

__attribute__((noreturn))
void __bpl_panic_null_access(const char *function, const char *expression,
                             int32_t line, int32_t column) {
    __bpl_print_error_box("NULL POINTER ACCESS");
    fprintf(stderr, "%sAttempted to access member of nullptr%s\n", COLOR_YELLOW, COLOR_RESET);
    __bpl_report_location(function, expression, line, column);
    exit(1);
}

__attribute__((noreturn))
void __bpl_panic_index_out_of_bounds(int32_t index, int32_t size,
                                     const char *function, int32_t line,
                                     int32_t column) {
    __bpl_print_error_box("INDEX OUT OF BOUNDS");
    fprintf(stderr, "%sArray index %d is out of bounds for size %d%s\n",
            COLOR_YELLOW, index, size, COLOR_RESET);
    __bpl_report_location(function, NULL, line, column);
    exit(1);
}

__attribute__((noreturn))
void __bpl_panic_division_by_zero(const char *function, int32_t line,
                                  int32_t column) {
    __bpl_print_error_box("DIVISION BY ZERO");
    fprintf(stderr, "%sDivision by zero%s\n", COLOR_YELLOW, COLOR_RESET);
    __bpl_report_location(function, NULL, line, column);
    exit(1);
}

__attribute__((noreturn))
void __bpl_panic_stack_overflow(void) {
    __bpl_print_error_box("STACK OVERFLOW");
    fprintf(stderr, "%sStack overflow%s\n", COLOR_YELLOW, COLOR_RESET);
    __bpl_print_bpl_stack_trace();
    __bpl_print_stack_trace();
    exit(139);
}

/* Integer overflow is never catchable; it always reports and exits. */
__attribute__((noreturn))
void __bpl_throw_integer_overflow(const char *function, int32_t line,
                                  int32_t column) {
    __bpl_print_error_box("INTEGER OVERFLOW");
    fprintf(stderr, "%sInteger division overflow%s\n", COLOR_YELLOW, COLOR_RESET);
    __bpl_report_location(function, NULL, line, column);
    exit(1);
}

/* Cache a bounded budget, clamped to the actual foreign thread stack when
 * the platform exposes it. Leave headroom for constructing/catching errors. */
void *__bpl_initialize_stack_limit(void *current_stack) {
    const uintptr_t current = (uintptr_t)current_stack;
    const uintptr_t budget = 1024 * 1024;
    uintptr_t limit = current > budget ? current - budget : 0;
    uintptr_t bottom = 0;
    size_t size = 0;
    const int saved_errno = errno;
#ifdef __linux__
    if (pthread_self && pthread_getattr_np && pthread_attr_getstack &&
        pthread_attr_destroy) {
        pthread_attr_t attributes;
        if (pthread_getattr_np(pthread_self(), &attributes) == 0) {
            void *address = NULL;
            if (pthread_attr_getstack(&attributes, &address, &size) == 0)
                bottom = (uintptr_t)address;
            pthread_attr_destroy(&attributes);
        }
    }
#elif defined(__APPLE__)
    pthread_t thread = pthread_self();
    const uintptr_t top = (uintptr_t)pthread_get_stackaddr_np(thread);
    size = pthread_get_stacksize_np(thread);
    if (size <= top) bottom = top - size;
#endif
    if (bottom && size <= UINTPTR_MAX - bottom && current >= bottom &&
        current <= bottom + size) {
        const size_t reserve = size / 4 < 32768 ? size / 4 : 32768;
        const uintptr_t floor = bottom + reserve;
        if (floor > limit) limit = floor;
    }
    errno = saved_errno;
    return (void *)limit;
}

/* ============ Stack Depth ============ */

/*
 * Returns 1 when the call would exceed the depth limit. Generated code then
 * calls the BPL throw helper, so overflow stays catchable at every
 * optimization level.
 */
_Bool __bpl_enter_stack_frame(void) {
    /* A local's address may be on an ASan fake stack; use the real frame. */
    void *current_stack = __builtin_frame_address(0);
    if (!__bpl_stack_limit)
        __bpl_stack_limit = __bpl_initialize_stack_limit(current_stack);
    return ++__bpl_stack_depth > BPL_MAX_STACK_DEPTH ||
        (uintptr_t)current_stack < (uintptr_t)__bpl_stack_limit;
}

void __bpl_exit_stack_frame(void) {
    if (__bpl_stack_depth <= 0) return;
    __bpl_clear_frame_info();
    if (--__bpl_stack_depth == 0 && __bpl_frame_names) {
        /* A normal host-thread return must not abandon trace allocations.
         * Release at the outermost BPL frame: no TLS destructor or new
         * pthread/C++ runtime dependency is needed. */
        free((void *)__bpl_frame_names);
        free((void *)__bpl_frame_files);
        free(__bpl_frame_lines);
        __bpl_frame_names = NULL;
        __bpl_frame_files = NULL;
        __bpl_frame_lines = NULL;
    }
}

/* ------------------------------------------------------------------------
 * Process execution without a shell (std/process.bpl `run`).
 * ------------------------------------------------------------------------ */
#if defined(__linux__) || defined(__APPLE__)
#include <fcntl.h>
#include <poll.h>
#include <spawn.h>
#include <sys/wait.h>

extern char **environ;

typedef struct {
    char *data;
    int64_t length;
    int64_t capacity;
} BplProcessBuffer;

static int bpl_process_append(BplProcessBuffer *buffer, const char *bytes,
                              size_t count) {
    if ((int64_t)count > INT64_MAX - buffer->length - 1) return ENOMEM;
    int64_t needed = buffer->length + (int64_t)count + 1;
    if (needed > buffer->capacity) {
        int64_t capacity = buffer->capacity ? buffer->capacity : 4096;
        while (capacity < needed) {
            if (capacity > INT64_MAX / 2) {
                capacity = needed;
                break;
            }
            capacity *= 2;
        }
        if ((uint64_t)capacity > SIZE_MAX) return ENOMEM;
        char *grown = realloc(buffer->data, (size_t)capacity);
        if (!grown) return ENOMEM;
        buffer->data = grown;
        buffer->capacity = capacity;
    }
    memcpy(buffer->data + buffer->length, bytes, count);
    buffer->length += (int64_t)count;
    buffer->data[buffer->length] = '\0';
    return 0;
}

static int bpl_process_pipe(int fds[2]) {
    if (pipe(fds) != 0) return errno;
    for (int i = 0; i < 2; i++) {
        if (fcntl(fds[i], F_SETFD, FD_CLOEXEC) != 0) {
            int error = errno;
            close(fds[0]);
            close(fds[1]);
            return error;
        }
    }
    return 0;
}

static int64_t bpl_process_now_ms(void) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    return (int64_t)now.tv_sec * 1000 + now.tv_nsec / 1000000;
}

/* Write to the child's stdin with SIGPIPE blocked for this thread, so a child
 * that exits without reading cannot kill the caller. Returns bytes written,
 * or -1 with errno set. */
static ssize_t bpl_process_write(int fd, const char *bytes, size_t count) {
    sigset_t block, previous;
    sigemptyset(&block);
    sigaddset(&block, SIGPIPE);
    pthread_sigmask(SIG_BLOCK, &block, &previous);
    ssize_t written = write(fd, bytes, count);
    int error = errno;
    if (written < 0 && error == EPIPE) {
        /* Discard the SIGPIPE raised by this write before unblocking. */
        sigset_t pending;
        sigpending(&pending);
        if (sigismember(&pending, SIGPIPE) && !sigismember(&previous, SIGPIPE)) {
            int signal_number;
            sigwait(&block, &signal_number);
        }
    }
    pthread_sigmask(SIG_SETMASK, &previous, NULL);
    errno = error;
    return written;
}

static int32_t bpl_process_exit_code(int status) {
    if (WIFEXITED(status)) return WEXITSTATUS(status);
    if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
    return -1;
}

/* Run argv (NULL-terminated) without a shell, feeding `input` to stdin
 * (`/dev/null` when input is NULL) and capturing stdout and stderr. With a
 * positive timeout the child runs in its own process group, which is killed
 * when the timeout expires. Returns 0 once the child has been waited for,
 * or an errno value when it could not be started. The output buffers are
 * malloc'd and NUL-terminated, even when empty. */
int32_t __bpl_process_run(char *const *argv, const char *input,
                          int64_t input_length, int64_t timeout_ms,
                          int32_t *exit_code, int32_t *timed_out,
                          char **out_data, int64_t *out_length,
                          char **err_data, int64_t *err_length) {
    BplProcessBuffer out = {0}, err = {0};
    int in_pipe[2] = {-1, -1}, out_pipe[2] = {-1, -1}, err_pipe[2] = {-1, -1};
    int result = 0;
    *exit_code = -1;
    *timed_out = 0;

    if (!argv || !argv[0]) return EINVAL;
    if ((result = bpl_process_append(&out, "", 0)) != 0 ||
        (result = bpl_process_append(&err, "", 0)) != 0) {
        goto fail;
    }
    if ((result = bpl_process_pipe(out_pipe)) != 0) goto fail;
    if ((result = bpl_process_pipe(err_pipe)) != 0) goto fail;
    if (input && (result = bpl_process_pipe(in_pipe)) != 0) goto fail;

    posix_spawn_file_actions_t actions;
    posix_spawnattr_t attributes;
    posix_spawn_file_actions_init(&actions);
    posix_spawnattr_init(&attributes);
    if (input) {
        posix_spawn_file_actions_adddup2(&actions, in_pipe[0], 0);
    } else {
        posix_spawn_file_actions_addopen(&actions, 0, "/dev/null", O_RDONLY, 0);
    }
    posix_spawn_file_actions_adddup2(&actions, out_pipe[1], 1);
    posix_spawn_file_actions_adddup2(&actions, err_pipe[1], 2);

    sigset_t empty_mask, default_signals;
    sigemptyset(&empty_mask);
    sigemptyset(&default_signals);
    sigaddset(&default_signals, SIGPIPE);
    short flags = POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_SETSIGDEF;
    if (timeout_ms > 0) {
        flags |= POSIX_SPAWN_SETPGROUP;
        posix_spawnattr_setpgroup(&attributes, 0);
    }
    posix_spawnattr_setflags(&attributes, flags);
    posix_spawnattr_setsigmask(&attributes, &empty_mask);
    posix_spawnattr_setsigdefault(&attributes, &default_signals);

    pid_t pid;
    result = posix_spawnp(&pid, argv[0], &actions, &attributes, argv, environ);
    posix_spawn_file_actions_destroy(&actions);
    posix_spawnattr_destroy(&attributes);
    if (result != 0) goto fail;

    close(out_pipe[1]);
    close(err_pipe[1]);
    out_pipe[1] = err_pipe[1] = -1;
    if (input) {
        close(in_pipe[0]);
        in_pipe[0] = -1;
        fcntl(in_pipe[1], F_SETFL, fcntl(in_pipe[1], F_GETFL) | O_NONBLOCK);
        if (input_length <= 0) {
            close(in_pipe[1]);
            in_pipe[1] = -1;
        }
    }

    int64_t deadline = timeout_ms > 0 ? bpl_process_now_ms() + timeout_ms : 0;
    int64_t input_offset = 0;
    char chunk[16384];
    while (out_pipe[0] >= 0 || err_pipe[0] >= 0) {
        struct pollfd fds[3];
        int count = 0, out_index = -1, err_index = -1, in_index = -1;
        if (out_pipe[0] >= 0) {
            out_index = count;
            fds[count++] = (struct pollfd){out_pipe[0], POLLIN, 0};
        }
        if (err_pipe[0] >= 0) {
            err_index = count;
            fds[count++] = (struct pollfd){err_pipe[0], POLLIN, 0};
        }
        if (in_pipe[1] >= 0) {
            in_index = count;
            fds[count++] = (struct pollfd){in_pipe[1], POLLOUT, 0};
        }
        int wait_ms = -1;
        if (deadline) {
            int64_t remaining = deadline - bpl_process_now_ms();
            if (remaining <= 0) {
                kill(-pid, SIGKILL);
                *timed_out = 1;
                break;
            }
            wait_ms = remaining > INT32_MAX ? INT32_MAX : (int)remaining;
        }
        int ready = poll(fds, (nfds_t)count, wait_ms);
        if (ready < 0) {
            if (errno == EINTR) continue;
            result = errno;
            kill(timeout_ms > 0 ? -pid : pid, SIGKILL);
            break;
        }
        if (ready == 0) continue;

        int *read_fds[2] = {&out_pipe[0], &err_pipe[0]};
        int indices[2] = {out_index, err_index};
        BplProcessBuffer *buffers[2] = {&out, &err};
        for (int i = 0; i < 2; i++) {
            if (indices[i] < 0 || !fds[indices[i]].revents) continue;
            ssize_t got = read(*read_fds[i], chunk, sizeof chunk);
            if (got > 0) {
                if (bpl_process_append(buffers[i], chunk, (size_t)got) != 0) {
                    result = ENOMEM;
                    kill(timeout_ms > 0 ? -pid : pid, SIGKILL);
                    goto wait_child;
                }
            } else if (got == 0 || (errno != EINTR && errno != EAGAIN)) {
                close(*read_fds[i]);
                *read_fds[i] = -1;
            }
        }
        if (in_index >= 0 && fds[in_index].revents) {
            ssize_t written = bpl_process_write(
                in_pipe[1], input + input_offset,
                (size_t)(input_length - input_offset));
            if (written > 0) input_offset += written;
            if ((written < 0 && errno != EINTR && errno != EAGAIN) ||
                input_offset >= input_length) {
                close(in_pipe[1]);
                in_pipe[1] = -1;
            }
        }
    }

wait_child:
    if (in_pipe[1] >= 0) close(in_pipe[1]);
    if (out_pipe[0] >= 0) close(out_pipe[0]);
    if (err_pipe[0] >= 0) close(err_pipe[0]);
    in_pipe[1] = out_pipe[0] = err_pipe[0] = -1;
    {
        int status = 0;
        pid_t waited;
        do {
            waited = waitpid(pid, &status, 0);
        } while (waited < 0 && errno == EINTR);
        if (waited == pid) *exit_code = bpl_process_exit_code(status);
    }
    if (result != 0) {
        /* poll failed or output did not fit in memory: the child was
         * killed and waited for, and the partial output is discarded. */
        goto fail;
    }
    *out_data = out.data;
    *out_length = out.length;
    *err_data = err.data;
    *err_length = err.length;
    return 0;

fail:
    for (int i = 0; i < 2; i++) {
        if (in_pipe[i] >= 0) close(in_pipe[i]);
        if (out_pipe[i] >= 0) close(out_pipe[i]);
        if (err_pipe[i] >= 0) close(err_pipe[i]);
    }
    free(out.data);
    free(err.data);
    *out_data = NULL;
    *err_data = NULL;
    *out_length = 0;
    *err_length = 0;
    return result ? result : EIO;
}
#endif
