#!/bin/bash
source ../test_utils.sh

# Configuration
SOURCE_FILE="float_demo.x"
INPUT=""
ARGS=""
ENV_VARS=""
EXPECTED=(
"--- Basic Operations ---"
"f64 mul: 6.280000, div: 1.570000"
"f32 add: 4.000000, sub: 1.000000"
""
"--- Function Calls ---"
"add_f64(10.5, 20.5): 31.000000"
""
"--- Arrays ---"
"Array: [1.100000, 2.200000, 3.300000]"
""
"--- Structs ---"
"Point(5.000000, 10.000000)"
"Vector3: (1.000000, 2.000000, 3.000000)"
""
"--- Complex Calculation ---"
"Point distance squared: 125.000000"
"--- Arithmetic & Assignments ---"
"10.0 += 5.0 -> 15.000000"
"15.0 -= 2.5 -> 12.500000"
"12.5 *= 2.0 -> 25.000000"
"25.0 /= 5.0 -> 5.000000"
""
"--- Mixed Types ---"
"2.5 + 10 = 12.500000"
"10 + 2.5 = 12.500000"
"1.5 (f32) + 2.5 (f64) = 4.000000"
""
"--- Comparisons ---"
"10.5 == 10.5: true"
"10.5 != 20.0: true"
"10.5 < 20.0: true"
"20.0 > 10.5: true"
""
"--- Many Arguments (Registers) ---"
"Sum: 36.000000"
""
"--- Negative Numbers ---"
"Negative: -5.500000"
"Abs val check: is negative"
""
"--- Edge Cases ---"
"0.0: 0.000000, -0.0: 0.000000"
"1.0 / 0.0 = inf"
"0.0 / 0.0 = -nan"
"0.1 + 0.2 = 0.30000000000000004"
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
