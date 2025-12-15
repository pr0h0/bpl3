TEST_FILES=$(find examples -name "test.sh" 2>/dev/null)

for test_file in $TEST_FILES; do
    echo "Running test: $test_file"
    bash "$test_file"
done