export const StartRules: string[];
export class SyntaxError extends globalThis.SyntaxError {
  expected: unknown[];
  found: unknown;
  location: unknown;
  format(sources: unknown[]): string;
}
export function parse(input: string, options?: Record<string, unknown>): unknown;
