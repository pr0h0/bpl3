import * as AST from "../../common/AST";
import { CompilerError } from "../../common/CompilerError";

export interface FunctionAttributeValidationContext {
  addError(error: CompilerError): void;
  resolveType(type: AST.TypeNode): AST.TypeNode;
}

export interface FunctionAttributeValidationOptions {
  parentType?: AST.StructDecl | AST.EnumDecl;
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
  "auto_destroy",
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
  options: FunctionAttributeValidationOptions = {},
): void {
  const attributes = decl.attributes ?? [];
  const seen = new Set<string>();

  for (const attr of attributes) {
    if (!ALLOWED_FUNCTION_ATTRIBUTES.has(attr.name)) {
      context.addError(
        new CompilerError(
          `Unknown function attribute '${attr.name}'`,
          "Only compiler-known function attributes are supported.",
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

  if (seen.has("auto_destroy")) {
    validateAutoDestroyAttribute(context, decl, options.parentType);
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

function isVoidType(type: AST.TypeNode): boolean {
  return (
    type.kind === "BasicType" &&
    type.name === "void" &&
    type.pointerDepth === 0
  );
}

function validateAutoDestroyAttribute(
  context: FunctionAttributeValidationContext,
  decl: AST.FunctionDecl,
  parentType?: AST.StructDecl | AST.EnumDecl,
): void {
  if (!parentType) {
    context.addError(
      new CompilerError(
        "Function attribute 'auto_destroy' is only valid on destroy methods",
        "Move the attribute to a struct or enum method named 'destroy'.",
        decl.location,
      ),
    );
    return;
  }

  if (decl.name !== "destroy") {
    context.addError(
      new CompilerError(
        "Function attribute 'auto_destroy' requires method name 'destroy'",
        "Rename the method to 'destroy' or remove the auto_destroy attribute.",
        decl.location,
      ),
    );
  }

  const thisParam = decl.params[0];
  if (!thisParam || thisParam.name !== "this") {
    context.addError(
      new CompilerError(
        "Function attribute 'auto_destroy' requires first parameter named 'this'",
        `Use 'this: *${parentType.name}' as the first parameter.`,
        thisParam?.location ?? decl.location,
      ),
    );
  }

  if (thisParam) {
    const thisType = context.resolveType(thisParam.type);
    if (
      thisType.kind !== "BasicType" ||
      thisType.name !== parentType.name ||
      thisType.pointerDepth !== 1 ||
      thisType.arrayDimensions.length !== 0
    ) {
      context.addError(
        new CompilerError(
          `Function attribute 'auto_destroy' requires receiver type '*${parentType.name}'`,
          `Change the first parameter to 'this: *${parentType.name}'.`,
          thisParam.location,
        ),
      );
    }
  }

  const returnType = context.resolveType(decl.returnType);
  if (!isVoidType(returnType)) {
    context.addError(
      new CompilerError(
        "Function attribute 'auto_destroy' requires a void return type",
        "Use 'ret void' or remove the auto_destroy attribute.",
        decl.location,
      ),
    );
  }
}
