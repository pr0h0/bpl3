#!/bin/bash

# --- Configuration Defaults ---
# Default to dynamic linking (requires dynamic linker path)
LINK_MODE="dynamic"
QUIET_TRANSPILE=""
PRINT_ASM=""
DYNAMIC_LINKER="/lib64/ld-linux-x86-64.so.2"
SHOULD_RUN="false"
SHOULD_GDB="false"
SHOULD_CLEANUP_ASM="true"
SHOULD_CLEANUP_O="true"
SHOULD_CLEANUP_EXE="false"

# --- 1. Parse Command Line Arguments (Flags) ---

# Shift loop to handle flags before the main positional arguments
while :; do
    case "$1" in
        -s|--static)
            LINK_MODE="static"
            ;;
        -d|--dynamic)
            LINK_MODE="dynamic"
            ;;
        -q|--quiet)
            QUIET_TRANSPILE="> /dev/null"
            ;;
        -p|--print-asm)
            PRINT_ASM="true"
            SHOULD_CLEANUP_ASM="false"
            ;;
        -r|--run)
            SHOULD_RUN="true"
            ;;
        -g|--gdb)
            SHOULD_GDB="true"
            ;;
        -l|--lib)
            SHOULD_CLEANUP_O="false"
            SHOULD_CLEANUP_EXE="true"
            ;;
        --) # End of all options
            shift
            break
            ;;
        -?*) # Handle invalid options
            echo "Warning: Unknown option (ignored): $1" >&2
            ;;
        *) # End of flags
            break
    esac
    shift
done

# --- 2. Extract Files ---

# $1 should now be the source file (e.g., source.x)
SOURCE_FILE="$1"

if [ -z "$SOURCE_FILE" ]; then
    echo "Error: No source file provided."
    echo "Usage: ./compiler.sh [-s|-d] [-q] [-p] <source.x> [lib1.o lib2.o ...]"
    exit 1
fi

# Remove the source file from the arguments list, leaving only the libraries.
shift

# $@ now contains all the remaining object files and libraries to pass to ld.
LIBRARY_FILES="$@"

# Derived file names
fileName="${SOURCE_FILE%.*}" # e.g., source
outputFile="${fileName}" # e.g., source

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd -P )"

# --- 3. Transpile (.x -> .asm) ---

[ "$QUIET_TRANSPILE" == "" ] && echo "--- 1. Transpiling $SOURCE_FILE ---"
# We use eval to allow the QUIET_TRANSPILE variable to be applied dynamically
eval bun "$SCRIPT_DIR/index.ts" "$SOURCE_FILE" $QUIET_TRANSPILE
if [ $? -ne 0 ]; then
    echo "TypeScript transpilation failed. Exiting."
    exit 1
fi

# --- 4. Print Assembly (Optional) ---

if [ "$PRINT_ASM" == "true" ]; then
    [ "$QUIET_TRANSPILE" == "" ] && echo "--- 2. Generated Assembly: ${fileName}.asm ---"
    cat "${fileName}.asm"
    [ "$QUIET_TRANSPILE" == "" ] && echo "-----------------------------------"
else
    [ "$QUIET_TRANSPILE" == "" ] && echo "--- 2. Skipping assembly printout ---"
fi

# --- 5. Assemble (.asm -> .o) ---

[ "$QUIET_TRANSPILE" == "" ] && echo "--- 3. Assembling ${fileName}.asm ---"
eval nasm -f elf64 "${fileName}.asm" "$QUIET_TRANSPILE"
if [ $? -ne 0 ]; then
    echo "Assembly failed. Exiting."
    exit 1
fi

# --- 6. Link (.o + libs -> executable) ---

[ "$QUIET_TRANSPILE" == "" ] && echo "--- 4. Linking to create executable: ${outputFile} (Mode: $LINK_MODE) ---"

# Start the linker command with the main object file
LD_COMMAND="ld ${fileName}.o ${LIBRARY_FILES} -o ${outputFile} -lc"

if [ "$LINK_MODE" == "static" ]; then
    # For static linking, we change the first flag and remove the dynamic linker path
    LD_COMMAND="ld -static ${fileName}.o ${LIBRARY_FILES} -o ${outputFile}"
else
    # For dynamic linking, we must include the dynamic linker path
    LD_COMMAND="${LD_COMMAND} --dynamic-linker ${DYNAMIC_LINKER}"
fi

# Execute the final linker command
[ "$QUIET_TRANSPILE" == "" ] && echo "Executing: $LD_COMMAND"
eval $LD_COMMAND "$QUIET_TRANSPILE"

if [ $? -ne 0 ]; then
    echo "Linking failed. Exiting."
    exit 1
fi

# --- 7. Cleanup Intermediate Files ---
if [ "$SHOULD_CLEANUP_ASM" == "true" ]; then
    [ "$QUIET_TRANSPILE" == "" ] && echo "--- Cleaning up assembly file ---"
    rm -f "${fileName}.asm"
fi

if [ "$SHOULD_CLEANUP_O" == "true" ]; then
    [ "$QUIET_TRANSPILE" == "" ] && echo "--- Cleaning up object file ---"
    rm -f "${fileName}.o"
fi

if [ "$SHOULD_CLEANUP_EXE" == "true" ]; then
    [ "$QUIET_TRANSPILE" == "" ] && echo "--- Cleaning up executable file ---"
    rm -f "./${outputFile}"
    exit 0;
fi


# --- 8. Run Executable ---

if [ "$SHOULD_RUN" == "false" ] && [ "$SHOULD_GDB" == "false" ]; then
    exit 0;
fi

[ "$QUIET_TRANSPILE" == "" ] && echo "--- 5. Running ${outputFile} ---"
if [ "$SHOULD_GDB" == "true" ]; then
    gdb -q ./${outputFile};
else
    [ "$QUIET_TRANSPILE" == "" ] && echo "-----------------------------------";
    ./${outputFile}; 
    EXIT_CODE="$?";
    [ "$QUIET_TRANSPILE" == "" ] && echo "-----------------------------------";

    [ "$QUIET_TRANSPILE" == "" ] && echo "Program exited with code: $EXIT_CODE";
fi
