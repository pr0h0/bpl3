# test_invalid_export.bpl - This should fail to parse
# ERROR: Cannot export multiple items in one statement

export func1, func2;  # ❌ Not allowed

frame func1() ret int {
  return 1;
}

frame func2() ret int {
  return 2;
}
