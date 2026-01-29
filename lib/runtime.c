/**
 * BPL Runtime Library
 * 
 * Provides:
 * - Stack frame tracking for overflow detection
 * - Signal handlers for crashes (SIGSEGV, SIGFPE, SIGILL, SIGABRT)
 * - Stack trace generation using execinfo
 * - Runtime error throwing with detailed information
 * 
 * Compile with: clang -c -fPIC -O2 -rdynamic runtime.c -o runtime.o
 * Then link with BPL programs
 */

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <stdint.h>
#include <setjmp.h>

#ifdef __linux__
#include <execinfo.h>
#include <dlfcn.h>
#endif

#ifdef __APPLE__
#include <execinfo.h>
#include <dlfcn.h>
#endif

/* ============ Constants ============ */
#define BPL_MAX_STACK_DEPTH 10000
#define BPL_MAX_BACKTRACE_FRAMES 64
#define BPL_STACK_FRAME_BUFFER_SIZE 256

/* ============ Type Forward Declarations ============ */
typedef struct DeferNode DeferNode;
typedef struct ExceptionFrame ExceptionFrame;

/* ============ Forward Declarations ============ */

/* Exception throwing functions (defined later) */
__attribute__((noreturn)) void __bpl_throw_null_access(const char *func_name, const char *expr_str, int32_t line, int32_t col);
__attribute__((noreturn)) void __bpl_throw_stack_overflow(void);
__attribute__((noreturn)) void __bpl_throw_division_by_zero(const char *func_name, int32_t line, int32_t col);
__attribute__((noreturn)) void __bpl_throw_index_out_of_bounds(int32_t index, int32_t size, const char *func_name, int32_t line, int32_t col);
void __bpl_unwind_to_defer_node(DeferNode *target);

/* ============ Global State ============ */

/* Stack depth counter for overflow detection */
int32_t __bpl_stack_depth = 0;

/* Argc/Argv storage */
int32_t __bpl_argc_value = 0;
char **__bpl_argv_value = NULL;

/* Stack frame names for better traces (circular buffer) */
static const char *__bpl_frame_names[BPL_MAX_STACK_DEPTH];
static const char *__bpl_frame_files[BPL_MAX_STACK_DEPTH];
static int32_t __bpl_frame_lines[BPL_MAX_STACK_DEPTH];

/* Defer node for cleanup on scope exit */
struct DeferNode {
    void (*func)(void *);
    void *arg;
    DeferNode *next;
};

/* Exception frame for try/catch */
struct ExceptionFrame {
    jmp_buf buf;
    ExceptionFrame *prev;
    DeferNode *defer_top;
};

/* Global exception handling state */
DeferNode *defer_top = NULL;
ExceptionFrame *exception_top = NULL;
int64_t exception_value = 0;
int32_t exception_type = 0;

/* Color codes for terminal output */
#define COLOR_RESET   "\033[0m"
#define COLOR_RED     "\033[1;31m"
#define COLOR_YELLOW  "\033[1;33m"
#define COLOR_CYAN    "\033[1;36m"
#define COLOR_GRAY    "\033[0;90m"
#define COLOR_BOLD    "\033[1m"

/* ============ Error Type IDs (must match TypeChecker) ============ */
#define TYPE_ID_NULL_ACCESS_ERROR       3266311688U
#define TYPE_ID_STACK_OVERFLOW_ERROR    2060636097U
#define TYPE_ID_DIVISION_BY_ZERO_ERROR  3968367666U
#define TYPE_ID_INDEX_OUT_OF_BOUNDS     2320298516U

/* ============ Runtime Error Structures (must match runtime.ll) ============ */

typedef struct {
    void *vtable;
} Type;

typedef struct {
    void *vtable;
    const char *message;
    int32_t code;
    void **stack_frames;
    int32_t stack_depth;
} Error;

typedef struct {
    void *vtable;
    const char *message;
    int32_t code;
    void **stack_frames;
    int32_t stack_depth;
    const char *function;
    const char *expression;
    int32_t line;
    int32_t column;
} NullAccessError;

typedef struct {
    void *vtable;
    const char *message;
    int32_t code;
    void **stack_frames;
    int32_t stack_depth;
} StackOverflowError;

typedef struct {
    void *vtable;
    const char *message;
    int32_t code;
    void **stack_frames;
    int32_t stack_depth;
} DivisionByZeroError;

typedef struct {
    void *vtable;
    const char *message;
    int32_t code;
    void **stack_frames;
    int32_t stack_depth;
    int32_t index;
    int32_t size;
} IndexOutOfBoundsError;

/* ============ Stack Trace Utilities ============ */

/**
 * Print a stack trace to stderr
 */
static void print_stack_trace(void) {
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
            /* Demangle function name if possible */
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
static void print_bpl_stack_trace(void) {
    if (__bpl_stack_depth <= 0) {
        return;
    }
    
    fprintf(stderr, "\n%s=== BPL Call Stack ===%s\n", COLOR_CYAN, COLOR_RESET);
    
    int depth = __bpl_stack_depth;
    if (depth > BPL_MAX_STACK_DEPTH) depth = BPL_MAX_STACK_DEPTH;
    
    for (int i = depth - 1; i >= 0 && i >= depth - 20; i--) {
        const char *name = __bpl_frame_names[i];
        const char *file = __bpl_frame_files[i];
        int32_t line = __bpl_frame_lines[i];
        
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
static void **capture_stack_frames(int *out_depth) {
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
    fprintf(stderr, "%s║          RUNTIME ERROR: %s          ║%s\n", COLOR_RED, sig_name, COLOR_RESET);
    fprintf(stderr, "%s╚══════════════════════════════════════════════╝%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "\n%s%s%s\n", COLOR_YELLOW, sig_desc, COLOR_RESET);
    
    if (info && sig == SIGSEGV) {
        fprintf(stderr, "Address: %p\n", info->si_addr);
        if (info->si_addr == NULL) {
            fprintf(stderr, "%sLikely cause: Null pointer dereference%s\n", COLOR_YELLOW, COLOR_RESET);
        }
    }
    
    print_bpl_stack_trace();
    print_stack_trace();
    
    fprintf(stderr, "\n");
    
    /* Re-raise signal to get core dump */
    signal(sig, SIG_DFL);
    raise(sig);
}

/**
 * Install signal handlers for crash detection
 * Called automatically at program startup
 */
__attribute__((constructor))
static void __bpl_install_signal_handlers(void) {
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_sigaction = signal_handler;
    sa.sa_flags = SA_SIGINFO | SA_ONSTACK;
    sigemptyset(&sa.sa_mask);
    
    sigaction(SIGSEGV, &sa, NULL);
    sigaction(SIGFPE, &sa, NULL);
    sigaction(SIGILL, &sa, NULL);
    sigaction(SIGABRT, &sa, NULL);
    sigaction(SIGBUS, &sa, NULL);
}

/* ============ Defer Unwinding ============ */

void __bpl_unwind_to_defer_node(DeferNode *target) {
    while (defer_top != target) {
        DeferNode *current = defer_top;
        defer_top = current->next;
        
        if (current->func) {
            current->func(current->arg);
        }
    }
}

/* ============ Stack Frame Management ============ */

void __bpl_enter_stack_frame(void) {
    __bpl_stack_depth++;
    
    if (__bpl_stack_depth > BPL_MAX_STACK_DEPTH) {
        __bpl_throw_stack_overflow();
    }
}

void __bpl_enter_stack_frame_named(const char *name, const char *file, int32_t line) {
    int idx = __bpl_stack_depth;
    __bpl_stack_depth++;
    
    if (idx < BPL_MAX_STACK_DEPTH) {
        __bpl_frame_names[idx] = name;
        __bpl_frame_files[idx] = file;
        __bpl_frame_lines[idx] = line;
    }
    
    if (__bpl_stack_depth > BPL_MAX_STACK_DEPTH) {
        __bpl_throw_stack_overflow();
    }
}

void __bpl_exit_stack_frame(void) {
    if (__bpl_stack_depth > 0) {
        __bpl_stack_depth--;
        
        if (__bpl_stack_depth < BPL_MAX_STACK_DEPTH) {
            __bpl_frame_names[__bpl_stack_depth] = NULL;
            __bpl_frame_files[__bpl_stack_depth] = NULL;
            __bpl_frame_lines[__bpl_stack_depth] = 0;
        }
    }
}

/* ============ Argc/Argv Accessors ============ */

int32_t __bpl_argc(void) {
    return __bpl_argc_value;
}

char *__bpl_argv_get(int32_t index) {
    if (index < 0 || index >= __bpl_argc_value) {
        return NULL;
    }
    return __bpl_argv_value[index];
}

/* ============ Memory Utilities ============ */

int __bpl_mem_is_zero(const void *ptr, size_t n) {
    const unsigned char *p = (const unsigned char *)ptr;
    for (size_t i = 0; i < n; i++) {
        if (p[i] != 0) return 0;
    }
    return 1;
}

/* ============ Null Check ============ */

void __bpl_check_null(void *ptr, const char *func_name, const char *expr_str, int32_t line, int32_t col) {
    if (ptr == NULL) {
        __bpl_throw_null_access(func_name, expr_str, line, col);
    }
}

/* ============ Exception Throwing ============ */

/* Forward declaration of vtables (defined in runtime.ll or will be linked) */
extern void *NullAccessError_vtable[];
extern void *StackOverflowError_vtable[];

__attribute__((noreturn))
void __bpl_throw_null_access(const char *func_name, const char *expr_str, int32_t line, int32_t col) {
    if (exception_top != NULL) {
        /* Throw structured exception */
        NullAccessError *err = (NullAccessError *)malloc(sizeof(NullAccessError));
        if (err) {
            err->vtable = NullAccessError_vtable;
            err->message = "Attempted to access member of nullptr";
            err->code = 7;
            err->stack_frames = capture_stack_frames(&err->stack_depth);
            err->function = func_name;
            err->expression = expr_str;
            err->line = line;
            err->column = col;
            
            exception_type = TYPE_ID_NULL_ACCESS_ERROR;
            exception_value = (int64_t)(uintptr_t)err;
            
            /* Unwind defers */
            __bpl_unwind_to_defer_node(exception_top->defer_top);
            
            longjmp(exception_top->buf, 1);
        }
    }
    
    /* No handler - print error and abort */
    fprintf(stderr, "\n%s╔══════════════════════════════════════════════╗%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s║            NULL POINTER ACCESS               ║%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s╚══════════════════════════════════════════════╝%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "\n%sAttempted to access member of nullptr%s\n", COLOR_YELLOW, COLOR_RESET);
    
    if (func_name) {
        fprintf(stderr, "Function: %s%s%s\n", COLOR_BOLD, func_name, COLOR_RESET);
    }
    if (expr_str) {
        fprintf(stderr, "Expression: %s%s%s\n", COLOR_BOLD, expr_str, COLOR_RESET);
    }
    if (line > 0) {
        fprintf(stderr, "Location: line %d, column %d\n", line, col);
    }
    
    print_bpl_stack_trace();
    print_stack_trace();
    
    fprintf(stderr, "\n");
    exit(1);
}

__attribute__((noreturn))
void __bpl_throw_stack_overflow(void) {
    if (exception_top != NULL) {
        StackOverflowError *err = (StackOverflowError *)malloc(sizeof(StackOverflowError));
        if (err) {
            err->vtable = StackOverflowError_vtable;
            err->message = "Stack overflow";
            err->code = 139;
            err->stack_frames = capture_stack_frames(&err->stack_depth);
            
            exception_type = TYPE_ID_STACK_OVERFLOW_ERROR;
            exception_value = (int64_t)(uintptr_t)err;
            
            __bpl_unwind_to_defer_node(exception_top->defer_top);
            
            longjmp(exception_top->buf, 1);
        }
    }
    
    fprintf(stderr, "\n%s╔══════════════════════════════════════════════╗%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s║              STACK OVERFLOW                  ║%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s╚══════════════════════════════════════════════╝%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "\n%sMaximum call stack depth (%d) exceeded%s\n", 
            COLOR_YELLOW, BPL_MAX_STACK_DEPTH, COLOR_RESET);
    
    print_bpl_stack_trace();
    print_stack_trace();
    
    fprintf(stderr, "\n");
    exit(139);
}

__attribute__((noreturn))
void __bpl_throw_division_by_zero(const char *func_name, int32_t line, int32_t col) {
    if (exception_top != NULL) {
        DivisionByZeroError *err = (DivisionByZeroError *)malloc(sizeof(DivisionByZeroError));
        if (err) {
            err->vtable = NullAccessError_vtable; /* Reuse vtable */
            err->message = "Division by zero";
            err->code = 1;
            err->stack_frames = capture_stack_frames(&err->stack_depth);
            
            exception_type = TYPE_ID_DIVISION_BY_ZERO_ERROR;
            exception_value = (int64_t)(uintptr_t)err;
            
            __bpl_unwind_to_defer_node(exception_top->defer_top);
            
            longjmp(exception_top->buf, 1);
        }
    }
    
    fprintf(stderr, "\n%s╔══════════════════════════════════════════════╗%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s║             DIVISION BY ZERO                 ║%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s╚══════════════════════════════════════════════╝%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "\n%sAttempted to divide by zero%s\n", COLOR_YELLOW, COLOR_RESET);
    
    if (func_name) {
        fprintf(stderr, "Function: %s%s%s\n", COLOR_BOLD, func_name, COLOR_RESET);
    }
    if (line > 0) {
        fprintf(stderr, "Location: line %d, column %d\n", line, col);
    }
    
    print_bpl_stack_trace();
    print_stack_trace();
    
    fprintf(stderr, "\n");
    exit(1);
}

__attribute__((noreturn))
void __bpl_throw_index_out_of_bounds(int32_t index, int32_t size, const char *func_name, int32_t line, int32_t col) {
    if (exception_top != NULL) {
        IndexOutOfBoundsError *err = (IndexOutOfBoundsError *)malloc(sizeof(IndexOutOfBoundsError));
        if (err) {
            err->vtable = NullAccessError_vtable; /* Reuse vtable */
            err->message = "Index out of bounds";
            err->code = 1;
            err->stack_frames = capture_stack_frames(&err->stack_depth);
            err->index = index;
            err->size = size;
            
            exception_type = TYPE_ID_INDEX_OUT_OF_BOUNDS;
            exception_value = (int64_t)(uintptr_t)err;
            
            __bpl_unwind_to_defer_node(exception_top->defer_top);
            
            longjmp(exception_top->buf, 1);
        }
    }
    
    fprintf(stderr, "\n%s╔══════════════════════════════════════════════╗%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s║           INDEX OUT OF BOUNDS                ║%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s╚══════════════════════════════════════════════╝%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "\n%sArray index %d is out of bounds for size %d%s\n", 
            COLOR_YELLOW, index, size, COLOR_RESET);
    
    if (func_name) {
        fprintf(stderr, "Function: %s%s%s\n", COLOR_BOLD, func_name, COLOR_RESET);
    }
    if (line > 0) {
        fprintf(stderr, "Location: line %d, column %d\n", line, col);
    }
    
    print_bpl_stack_trace();
    print_stack_trace();
    
    fprintf(stderr, "\n");
    exit(1);
}

/* ============ Panic Function ============ */

__attribute__((noreturn))
void __bpl_panic(const char *message) {
    fprintf(stderr, "\n%s╔══════════════════════════════════════════════╗%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s║                   PANIC                      ║%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "%s╚══════════════════════════════════════════════╝%s\n", COLOR_RED, COLOR_RESET);
    fprintf(stderr, "\n%s%s%s\n", COLOR_YELLOW, message ? message : "Unrecoverable error", COLOR_RESET);
    
    print_bpl_stack_trace();
    print_stack_trace();
    
    fprintf(stderr, "\n");
    abort();
}

/* ============ Assertion ============ */

void __bpl_assert(int condition, const char *message, const char *file, int32_t line) {
    if (!condition) {
        fprintf(stderr, "\n%s╔══════════════════════════════════════════════╗%s\n", COLOR_RED, COLOR_RESET);
        fprintf(stderr, "%s║            ASSERTION FAILED                  ║%s\n", COLOR_RED, COLOR_RESET);
        fprintf(stderr, "%s╚══════════════════════════════════════════════╝%s\n", COLOR_RED, COLOR_RESET);
        
        if (message) {
            fprintf(stderr, "\n%s%s%s\n", COLOR_YELLOW, message, COLOR_RESET);
        }
        if (file) {
            fprintf(stderr, "File: %s, Line: %d\n", file, line);
        }
        
        print_bpl_stack_trace();
        print_stack_trace();
        
        fprintf(stderr, "\n");
        abort();
    }
}
