/** Coalesce edits and invalidate asynchronous work on a newer edit or close. */
export class ValidationScheduler {
  private pending = new Map<
    string,
    { timer?: ReturnType<typeof setTimeout> }
  >();
  constructor(private readonly delayMs = 150) {}
  schedule(
    uri: string,
    work: (isCurrent: () => boolean) => Promise<void>,
    onError: (error: unknown) => void,
  ): void {
    this.cancel(uri);
    const ticket: { timer?: ReturnType<typeof setTimeout> } = {};
    this.pending.set(uri, ticket);
    ticket.timer = setTimeout(() => {
      ticket.timer = undefined;
      void work(() => this.pending.get(uri) === ticket)
        .catch(onError)
        .finally(() => {
          if (this.pending.get(uri) === ticket) this.pending.delete(uri);
        });
    }, this.delayMs);
  }
  cancel(uri: string): void {
    const ticket = this.pending.get(uri);
    if (ticket?.timer) clearTimeout(ticket.timer);
    this.pending.delete(uri);
  }
}
