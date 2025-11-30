#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="generics_demo.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=("123")

# Compile
compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "$ARGS" "$ENV_VARS" "${EXPECTED[@]}"
if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"

# Run edge cases test
SOURCE_FILE="edge_cases.x"
EXPECTED=("Nested: 111" "Array[0]: 222" "Pointer: 444" "Multi: 555, 66, 7777")
# Compile
compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "$ARGS" "$ENV_VARS" "${EXPECTED[@]}"
if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"

# Run memory layout test
SOURCE_FILE="memory_layout.x"
EXPECTED=("Test<u64, u8>:" "Address and value of t1: "
          "Address and value of t1.a: "
          "Address and value of t1.b: "
          "Test<u64, u8>:" "Address and value of t2: "
          "Address and value of t2.a: "
          "Address and value of t2.b: "
          "Test<u8, Packed<u64, u8>>:" "Address and value of t3: "
          "Address and value of t3.a: "
          "Address and value of t3.b.a: "
          "Address and value of t3.b.b: ")
# Compile
compile "$SOURCE_FILE"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run Test
EXE="${SOURCE_FILE%.x}"
assert_output "$EXE" "$INPUT" "$ARGS" "$ENV_VARS" "${EXPECTED[@]}"
if [ $? -ne 0 ]; then
    exit 1
fi

# Cleanup
rm -f "$EXE"

# Run nested generics test
SOURCE_FILE="nested_generics.x"
EXPECTED=""

# Compile
compile "$SOURCE_FILE" "-l"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run import/export test
SOURCE_FILE="import_export.x"
# Compile (library mode since no main)
compile "$SOURCE_FILE" "-l"
if [ $? -ne 0 ]; then
    exit 1
fi

# Run imported generics test (library compilation)
SOURCE_FILE="imported_generics.x"
compile "$SOURCE_FILE" "-l"
if [ $? -ne 0 ]; then
    exit 1
fi

rm -f *.o
rm -f *.asm