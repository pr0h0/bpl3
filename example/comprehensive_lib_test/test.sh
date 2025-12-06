#!/bin/bash
source ../test_utils.sh

# Test Array
echo "Testing Array..."
compile "test_array.x"
if [ $? -ne 0 ]; then exit 1; fi
./test_array
if [ $? -ne 0 ]; then echo "Array Test Failed"; exit 1; fi
rm test_array

# Test String
echo "Testing String..."
compile "test_string.x"
if [ $? -ne 0 ]; then exit 1; fi
./test_string
if [ $? -ne 0 ]; then echo "String Test Failed"; exit 1; fi
rm test_string

# Test Map
echo "Testing Map..."
compile "test_map.x"
if [ $? -ne 0 ]; then exit 1; fi
./test_map
if [ $? -ne 0 ]; then echo "Map Test Failed"; exit 1; fi
rm test_map

# Test Set
echo "Testing Set..."
compile "test_set.x"
if [ $? -ne 0 ]; then exit 1; fi
./test_set
if [ $? -ne 0 ]; then echo "Set Test Failed"; exit 1; fi
rm test_set

echo "All tests passed!"
