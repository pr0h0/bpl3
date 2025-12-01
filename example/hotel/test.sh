#!/bin/bash
source ../test_utils.sh



# Configuration
SOURCE_FILE="hotel.x"
INPUT="2 alice pass123 1 alice pass123 1 101 3 2 3 1 5 2 4 3"
ARGS=""
ENV_VARS=""
EXPECTED=(
    "User registered successfully"
    "Login successful! Welcome, alice."
    "Reservation created successfully"
    "Room Number: 101"
    "Nights: 3"
    "Reservation updated"
    "Nights: 5"
    "Logged out"
    "Goodbye"
)

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
rm -f *.o
rm -f *.asm
rm -f *.ll