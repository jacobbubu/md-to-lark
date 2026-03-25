export class RateLimiter {
  private nextAllowedAt = 0;
  private readonly minIntervalMs: number;

  constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const delay = this.nextAllowedAt - now;
    if (delay > 0) {
      await sleep(delay);
    }
    this.nextAllowedAt = Date.now() + this.minIntervalMs;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
