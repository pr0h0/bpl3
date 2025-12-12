enum ExpressionType {
  NumberLiteralExpr = "NumberLiteralExpr",
  StringLiteralExpr = "StringLiteralExpr",
  NullLiteralExpr = "NullLiteralExpr",
  ArrayLiteralExpr = "ArrayLiteralExpr",
  StructLiteralExpr = "StructLiteralExpr",
  TupleLiteralExpr = "TupleLiteralExpr",

  IdentifierExpr = "IdentifierExpr",
  BlockExpression = "BlockExpression",

  VariableDeclaration = "VariableDeclaration",
  DestructuringDeclaration = "DestructuringDeclaration",
  DestructuringAssignment = "DestructuringAssignment",

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
  DeferExpression = "DeferExpression",

  FunctionDeclaration = "FunctionDeclaration",
  FunctionCall = "FunctionCall",
  MethodCallExpr = "MethodCallExpr",
  ReturnExpression = "ReturnExpression",

  CastExpression = "CastExpression",

  AsmBlockExpression = "AsmBlockExpression",
  ImportExpression = "ImportExpression",
  ExportExpression = "ExportExpression",
  ExternDeclaration = "ExternDeclaration",
  SizeOfExpression = "SizeOfExpression",

  TryExpression = "TryExpression",
  ThrowExpression = "ThrowExpression",

  Program = "Program",
  EOF = "EOF",
}

export default ExpressionType;
