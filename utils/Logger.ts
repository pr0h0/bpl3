export class Logger {
  private static quiet: boolean = false;

  public static setQuiet(quiet: boolean) {
    this.quiet = quiet;
  }

  public static log(...args: any[]) {
    if (this.quiet) return;
    console.log(...args);
  }

  public static info(...args: any[]) {
    if (this.quiet) return;
    console.info(...args);
  }

  public static warn(...args: any[]) {
    if (this.quiet) return;
    console.warn(...args);
  }

  public static error(...args: any[]) {
    console.error(...args);
  }

  public static debug(...args: any[]) {
    if (this.quiet) return;
    console.debug(...args);
  }
}
