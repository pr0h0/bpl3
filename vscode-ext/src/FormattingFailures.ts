/** Report a failure once until it changes or formatting succeeds. */
export class FormattingFailures {
  private failures = new Map<string, string>();
  report(uri: string, error: unknown, notify: (message: string) => void): void {
    const message = error instanceof Error ? error.message : String(error);
    if (this.failures.get(uri) === message) return;
    this.failures.set(uri, message);
    notify(
      `BPL could not format ${uri}: ${message}. Fix the source or .bplfmt.json and try again.`,
    );
  }
  clear(uri: string): void {
    this.failures.delete(uri);
  }
}
