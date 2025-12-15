# test_invalid_type_export.bpl - This should fail to parse
# ERROR: Cannot export multiple types in one bracket

export [Type1, Type2];  # ❌ Not allowed

struct Type1 {
  x: int,
}

struct Type2 {
  y: int,
}
