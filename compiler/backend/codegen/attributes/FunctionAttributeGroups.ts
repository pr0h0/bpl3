import * as AST from "../../../common/AST";

const FRAME_POINTER_ATTRIBUTE = `"frame-pointer"="all"`;

const LLVM_FUNCTION_ATTRIBUTE_MAP = new Map([
  ["inline", "inlinehint"],
  ["always_inline", "alwaysinline"],
  ["noinline", "noinline"],
  ["cold", "cold"],
  ["hot", "hot"],
  ["noreturn", "noreturn"],
  ["nounwind", "nounwind"],
  ["optnone", "optnone"],
  ["optsize", "optsize"],
  ["minsize", "minsize"],
]);

export class FunctionAttributeGroups {
  private groupIds: Map<string, number> = new Map();
  private groups: Map<number, string[]> = new Map();

  reset(): void {
    this.groupIds.clear();
    this.groups.clear();
    this.register([FRAME_POINTER_ATTRIBUTE]);
  }

  getFunctionGroupId(decl: AST.FunctionDecl): number {
    return this.register(this.getLlvmFunctionAttributes(decl));
  }

  render(): string {
    return Array.from(this.groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([id, attrs]) => `attributes #${id} = { ${attrs.join(" ")} }`)
      .join("\n");
  }

  private register(attrs: string[]): number {
    const key = attrs.join("\0");
    const existing = this.groupIds.get(key);
    if (existing !== undefined) return existing;

    const id = this.groupIds.size;
    this.groupIds.set(key, id);
    this.groups.set(id, attrs);
    return id;
  }

  private getLlvmFunctionAttributes(decl: AST.FunctionDecl): string[] {
    const attrs = Array.from(
      new Set(
        (decl.attributes ?? [])
          .map((attr) => LLVM_FUNCTION_ATTRIBUTE_MAP.get(attr.name))
          .filter((attr): attr is string => !!attr),
      ),
    ).sort();

    return [...attrs, FRAME_POINTER_ATTRIBUTE];
  }
}
