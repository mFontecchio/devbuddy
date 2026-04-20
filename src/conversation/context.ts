/** Tracks recent terminal events for contextual conversation responses */
export class ConversationContext {
  private recentEvents: Array<{ event: string; timestamp: number }> = [];
  private maxEvents = 20;

  addEvent(event: string): void {
    this.recentEvents.push({ event, timestamp: Date.now() });
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents.shift();
    }
  }

  /** Get the most recent event of a given type */
  getLastEvent(eventType: string): number | undefined {
    for (let i = this.recentEvents.length - 1; i >= 0; i--) {
      if (this.recentEvents[i].event === eventType) {
        return this.recentEvents[i].timestamp;
      }
    }
    return undefined;
  }

  /** Check if an event type occurred recently (within windowMs) */
  hasRecent(eventType: string, windowMs = 60_000): boolean {
    const last = this.getLastEvent(eventType);
    if (!last) return false;
    return Date.now() - last < windowMs;
  }

  /** Get a summary of recent activity for contextual responses */
  getSummary(): string {
    if (this.recentEvents.length === 0) return "quiet";

    const recent = this.recentEvents.slice(-5);
    const hasErrors = recent.some((e) => e.event.includes("error") || e.event.includes("fail"));
    const hasSuccess = recent.some((e) => e.event.includes("pass") || e.event.includes("success"));

    if (hasErrors && hasSuccess) return "mixed";
    if (hasErrors) return "struggling";
    if (hasSuccess) return "succeeding";
    return "working";
  }

  clear(): void {
    this.recentEvents = [];
  }
}
