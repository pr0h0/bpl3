export enum IROpcode {
  ADD,
  SUB,
  MUL,
  DIV,
  MOD,
  AND,
  OR,
  XOR,
  SHL,
  SHR,
  EQ,
  NE,
  LT,
  GT,
  LE,
  GE,

  ALLOCA,
  LOAD,
  STORE,
  GET_ELEMENT_PTR,

  BR,
  COND_BR,
  RET,
  CALL,
  SWITCH,
  INLINE_ASM,

  PHI, // Optional for now

  // Float Ops
  FADD,
  FSUB,
  FMUL,
  FDIV,
  FMOD,
  FOEQ,
  FONE,
  FOLT,
  FOGT,
  FOLE,
  FOGE,

  // Casts
  SEXT,
  ZEXT,
  TRUNC,
  BITCAST,
  FP_TO_SI,
  FP_TO_UI,
  SI_TO_FP,
  UI_TO_FP,
  FP_EXT,
  FP_TRUNC,
  PTR_TO_INT,
  INT_TO_PTR,

  MOV, // Simple move/copy
}
