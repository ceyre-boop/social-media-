// Minimal typing for `bun test` (bun:test) so tsc passes without @types/bun.
declare module 'bun:test' {
  type Matchers = {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeCloseTo(expected: number, digits?: number): void;
    toBeGreaterThan(n: number): void;
    toBeGreaterThanOrEqual(n: number): void;
    toBeLessThan(n: number): void;
    toBeLessThanOrEqual(n: number): void;
    toContain(expected: unknown): void;
    toStartWith(expected: string): void;
    toHaveLength(n: number): void;
    not: Matchers;
  };
  type TestFn = {
    (name: string, fn: () => void | Promise<void>): void;
    each(cases: readonly unknown[]): (name: string, fn: (...args: any[]) => void | Promise<void>) => void;
  };
  export function describe(name: string, fn: () => void): void;
  export const test: TestFn;
  export function expect(actual: unknown): Matchers;
}
