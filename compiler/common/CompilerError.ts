/**
 * Compiler Error Handling
 *
 * Provides structured error reporting with source locations,
 * code snippets, hints, and related error locations.
 */

import * as fs from "fs";
import * as path from "path";
import { SourceManager } from "./SourceManager";

/**
 * Source code location information
 */
export interface SourceLocation {
  /** File path or virtual path */
  file: string;
  /** Starting line number (1-indexed) */
  startLine: number;
  /** Starting column number (1-indexed) */
  startColumn: number;
  /** Ending line number (1-indexed) */
  endLine: number;
  /** Ending column number (1-indexed) */
  endColumn: number;
}

/**
 * Error severity levels
 */
export enum DiagnosticSeverity {
  Error = "error",
  Warning = "warning",
  Note = "note",
  Help = "help",
}

/**
 * Diagnostic message with full context information.
 * Used for IDE integration and structured error reporting.
 */
export interface Diagnostic {
  /** Severity level of the diagnostic */
  severity: DiagnosticSeverity;
  /** Source location where the issue occurred */
  location: SourceLocation;
  /** Human-readable error message */
  message: string;
  /** Optional hint for fixing the issue */
  hint?: string;
  /** Related locations that provide additional context */
  relatedLocations?: {
    message: string;
    location: SourceLocation;
  }[];
}

/**
 * Structured compiler error with rich context information.
 *
 * Provides:
 * - Source code snippets with line highlighting
 * - Error location in file:line:column format
 * - Hints for fixing the issue
 * - Related error locations for multi-location errors
 *
 * @example
 * ```typescript
 * throw new CompilerError(
 *   "Type mismatch: expected 'int', got 'string'",
 *   "Consider using parseInt() to convert the value",
 *   { file: "main.bpl", startLine: 10, startColumn: 5, endLine: 10, endColumn: 15 }
 * );
 * ```
 */
export class CompilerError extends Error {
  private sourceLines: string[] | null = null;
  private severity: DiagnosticSeverity = DiagnosticSeverity.Error;
  /** Related error locations for multi-location diagnostics */
  public relatedLocations: Array<{
    message: string;
    location: SourceLocation;
  }> = [];
  /** Optional error code for categorization */
  public code?: string;

  /**
   * Create a new compiler error
   * @param message - The error message
   * @param hint - A helpful hint for resolving the error
   * @param location - Source location where the error occurred
   * @param code - Optional error code for categorization
   */
  constructor(
    public message: string,
    public hint: string,
    public location: SourceLocation,
    code?: string,
  ) {
    super(message);
    this.name = "CompilerError";
    this.code = code;
    this.loadSourceLines();
  }

  /**
   * Load the source file lines for code snippet display
   */
  private loadSourceLines(): void {
    try {
      if (!this.location || !this.location.file) {
        this.sourceLines = null;
        return;
      }

      // Check SourceManager first (for virtual files like stdin/eval)
      const cachedSource = SourceManager.getSource(this.location.file);
      if (cachedSource) {
        this.sourceLines = cachedSource.split("\n");
        return;
      }

      // Skip reading for special file names if not in cache
      if (
        this.location.file.includes("stdin-") ||
        this.location.file.includes("eval-")
      ) {
        this.sourceLines = null;
        return;
      }

      if (fs.existsSync(this.location.file)) {
        const content = fs.readFileSync(this.location.file, "utf-8");
        this.sourceLines = content.split("\n");
      }
    } catch {
      // Silently fail if we can't read the file
      this.sourceLines = null;
    }
  }

  /**
   * Get a specific line of source code
   */
  private getSourceLine(lineNum: number): string | null {
    if (!this.sourceLines || lineNum < 1 || lineNum > this.sourceLines.length) {
      return null;
    }
    return this.sourceLines[lineNum - 1] ?? null;
  }

  /**
   * Format a single line with context
   */
  private formatLineWithContext(lineNum: number, isErrorLine: boolean): string {
    const line = this.getSourceLine(lineNum);
    if (!line) return "";

    const lineStr = String(lineNum).padStart(4, " ");
    const prefix = isErrorLine ? " \x1b[31m>\x1b[0m " : "   ";
    return `${prefix}${lineStr} | ${line}`;
  }

  /**
   * Format the error pointer (^^^) under the error location
   */
  private formatErrorPointer(): string {
    const line = this.getSourceLine(this.location.startLine);
    if (!line) return "";

    const lineStr = "    ".padStart(4, " ");
    const col = this.location.startColumn;
    const length = Math.max(
      1,
      this.location.endColumn - this.location.startColumn,
    );
    const pointer = " ".repeat(col) + "^".repeat(length);

    return `${lineStr} | \x1b[31m${pointer}\x1b[0m`;
  }

  /**
   * Get the filename without full path for cleaner output
   */
  private getShortFileName(): string {
    if (!this.location || typeof this.location.file !== "string") {
      return "unknown";
    }
    return path.basename(this.location.file);
  }

  /**
   * Format code snippet with context lines
   */
  private formatCodeSnippet(): string {
    const lines: string[] = [];
    const startLine = Math.max(1, this.location.startLine - 2); // 2 lines before
    const endLine = Math.min(
      this.sourceLines?.length ?? Infinity,
      this.location.endLine + 2,
    ); // 2 lines after

    // Add context lines before
    for (let i = startLine; i < this.location.startLine; i++) {
      lines.push(this.formatLineWithContext(i, false));
    }

    // Add error line(s)
    if (this.location.startLine === this.location.endLine) {
      lines.push(this.formatLineWithContext(this.location.startLine, true));
    } else {
      for (let i = this.location.startLine; i <= this.location.endLine; i++) {
        lines.push(this.formatLineWithContext(i, true));
      }
    }

    // Add error pointer
    lines.push(this.formatErrorPointer());

    // Add context lines after
    for (let i = this.location.endLine + 1; i <= endLine; i++) {
      lines.push(this.formatLineWithContext(i, false));
    }

    return lines.join("\n");
  }

  /**
   * Enhanced error formatting with code snippets and location info
   */
  public toString(): string {
    const parts: string[] = [];

    // Header with location in file:row:column format
    const location = `${this.getShortFileName()}:${this.location.startLine}:${this.location.startColumn}`;
    parts.push(
      `\x1b[1m\x1b[31merror\x1b[0m\x1b[1m[${location}]\x1b[0m: ${this.message}`,
    );

    // Code snippet
    if (this.sourceLines) {
      parts.push("");
      parts.push(this.formatCodeSnippet());
    } else {
      // Fallback when we can't read the file
      parts.push(`  at ${this.location.file}:${this.location.startLine}`);
    }

    // Hint/suggestion
    if (this.hint) {
      parts.push("");
      parts.push(`\x1b[1m\x1b[34mhelp\x1b[0m: ${this.hint}`);
    }

    // Related locations
    if (this.relatedLocations.length > 0) {
      parts.push("");
      parts.push("\x1b[1m\x1b[36mrelated locations\x1b[0m:");
      for (const related of this.relatedLocations) {
        const shortFile = path.basename(related.location.file);
        parts.push(
          `  \x1b[36m${shortFile}:${related.location.startLine}:${related.location.startColumn}\x1b[0m: ${related.message}`,
        );
      }
    }

    return parts.join("\n");
  }

  /**
   * Get a diagnostic object for IDE integration
   */
  public toDiagnostic(): Diagnostic {
    return {
      severity: this.severity,
      location: this.location,
      message: this.message,
      hint: this.hint,
      relatedLocations: this.relatedLocations,
    };
  }

  /**
   * Add a related error location
   */
  public addRelatedLocation(
    location: SourceLocation,
    message: string,
  ): CompilerError {
    this.relatedLocations.push({ location, message });
    return this;
  }

  /**
   * Set error severity
   */
  public setSeverity(severity: DiagnosticSeverity): CompilerError {
    this.severity = severity;
    return this;
  }
}
