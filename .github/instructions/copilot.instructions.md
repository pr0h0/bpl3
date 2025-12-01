---
applyTo: '**/*.x, **/*.sh'
---
if you get stuck with files, run pwd to figure out your current directory and adjust paths accordingly.
when creating tests for examples, use test_example.sh as a reference implementation.
functions are declared with the "frame" keyword.
use "call" to invoke functions.
use "import" and "export" for module imports/exports.
use "extern" to update signatures of external functions from libc or .o files.
use "local" to declare local variables within functions.
use "loop" for infinite loops, and "break" to exit loops.
use "if" statements for conditional branching.
use "//" for integer division to avoid undefined behavior.
use comments to clarify code intent where necessary. "#" is used for comments in .x files.
use "return" to exit functions early.
use proper indentation for code blocks within functions, loops, and conditionals.
use "call printf("%s", s)" for printing output to the console.
use "import printf from 'libc'" to import the printf function for output.
when writing shell scripts, use "#!/bin/bash" at the top of the file.
when testing something use ./tests.sh
also when want to run one test use ./tests.sh example_dir_name  eg ./tests.sh fib
to run llvm tests use --llvm flag right after script name eg ./tests.sh --llvm or ./tests.sh --llvm fib
to run some source file use bun index.ts example/fib/fib.x, use --llvm flag to run llvm code, use -r to run the cod
check README.md for other flags