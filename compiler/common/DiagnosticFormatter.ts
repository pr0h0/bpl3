/**
 * Diagnostic Formatter
 *
 * Provides consistent formatting for all compiler diagnostics (errors, warnings, notes).
 * Includes support for:
 * - Colored terminal output
 * - Code snippets with line numbers
 * - Error pointers and column indicators
 * - Related locations and cross-references
 * - Machine-readable output for IDE integration
 */

import * as fs from "fs";
import * as path from "path";

import {
  CompilerError,
  DiagnosticSeverity,
  type SourceLocation,
} from "./CompilerError";
import { SourceManager } from "./SourceManager";

/**
 * Configuration for diagnostic formatting
 */
export interface FormatterConfig {
  colorize: boolean; // Enable ANSI color codes
  contextLines: number; // Number of lines to show before/after error
  maxLineLength: number; // Max line length before truncation
  showCodeSnippets: boolean; // Show code snippets in output
  machineReadable: boolean; // Output in machine-readable format (JSON)
}

/**
 * Default formatter configuration
 */
const DEFAULT_CONFIG: FormatterConfig = {
  colorize: process.env.NO_COLOR !== "1" && process.stdout.isTTY !== false,
  contextLines: 2,
  maxLineLength: 200,
  showCodeSnippets: true,
  machineReadable: false,
};

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
};

/**
 * Get the severity label with appropriate coloring
 */
function getSeverityLabel(
  severity: DiagnosticSeverity,
  colorize: boolean,
): string {
  const labels = {
    [DiagnosticSeverity.Error]: "error",
    [DiagnosticSeverity.Warning]: "warning",
    [DiagnosticSeverity.Note]: "note",
    [DiagnosticSeverity.Help]: "help",
  };

  const label = labels[severity];
  if (!colorize) return label;

  const colorMap = {
    [DiagnosticSeverity.Error]: COLORS.red,
    [DiagnosticSeverity.Warning]: COLORS.yellow,
    [DiagnosticSeverity.Note]: COLORS.blue,
    [DiagnosticSeverity.Help]: COLORS.green,
  };

  return `${COLORS.bold}${colorMap[severity]}${label}${COLORS.reset}`;
}

/**
 * Get source lines from a file
 */
function getSourceLines(filePath: string): string[] | null {
  try {
    // Check SourceManager first
    const cachedSource = SourceManager.getSource(filePath);
    if (cachedSource) {
      return cachedSource.split("\n");
    }

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return content.split("\n");
    }
  } catch {
    // Silently fail
  }
  return null;
}

/**
 * Get a specific source line
 */
function getSourceLine(lines: string[] | null, lineNum: number): string | null {
  if (!lines || lineNum < 1 || lineNum > lines.length) {
    return null;
  }
  return lines[lineNum - 1] ?? null;
}

/**
 * Truncate a line if it's too long
 */
function truncateLine(line: string, maxLength: number): string {
  if (line.length <= maxLength) return line;
  return line.substring(0, maxLength - 3) + "...";
}

/**
 * Format a single diagnostic line with color indicator
 */
function formatDiagnosticLine(
  lineNum: number,
  content: string,
  isErrorLine: boolean,
  colorize: boolean,
  maxLength: number,
): string {
  const lineStr = String(lineNum).padStart(4, " ");
  const truncated = truncateLine(content, maxLength);

  if (isErrorLine && colorize) {
    const marker = `${COLORS.red}>${COLORS.reset}`;
    return `${marker} ${lineStr} | ${truncated}`;
  }
  return `  ${lineStr} | ${truncated}`;
}

/**
 * Format the error pointer line (^^^)
 */
function formatErrorPointer(
  startCol: number,
  endCol: number,
  colorize: boolean,
): string {
  const lineStr = "    ".padStart(4, " ");
  const length = Math.max(1, endCol - startCol);
  const pointer = "^".repeat(length).padStart(startCol + length, " ");

  if (colorize) {
    return `  ${lineStr} | ${COLORS.red}${pointer}${COLORS.reset}`;
  }
  return `  ${lineStr} | ${pointer}`;
}

/**
 * Format a code snippet around an error location
 */
function formatCodeSnippet(
  location: SourceLocation,
  sourceLines: string[] | null,
  config: FormatterConfig,
): string {
  if (!sourceLines || !config.showCodeSnippets) {
    return "";
  }

  const lines: string[] = [];
  const startLine = Math.max(1, location.startLine - config.contextLines);
  const endLine = Math.min(
    sourceLines.length,
    location.endLine + config.contextLines,
  );

  // Add context lines before error
  for (let i = startLine; i < location.startLine; i++) {
    const content = getSourceLine(sourceLines, i);
    if (content !== null) {
      lines.push(
        formatDiagnosticLine(
          i,
          content,
          false,
          config.colorize,
          config.maxLineLength,
        ),
      );
    }
  }

  // Add error line(s)
  if (location.startLine === location.endLine) {
    const content = getSourceLine(sourceLines, location.startLine);
    if (content !== null) {
      lines.push(
        formatDiagnosticLine(
          location.startLine,
          content,
          true,
          config.colorize,
          config.maxLineLength,
        ),
      );
    }
  } else {
    for (let i = location.startLine; i <= location.endLine; i++) {
      const content = getSourceLine(sourceLines, i);
      if (content !== null) {
        lines.push(
          formatDiagnosticLine(
            i,
            content,
            true,
            config.colorize,
            config.maxLineLength,
          ),
        );
      }
    }
  }

  // Add error pointer
  lines.push(
    formatErrorPointer(
      location.startColumn,
      location.endColumn,
      config.colorize,
    ),
  );

  // Add context lines after error
  for (let i = location.endLine + 1; i <= endLine; i++) {
    const content = getSourceLine(sourceLines, i);
    if (content !== null) {
      lines.push(
        formatDiagnosticLine(
          i,
          content,
          false,
          config.colorize,
          config.maxLineLength,
        ),
      );
    }
  }

  return lines.join("\n");
}

/**
 * Format a single error location reference
 */
function formatLocationReference(
  location: SourceLocation,
  colorize: boolean,
): string {
  const shortFile = path.basename(location.file);
  const locationStr = `${shortFile}:${location.startLine}:${location.startColumn}`;

  if (colorize) {
    return `${COLORS.bold}${COLORS.cyan}${locationStr}${COLORS.reset}`;
  }
  return locationStr;
}

/**
 * Main diagnostic formatter class
 */
export class DiagnosticFormatter {
  private config: FormatterConfig;

  constructor(config?: Partial<FormatterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Format a CompilerError for display
   */
  formatError(error: CompilerError, severity?: DiagnosticSeverity): string {
    const effectiveSeverity = severity || DiagnosticSeverity.Error;
    const sourceLines = getSourceLines(error.location.file);

    const parts: string[] = [];

    // Header: severity[code][file:line:col]: message
    const severityLabel = getSeverityLabel(
      effectiveSeverity,
      this.config.colorize,
    );
    const locationRef = formatLocationReference(
      error.location,
      this.config.colorize,
    );

    let codeStr = "";
    if (error.code) {
      codeStr = this.config.colorize
        ? `${COLORS.bold}${COLORS.red}[${error.code}]${COLORS.reset}`
        : `[${error.code}]`;
    }

    const header = `${severityLabel}${codeStr}[${locationRef}]: ${error.message}`;
    parts.push(header);

    // Code snippet
    const snippet = formatCodeSnippet(error.location, sourceLines, this.config);
    if (snippet) {
      parts.push("");
      parts.push(snippet);
    }

    // Help/hint message
    if (error.hint) {
      parts.push("");
      const helpLabel = this.config.colorize
        ? `${COLORS.bold}${COLORS.green}help${COLORS.reset}`
        : "help";
      parts.push(`${helpLabel}: ${error.hint}`);
    }

    // Related locations
    if (error.relatedLocations && error.relatedLocations.length > 0) {
      parts.push("");
      const relatedLabel = this.config.colorize
        ? `${COLORS.bold}${COLORS.cyan}related locations${COLORS.reset}`
        : "related locations";
      parts.push(`${relatedLabel}:`);

      for (const related of error.relatedLocations) {
        const relRef = formatLocationReference(
          related.location,
          this.config.colorize,
        );
        parts.push(`  ${relRef}: ${related.message}`);
      }
    }

    return parts.join("\n");
  }

  /**
   * Format multiple errors with summary
   */
  formatErrors(errors: CompilerError[]): string {
    if (errors.length === 0) return "";

    const parts: string[] = [];

    for (let i = 0; i < errors.length; i++) {
      if (i > 0) parts.push("");
      parts.push(this.formatError(errors[i]!));
    }

    // Summary line
    parts.push("");
    const count = errors.length;
    const errorWord = count === 1 ? "error" : "errors";
    const summary = this.config.colorize
      ? `${COLORS.bold}${COLORS.red}${count} ${errorWord}${COLORS.reset}`
      : `${count} ${errorWord}`;
    parts.push(summary);

    return parts.join("\n");
  }

  /**
   * Format as machine-readable JSON (for IDE integration)
   */
  formatAsJSON(errors: CompilerError[]): string {
    const diagnostics = errors.map((err) => ({
      severity: err.toDiagnostic().severity,
      message: err.message,
      hint: err.hint,
      location: {
        file: err.location.file,
        start: {
          line: err.location.startLine,
          column: err.location.startColumn,
        },
        end: {
          line: err.location.endLine,
          column: err.location.endColumn,
        },
      },
      relatedLocations: err.relatedLocations.map((rel) => ({
        message: rel.message,
        location: {
          file: rel.location.file,
          start: {
            line: rel.location.startLine,
            column: rel.location.startColumn,
          },
        },
      })),
    }));

    return JSON.stringify(diagnostics, null, 2);
  }

  /**
   * Set formatter configuration
   */
  setConfig(config: Partial<FormatterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Global formatter instance for convenience
 */
export const globalFormatter = new DiagnosticFormatter();
