export enum TokenType {
  // Literals
  Identifier = "Identifier",
  StringLiteral = "StringLiteral",
  CharLiteral = "CharLiteral",
  NumberLiteral = "NumberLiteral",

  // Keywords
  Global = "Global",
  Local = "Local",
  Const = "Const",
  Type = "Type",
  Frame = "Frame",
  Static = "Static",
  Ret = "Ret",
  Struct = "Struct",
  Import = "Import",
  From = "From",
  Export = "Export",
  Extern = "Extern",
  Asm = "Asm",
  Loop = "Loop",
  If = "If",
  Else = "Else",
  Break = "Break",
  Continue = "Continue",
  Try = "Try",
  Catch = "Catch",
  CatchOther = "CatchOther",
  Return = "Return",
  Throw = "Throw",
  Switch = "Switch",
  Case = "Case",
  Default = "Default",
  Cast = "Cast",
  Sizeof = "Sizeof",
  Match = "Match",
  Func = "Func",
  Null = "Null",
  Nullptr = "Nullptr",
  True = "True",
  False = "False",

  // Comments
  Comment = "Comment",

  // Symbols
  LeftBrace = "LeftBrace", // {
  RightBrace = "RightBrace", // }
  LeftParen = "LeftParen", // (
  RightParen = "RightParen", // )
  LeftBracket = "LeftBracket", // [
  RightBracket = "RightBracket", // ]
  Comma = "Comma", // ,
  Colon = "Colon", // :
  Semicolon = "Semicolon", // ;
  Dot = "Dot", // .
  Ellipsis = "Ellipsis", // ...
  Question = "Question", // ?

  // Operators
  Equal = "Equal", // =
  PlusEqual = "PlusEqual", // +=
  MinusEqual = "MinusEqual", // -=
  StarEqual = "StarEqual", // *=
  SlashEqual = "SlashEqual", // /=
  PercentEqual = "PercentEqual", // %=
  AmpersandEqual = "AmpersandEqual", // &=
  PipeEqual = "PipeEqual", // |=
  CaretEqual = "CaretEqual", // ^=

  OrOr = "OrOr", // ||
  AndAnd = "AndAnd", // &&
  Pipe = "Pipe", // |
  Caret = "Caret", // ^
  Ampersand = "Ampersand", // &

  EqualEqual = "EqualEqual", // ==
  BangEqual = "BangEqual", // !=
  Less = "Less", // <
  LessEqual = "LessEqual", // <=
  Greater = "Greater", // >
  GreaterEqual = "GreaterEqual", // >=

  LessLess = "LessLess", // <<
  GreaterGreater = "GreaterGreater", // >>

  Plus = "Plus", // +
  Minus = "Minus", // -
  Star = "Star", // *
  Slash = "Slash", // /
  Percent = "Percent", // %

  Bang = "Bang", // !
  Tilde = "Tilde", // ~
  PlusPlus = "PlusPlus", // ++
  MinusMinus = "MinusMinus", // --

  // Special
  EOF = "EOF",
  Unknown = "Unknown",
}
