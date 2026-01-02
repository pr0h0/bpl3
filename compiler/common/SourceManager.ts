/**
 * Source Manager
 *
 * Manages source code content for error reporting and virtual files.
 * This is particularly useful for:
 * - Stdin input (piped code)
 * - Eval mode (-e flag)
 * - Testing with in-memory source code
 *
 * @example
 * ```typescript
 * // Store virtual source for error reporting
 * SourceManager.setSource("<stdin>", "frame main() ret int { return 0; }");
 *
 * // Retrieve source for error display
 * const src = SourceManager.getSource("<stdin>");
 * ```
 */
export class SourceManager {
  private static sources: Map<string, string> = new Map();

  /**
   * Store source code content for a given path
   * @param path - The file path or virtual path identifier
   * @param content - The source code content
   */
  static setSource(path: string, content: string): void {
    this.sources.set(path, content);
  }

  /**
   * Retrieve source code content for a given path
   * @param path - The file path or virtual path identifier
   * @returns The source code content, or undefined if not found
   */
  static getSource(path: string): string | undefined {
    return this.sources.get(path);
  }

  /**
   * Clear all stored source content
   * Useful for resetting state between compilations or tests
   */
  static clear(): void {
    this.sources.clear();
  }
}
