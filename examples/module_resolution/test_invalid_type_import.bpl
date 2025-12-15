# test_invalid_type_import.bpl - This should fail to parse  
# ERROR: Cannot import multiple types in one bracket

import [TestType1,TestType2] from "./test_syntax.bpl";  # ❌ Not allowed

extern printf(fmt: string, ...) ret int;

frame main() ret int {
  printf("This should not compile\n");
  return 0;
}
