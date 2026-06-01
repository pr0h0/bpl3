declare module "bun:test" {
  type TestCallback = () => unknown | Promise<unknown>;

  interface TestRegistrar {
    (name: string, callback: TestCallback, timeout?: number): void;
    skip(name: string, callback: TestCallback, timeout?: number): void;
    only(name: string, callback: TestCallback, timeout?: number): void;
  }

  interface Expectation {
    not: Expectation;
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatchObject(expected: unknown): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toThrow(expected?: unknown): void;
  }

  export const describe: TestRegistrar;
  export const it: TestRegistrar;
  export const test: TestRegistrar;
  export const beforeAll: (callback: TestCallback) => void;
  export function expect(actual: unknown): Expectation;
}

interface ImportMeta {
  readonly dir: string;
}
