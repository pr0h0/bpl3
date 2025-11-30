enum ExpressionType {
  NumberLiteralExpr = "NumberLiteralExpr",
  StringLiteralExpr = "StringLiteralExpr",
  NullLiteralExpr = "NullLiteralExpr",
  ArrayLiteralExpr = "ArrayLiteralExpr",

  IdentifierExpr = "IdentifierExpr",
  BlockExpression = "BlockExpression",

  VariableDeclaration = "VariableDeclaration",

  BinaryExpression = "BinaryExpression",
  UnaryExpression = "UnaryExpression",

  StructureDeclaration = "StructureDeclaration",
  MemberAccessExpression = "MemberAccessExpression",

  IfExpression = "IfExpression",
  SwitchExpression = "SwitchExpression",
  TernaryExpression = "TernaryExpression",

  LoopExpression = "LoopExpression",
  BreakExpression = "BreakExpression",
  ContinueExpression = "ContinueExpression",

  FunctionDeclaration = "FunctionDeclaration",
  FunctionCall = "FunctionCall",
  ReturnExpression = "ReturnExpression",

  AsmBlockExpression = "AsmBlockExpression",
  ImportExpression = "ImportExpression",
  ExportExpression = "ExportExpression",
  ExternDeclaration = "ExternDeclaration",

  Program = "Program",
  EOF = "EOF",
}

export default ExpressionType;
