import type * as AST from "./AST";
import { createHash } from "node:crypto";
import { CompilerError } from "./CompilerError";
import { getPrimitiveType } from "./PrimitiveTypes";
import { validateExternAbiType } from "../middleend/validators/ExternAbiValidator";

export const C_EXPORT_UNSUPPORTED_CODE = "BPL_C_EXPORT_UNSUPPORTED";
export const C_EXPORT_CONFLICT_CODE = "BPL_C_EXPORT_CONFLICT";

export function validateCExport(
  decl: AST.FunctionDecl,
  resolve: (type: AST.TypeNode) => AST.TypeNode,
  parentType?: AST.StructDecl | AST.EnumDecl,
): void {
  if (
    parentType ||
    decl.genericParams.length ||
    decl.name === "main" ||
    decl.name.startsWith("__bpl_") ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(decl.name)
  ) {
    throw new CompilerError(
      "Invalid C export declaration",
      "Use c_export on a non-generic free function with a non-reserved C identifier, other than main.",
      decl.location,
      C_EXPORT_UNSUPPORTED_CODE,
    );
  }
  for (const type of [
    ...decl.params.map((parameter) => parameter.type),
    decl.returnType,
  ]) {
    try {
      validateExternAbiType(resolve(type), decl.location);
    } catch (error) {
      if (!(error instanceof CompilerError)) throw error;
      throw new CompilerError(
        "Unsupported C export signature",
        "C exports accept scalar values, raw pointers, and scalar/pointer Func callbacks. Pass aggregates through pointers, not by value.",
        decl.location,
        C_EXPORT_UNSUPPORTED_CODE,
      );
    }
  }
  // Preserve the public name when module-local implementation names are uniqued.
  decl.cExportName ??= decl.name;
}

export function getCExportFunctions(program: AST.Program): AST.FunctionDecl[] {
  return program.statements.filter(
    (statement): statement is AST.FunctionDecl =>
      statement.kind === "FunctionDecl" &&
      Boolean((statement as AST.FunctionDecl).cExportName),
  );
}

/** Resolve aliases for header spelling without depending on a live checker scope. */
function resolveAlias(type: AST.TypeNode): AST.TypeNode {
  if (
    type.kind !== "BasicType" ||
    type.resolvedDeclaration?.kind !== "TypeAlias"
  )
    return type;
  const base = resolveAlias(type.resolvedDeclaration.type);
  if (base.kind !== "BasicType") return base;
  return {
    ...base,
    pointerDepth: base.pointerDepth + type.pointerDepth,
    arrayDimensions: [...type.arrayDimensions, ...base.arrayDimensions],
  };
}

type HandleTypeKey = string | number | boolean | null | HandleTypeKey[];

/** A location-independent type identity, preserving pointer/array nesting. */
function handleArgumentKey(input: AST.TypeNode): HandleTypeKey {
  const type = resolveAlias(input);
  const wrap = (
    base: HandleTypeKey,
    pointers: number,
    dimensions: (number | null)[],
  ) => {
    for (let i = 0; i < pointers; i++) base = ["pointer", base];
    for (const size of [...dimensions].reverse()) base = ["array", size, base];
    return base;
  };
  if (type.kind === "BasicType") {
    if (type.aliasTarget?.kind === "BasicType") {
      const target = type.aliasTarget;
      return wrap(
        handleArgumentKey(target),
        type.pointerDepth - target.pointerDepth,
        type.arrayDimensions.slice(
          0,
          type.arrayDimensions.length - target.arrayDimensions.length,
        ),
      );
    }
    if (type.isPointerToArray && type.pointerDepth > 0)
      return wrap(
        handleArgumentKey({
          ...type,
          pointerDepth: type.pointerDepth - 1,
          isPointerToArray: false,
        }),
        1,
        [],
      );
    const base: HandleTypeKey =
      type.name === "string"
        ? wrap(["i8", []], 1, [])
        : [
            getPrimitiveType(type.name)?.canonicalName ?? type.name,
            type.genericArgs.map(handleArgumentKey),
          ];
    return wrap(base, type.pointerDepth, type.arrayDimensions);
  }
  if (type.kind === "MetaType")
    return [type.kind, handleArgumentKey(type.type)];
  const base: HandleTypeKey =
    type.kind === "TupleType"
      ? [type.kind, type.types.map(handleArgumentKey)]
      : [
          type.kind,
          handleArgumentKey(type.returnType),
          type.paramTypes.map(handleArgumentKey),
          Boolean(type.isVariadic),
        ];
  return wrap(base, 0, type.arrayDimensions ?? []);
}

/** Deliberately emits opaque struct handles: layout remains caller-defined. */
export function generateCExportHeader(program: AST.Program): string {
  const handles = new Map<string, string>();
  const keywords = new Set(
    `auto break case char const continue default do double else enum extern
     float for goto if inline int long register restrict return short signed
     sizeof static struct switch typedef union unsigned void volatile while
     _Alignas _Alignof _Atomic _BitInt _Bool _Complex _Decimal32 _Decimal64
     _Decimal128 _Generic _Imaginary _Noreturn _Static_assert _Thread_local
     alignas alignof bool constexpr false nullptr static_assert thread_local
     true typeof typeof_unqual
     and and_eq asm bitand bitor catch char8_t char16_t char32_t class compl
     concept const_cast consteval constinit co_await co_return co_yield decltype
     delete dynamic_cast explicit export friend mutable namespace new noexcept
     not not_eq operator or or_eq private protected public reinterpret_cast
     requires static_cast template this throw try typeid typename using virtual
     wchar_t xor xor_eq`.split(/\s+/),
  );
  // These headers share the ordinary identifier/macro namespace with functions.
  const standardNames = new Set([
    "PTRDIFF_MIN",
    "PTRDIFF_MAX",
    "PTRDIFF_WIDTH",
    "SIZE_MAX",
    "SIZE_WIDTH",
    "SIG_ATOMIC_MIN",
    "SIG_ATOMIC_MAX",
    "SIG_ATOMIC_WIDTH",
    "WCHAR_MIN",
    "WCHAR_MAX",
    "WCHAR_WIDTH",
    "WINT_MIN",
    "WINT_MAX",
    "WINT_WIDTH",
    "__bool_true_false_are_defined",
  ]);
  function identifier(name: string): string {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      keywords.has(name) ||
      standardNames.has(name) ||
      /^(?:u?int(?:_least|_fast)?(?:8|16|32|64)|u?intptr|u?intmax)_t$/.test(
        name,
      ) ||
      /^U?INT(?:8|16|32|64|MAX|PTR|_(?:LEAST|FAST)(?:8|16|32|64))_(?:MIN|MAX|C|WIDTH)$/.test(
        name,
      )
    )
      throw new Error(`Cannot represent '${name}' in a C/C++ header`);
    return name;
  }
  function declaration(input: AST.TypeNode, name: string): string {
    const type = resolveAlias(input);
    if (type.kind === "BasicType") {
      if (type.aliasTarget?.kind === "BasicType") {
        const target = type.aliasTarget;
        const depth = type.pointerDepth - target.pointerDepth;
        const dimensions = type.arrayDimensions.slice(
          0,
          type.arrayDimensions.length - target.arrayDimensions.length,
        );
        if (depth < 0 || dimensions.some((size) => size === null))
          throw new Error(
            "C header generation cannot describe this alias; use a raw pointer and length",
          );
        const outer = `${name}${dimensions.map((size) => `[${size}]`).join("")}`;
        return declaration(
          target,
          depth ? `(${"*".repeat(depth)}${outer})` : outer,
        );
      }
      if (type.isPointerToArray && type.pointerDepth > 0)
        return declaration(
          {
            ...type,
            pointerDepth: type.pointerDepth - 1,
            isPointerToArray: false,
          },
          `(*${name})`,
        );
      if (type.arrayDimensions.length) {
        if (type.arrayDimensions.some((size) => size === null))
          throw new Error(
            "C header generation cannot describe BPL slice storage; use a raw pointer and length",
          );
        return declaration(
          {
            ...type,
            arrayDimensions: [],
            aliasDeclaration: undefined,
            aliasTarget: undefined,
          },
          `${name}${type.arrayDimensions.map((size) => `[${size}]`).join("")}`,
        );
      }
    }
    if (type.kind === "FunctionType") {
      const parameters =
        type.paramTypes
          .map((parameter, index) => declaration(parameter, `p${index}`))
          .join(", ") || "void";
      return declaration(type.returnType, `(*${name})(${parameters})`);
    }
    if (
      type.kind !== "BasicType" ||
      type.arrayDimensions.length ||
      type.isPointerToArray
    )
      throw new Error(
        "C header generation does not support this type; use a raw pointer or scalar",
      );
    const primitive = getPrimitiveType(type.name);
    let base: string;
    if (primitive) {
      if (primitive.kind === "boolean") base = "bool";
      else if (primitive.kind === "float")
        base = primitive.bits === 32 ? "float" : "double";
      else base = `${primitive.signed ? "int" : "uint"}${primitive.bits}_t`;
    } else if (type.name === "void") base = "void";
    else if (type.name === "string") base = "char *";
    else if (type.pointerDepth > 0) {
      const identity = JSON.stringify([
        type.name,
        type.genericArgs.map(handleArgumentKey),
      ]);
      const suffix = type.genericArgs.length
        ? `_${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`
        : "";
      const handle = identifier(`bpl_${type.name}${suffix}`);
      if (handles.has(handle) && handles.get(handle) !== identity)
        throw new Error(`Conflicting opaque C handle '${handle}'`);
      handles.set(handle, identity);
      base = `struct ${handle}`;
    } else throw new Error(`Unsupported C header type '${type.name}'`);
    return `${base} ${"*".repeat(type.pointerDepth)}${name}`;
  }
  const prototypes = getCExportFunctions(program).map((decl) => {
    const signature = decl.resolvedType;
    if (signature?.kind !== "FunctionType")
      throw new Error("Missing C export function signature");
    const parameters =
      signature.paramTypes
        .map((type, index) => declaration(type, `p${index}`))
        .join(", ") || "void";
    return (
      declaration(
        signature.returnType,
        `${identifier(decl.cExportName!)}(${parameters})`,
      ) + ";"
    );
  });
  return [
    "/* Generated BPL C exports. Opaque struct pointers do not describe layout. */",
    "#pragma once",
    "#include <stdint.h>",
    "#include <stdbool.h>",
    "#ifdef __cplusplus",
    'extern "C" {',
    "#endif",
    ...[...handles.keys()].sort().map((handle) => `struct ${handle};`),
    ...prototypes,
    "#ifdef __cplusplus",
    "}",
    "#endif",
    "",
  ].join("\n");
}
