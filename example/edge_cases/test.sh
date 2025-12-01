#!/bin/bash
source ../test_utils.sh



# Test Bitwise
echo "Testing bitwise.x..."
compile "bitwise.x"

if [ $? -ne 0 ]; then
    exit 1;
fi

EXE="bitwise"
EXPECTED_BITWISE=(
    "--- Bitwise u64 ---"
    "AND: deadbeefcafebabe & ffffffff = cafebabe"
    "OR: deadbeefcafebabe | ffffffff = deadbeefffffffff"
    "XOR: deadbeefcafebabe ^ ffffffff = deadbeef35014541"
    "NOT: ~ffffffff = ffffffff00000000"
    "SHL: 1 << 4 = 16"
    "SHR: 16 >> 2 = 4"
    "--- Bitwise u32 ---"
    "AND: aabbccdd & ffff = ccdd"
    "NOT: ~aabbccdd = 55443322"
    "--- Bitwise u8 ---"
    "AND: aa & f = a"
    "OR: aa | f = af"
)
assert_output "$EXE" "" "" "" "${EXPECTED_BITWISE[@]}"

if [ $? -ne 0 ]; then
    exit 1;
fi

# Cleanup
rm -f "$EXE"
rm -f *.o
rm -f *.asm
rm -f *.ll

# Test Casting
echo "Testing casting.x..."
compile "casting.x"
if [ $? -ne 0 ]; then exit 1; fi
EXE="casting"
EXPECTED_CASTING=(
    "--- Casting Tests ---"
    "f64 to u64: 123.456000 -> 123"
    "u64 to f64: 987 -> 987.000000"
    "f32 to f64: 3.140000 -> 3.140000"
    "f64 to f32: 6.280000 -> 6.280000"
    "u64 to u8 (trunc): 1234567890abcdef -> ef"
)
assert_output "$EXE" "" "" "" "${EXPECTED_CASTING[@]}"
if [ $? -ne 0 ]; then
    exit 1;
fi

# Cleanup
rm -f "$EXE"
rm -f *.o
rm -f *.asm
rm -f *.ll

# Test Control Flow
echo "Testing control_flow.x..."
compile "control_flow.x"
if [ $? -ne 0 ]; then exit 1; fi
EXE="control_flow"
EXPECTED_CONTROL=(
    "--- Control Flow ---"
    "Outer loop i=0"
    "  Inner loop j=0"
    "  Inner loop j=2"
    "Outer loop i=1"
    "  Inner loop j=0"
    "  Inner loop j=2"
    "Outer loop i=2"
    "  Inner loop j=0"
    "  Inner loop j=2"
)
assert_output "$EXE" "" "" "" "${EXPECTED_CONTROL[@]}"
if [ $? -ne 0 ]; then
    exit 1;
fi

# Cleanup
rm -f "$EXE"
rm -f *.o
rm -f *.asm
rm -f *.ll
