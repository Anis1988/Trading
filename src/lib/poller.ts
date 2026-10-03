export interface PollerOptions {
  intervalMs: () => number;
  tick: () => Promise<void>; // throw to signal failure -> backoff
  onBackoff?: (delayMs: number, failures: number) => void;
  maxDelayMs?: number;
}

/** Exponential backoff (x2 per consecutive failure, capped) plus 0-30% random jitter. */
export function computeDelay(base: number, failures: number, max: number, rand = Math.random()): number {
  const exp = Math.min(max, base * 2 ** failures);
  return Math.round(exp + exp * 0.3 * rand);
}

export class Poller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private running = false;
  constructor(private o: PollerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.failures = 0;
    void this.run();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    if (!this.running) return;
    try {
      await this.o.tick();
      this.failures = 0;
    } catch {
      this.failures++;
    }
    if (!this.running) return;
    const delay = computeDelay(this.o.intervalMs(), this.failures, this.o.maxDelayMs ?? 10 * 60_000);
    if (this.failures > 0) this.o.onBackoff?.(delay, this.failures);
    this.timer = setTimeout(() => void this.run(), delay);
  }
}
