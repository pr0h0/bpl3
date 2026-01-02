/**
 * Structured Logging Utility
 *
 * Provides consistent, configurable logging throughout the compiler.
 * Supports log levels, context tagging, and optional colorization.
 */

import { getConfig } from "./Config";

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * ANSI color codes for terminal output
 */
const Colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

/**
 * Current global log level
 * Can be set via setLogLevel() or automatically from config
 */
let globalLogLevel: LogLevel | null = null;

/**
 * Get the current log level
 */
function getLogLevel(): LogLevel {
  if (globalLogLevel !== null) {
    return globalLogLevel;
  }

  const config = getConfig();
  if (config.features.verbose) {
    return LogLevel.DEBUG;
  }

  return LogLevel.INFO;
}

/**
 * Set the global log level
 */
export function setLogLevel(level: LogLevel): void {
  globalLogLevel = level;
}

/**
 * Reset log level to auto-detect from config
 */
export function resetLogLevel(): void {
  globalLogLevel = null;
}

/**
 * Format a log message with optional color
 */
function formatMessage(
  level: LogLevel,
  context: string,
  message: string,
  colorize: boolean,
): string {
  const timestamp = new Date().toISOString().split("T")[1]?.slice(0, 12) ?? "";

  const levelNames: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: "DEBUG",
    [LogLevel.INFO]: "INFO",
    [LogLevel.WARN]: "WARN",
    [LogLevel.ERROR]: "ERROR",
    [LogLevel.SILENT]: "",
  };

  const levelColors: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: Colors.gray,
    [LogLevel.INFO]: Colors.blue,
    [LogLevel.WARN]: Colors.yellow,
    [LogLevel.ERROR]: Colors.red,
    [LogLevel.SILENT]: "",
  };

  const levelName = levelNames[level].padEnd(5);
  const contextStr = context ? `[${context}]` : "";

  if (colorize) {
    const color = levelColors[level];
    return `${Colors.dim}${timestamp}${Colors.reset} ${color}${levelName}${Colors.reset} ${Colors.cyan}${contextStr}${Colors.reset} ${message}`;
  }

  return `${timestamp} ${levelName} ${contextStr} ${message}`;
}

/**
 * Format additional data for logging
 */
function formatData(data: object, colorize: boolean): string {
  try {
    const json = JSON.stringify(data, null, 2);
    if (colorize) {
      return `${Colors.dim}${json}${Colors.reset}`;
    }
    return json;
  } catch {
    return "[Unserializable data]";
  }
}

/**
 * Logger class for structured, contextual logging
 *
 * @example
 * ```typescript
 * const log = new Logger("TypeChecker");
 * log.info("Checking program", { file: "main.bpl" });
 * log.error("Type mismatch", new TypeError("..."));
 * ```
 */
export class Logger {
  private context: string;

  /**
   * Create a new logger with a context tag
   * @param context - Tag to identify the source of log messages (e.g., "TypeChecker", "CodeGen")
   */
  constructor(context: string) {
    this.context = context;
  }

  /**
   * Check if a log level is enabled
   */
  private isEnabled(level: LogLevel): boolean {
    return level >= getLogLevel();
  }

  /**
   * Get colorize setting from config
   */
  private shouldColorize(): boolean {
    return getConfig().features.colorize;
  }

  /**
   * Log a debug message (only shown in verbose mode)
   */
  debug(message: string, data?: object): void {
    if (!this.isEnabled(LogLevel.DEBUG)) return;

    const formatted = formatMessage(
      LogLevel.DEBUG,
      this.context,
      message,
      this.shouldColorize(),
    );
    console.log(formatted);
    if (data) {
      console.log(formatData(data, this.shouldColorize()));
    }
  }

  /**
   * Log an info message
   */
  info(message: string, data?: object): void {
    if (!this.isEnabled(LogLevel.INFO)) return;

    const formatted = formatMessage(
      LogLevel.INFO,
      this.context,
      message,
      this.shouldColorize(),
    );
    console.log(formatted);
    if (data) {
      console.log(formatData(data, this.shouldColorize()));
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: object): void {
    if (!this.isEnabled(LogLevel.WARN)) return;

    const formatted = formatMessage(
      LogLevel.WARN,
      this.context,
      message,
      this.shouldColorize(),
    );
    console.warn(formatted);
    if (data) {
      console.warn(formatData(data, this.shouldColorize()));
    }
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | object): void {
    if (!this.isEnabled(LogLevel.ERROR)) return;

    const formatted = formatMessage(
      LogLevel.ERROR,
      this.context,
      message,
      this.shouldColorize(),
    );
    console.error(formatted);

    if (error instanceof Error) {
      const colorize = this.shouldColorize();
      const stack = error.stack || error.message;
      console.error(colorize ? `${Colors.dim}${stack}${Colors.reset}` : stack);
    } else if (error) {
      console.error(formatData(error, this.shouldColorize()));
    }
  }

  /**
   * Start a timer for performance measurement
   * @returns A function to call when the operation completes
   */
  time(label: string): () => void {
    if (!this.isEnabled(LogLevel.DEBUG)) {
      return () => {};
    }

    const start = performance.now();
    this.debug(`${label} started`);

    return () => {
      const elapsed = (performance.now() - start).toFixed(2);
      this.debug(`${label} completed`, { elapsed: `${elapsed}ms` });
    };
  }

  /**
   * Create a child logger with a sub-context
   */
  child(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`);
  }
}

/**
 * Default loggers for common compiler components
 */
export const compilerLog = new Logger("Compiler");
export const parserLog = new Logger("Parser");
export const typeCheckerLog = new Logger("TypeChecker");
export const codeGenLog = new Logger("CodeGen");
export const formatterLog = new Logger("Formatter");
export const cliLog = new Logger("CLI");

/**
 * Convenience function for simple logging without creating a Logger instance
 */
export function log(
  level: LogLevel,
  context: string,
  message: string,
  data?: object,
): void {
  const logger = new Logger(context);
  switch (level) {
    case LogLevel.INFO:
      logger.info(message, data);
      break;
    case LogLevel.WARN:
      logger.warn(message, data);
      break;
    case LogLevel.ERROR:
      logger.error(message, data);
      break;
    case LogLevel.DEBUG:
    default:
      logger.debug(message, data);
      break;
  }
}
