/**
 * Standard-library types offered by the "Import X from std" quick fix. Each
 * must be exported by `lib/std.bpl`, or the inserted import is rejected.
 */
export const STD_QUICK_IMPORT_TYPES: readonly string[] = [
  "Result",
  "Option",
  "Array",
  "Map",
  "Set",
  "Vec2",
  "Vec3",
  "Stack",
  "Queue",
];
