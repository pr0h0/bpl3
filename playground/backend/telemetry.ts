interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: any;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  log(level: LogEntry["level"], message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      message,
      data,
    };

    this.logs.push(entry);

    // Trim logs if exceeding max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output with colors
    const colors = {
      info: "\x1b[36m", // Cyan
      warn: "\x1b[33m", // Yellow
      error: "\x1b[31m", // Red
      debug: "\x1b[90m", // Gray
    };
    const reset = "\x1b[0m";
    const prefix = `${colors[level]}[${level.toUpperCase()}]${reset}`;

    console.error(
      `${prefix} ${entry.timestamp} - ${message}`,
      data ? JSON.stringify(data, null, 2) : "",
    );
  }

  info(message: string, data?: any) {
    this.log("info", message, data);
  }

  warn(message: string, data?: any) {
    this.log("warn", message, data);
  }

  error(message: string, data?: any) {
    this.log("error", message, data);
  }

  debug(message: string, data?: any) {
    this.log("debug", message, data);
  }

  getLogs(limit = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  clearLogs() {
    this.logs = [];
  }
}

export const logger = new Logger();

// ============================================================================
// Statistics & Metrics
// ============================================================================

interface Statistics {
  totalRequests: number;
  successfulCompilations: number;
  failedCompilations: number;
  averageCompileTime: number;
  totalExamplesLoaded: number;
  uptime: number;
  startTime: number;
}

export const stats: Statistics = {
  totalRequests: 0,
  successfulCompilations: 0,
  failedCompilations: 0,
  averageCompileTime: 0,
  totalExamplesLoaded: 0,
  uptime: 0,
  startTime: Date.now(),
};

export function updateStats(success: boolean, duration: number) {
  stats.totalRequests++;
  if (success) {
    stats.successfulCompilations++;
  } else {
    stats.failedCompilations++;
  }

  // Update average compile time
  const totalCompilations =
    stats.successfulCompilations + stats.failedCompilations;
  stats.averageCompileTime =
    (stats.averageCompileTime * (totalCompilations - 1) + duration) /
    totalCompilations;
}

export function getUptime(): number {
  return Math.floor((Date.now() - stats.startTime) / 1000);
}
