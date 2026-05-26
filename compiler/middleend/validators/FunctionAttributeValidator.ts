import * as AST from "../../common/AST";
import { CompilerError } from "../../common/CompilerError";

export interface FunctionAttributeValidationContext {
  addError(error: CompilerError): void;
  resolveType(type: AST.TypeNode): AST.TypeNode;
}

const ALLOWED_FUNCTION_ATTRIBUTES = new Set([
  "inline",
  "always_inline",
  "noinline",
  "cold",
  "hot",
  "noreturn",
  "nounwind",
  "optnone",
  "optsize",
  "minsize",
]);

const FUNCTION_ATTRIBUTE_CONFLICT_GROUPS = [
  ["inline", "always_inline", "noinline"],
  ["hot", "cold"],
  ["optsize", "minsize"],
  ["optnone", "inline"],
  ["optnone", "always_inline"],
  ["optnone", "optsize"],
  ["optnone", "minsize"],
];

export function validateFunctionAttributes(
  context: FunctionAttributeValidationContext,
  decl: AST.FunctionDecl,
): void {
  const attributes = decl.attributes ?? [];
  const seen = new Set<string>();

  for (const attr of attributes) {
    if (!ALLOWED_FUNCTION_ATTRIBUTES.has(attr.name)) {
      context.addError(
        new CompilerError(
          `Unknown function attribute '${attr.name}'`,
          "Only compiler-known LLVM function attributes are supported.",
          attr.location,
        ),
      );
      continue;
    }

    if (seen.has(attr.name)) {
      context.addError(
        new CompilerError(
          `Duplicate function attribute '${attr.name}'`,
          "Remove the duplicate attribute.",
          attr.location,
        ),
      );
    }

    seen.add(attr.name);
  }

  for (const group of FUNCTION_ATTRIBUTE_CONFLICT_GROUPS) {
    const present = group.filter((name) => seen.has(name));
    if (present.length > 1) {
      context.addError(
        new CompilerError(
          `Conflicting function attributes: ${present.join(", ")}`,
          "Remove one of the conflicting attributes.",
          decl.location,
        ),
      );
    }
  }

  if (!seen.has("noreturn")) return;

  const returnType = context.resolveType(decl.returnType);
  if (
    returnType.kind !== "BasicType" ||
    returnType.name !== "void" ||
    returnType.pointerDepth !== 0
  ) {
    context.addError(
      new CompilerError(
        "Function attribute 'noreturn' requires a void return type",
        "Use 'ret void' or remove the noreturn attribute.",
        decl.location,
      ),
    );
  }
}
