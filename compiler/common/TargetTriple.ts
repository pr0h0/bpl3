export interface ParsedTargetTriple {
  raw: string;
  normalized: string;
  arch: string;
  components: ReadonlySet<string>;
}

export function parseTargetTriple(
  target: string,
): ParsedTargetTriple | undefined {
  const trimmedTarget = target.trim();
  if (!trimmedTarget || trimmedTarget !== target) return undefined;

  const normalized = trimmedTarget.toLowerCase();
  const parts = normalized.split("-");
  if (parts.some((part) => part.length === 0)) return undefined;

  return {
    raw: target,
    normalized,
    arch: parts[0] ?? "",
    components: new Set(parts),
  };
}

export function targetHasComponent(
  target: ParsedTargetTriple | undefined,
  component: string,
): boolean {
  return target?.components.has(component) ?? false;
}

export function targetHasAnyComponent(
  target: ParsedTargetTriple | undefined,
  components: readonly string[],
): boolean {
  return components.some((component) => targetHasComponent(target, component));
}

export function isWasmTargetArch(target?: string): boolean {
  if (target === undefined) return false;

  const parsed = parseTargetTriple(target);
  return parsed?.arch === "wasm32" || parsed?.arch === "wasm64";
}

export function hasHostedWasmRuntimeComponent(target?: string): boolean {
  if (target === undefined) return false;

  const parsed = parseTargetTriple(target);
  if (!parsed) return false;

  return Array.from(parsed.components).some(
    (component) =>
      component === "emscripten" ||
      component === "wasi" ||
      /^wasip\d+$/.test(component),
  );
}
