// Files the Bun CLI imports with `with { type: "text" }` (see EmbeddedResources.ts).
declare module "*.bpl" {
  const content: string;
  export default content;
}

declare module "*.x" {
  const content: string;
  export default content;
}

declare module "*.c" {
  const content: string;
  export default content;
}

declare module "*.ll" {
  const content: string;
  export default content;
}
