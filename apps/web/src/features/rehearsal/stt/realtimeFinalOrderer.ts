export type OrderedRealtimeFinal<T> = {
  sequence: number;
  value: T;
  reorderTimedOut: boolean;
};

export class RealtimeFinalOrderer<T> {
  private readonly pending = new Map<number, T>();
  private nextSequence = 1;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly emit: (result: OrderedRealtimeFinal<T>) => void,
    private readonly timeoutMs = 2000
  ) {}

  push(sequence: number, value: T) {
    if (!Number.isInteger(sequence) || sequence < this.nextSequence) {
      return;
    }
    this.pending.set(sequence, value);
    this.flush(false);
  }

  reset() {
    this.clearTimer();
    this.pending.clear();
    this.nextSequence = 1;
  }

  private flush(reorderTimedOut: boolean) {
    let emitted = false;
    while (this.pending.has(this.nextSequence)) {
      const sequence = this.nextSequence;
      const value = this.pending.get(sequence);
      this.pending.delete(sequence);
      this.nextSequence += 1;
      if (value !== undefined) {
        this.emit({ sequence, value, reorderTimedOut });
        emitted = true;
      }
      reorderTimedOut = false;
    }

    if (this.pending.size === 0) {
      this.clearTimer();
      return;
    }
    if (emitted) {
      this.clearTimer();
    }
    this.ensureTimer();
  }

  private ensureTimer() {
    if (this.timeoutId !== null) {
      return;
    }
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      const firstAvailable = Math.min(...this.pending.keys());
      if (!Number.isFinite(firstAvailable)) {
        return;
      }
      this.nextSequence = firstAvailable;
      this.flush(true);
    }, this.timeoutMs);
  }

  private clearTimer() {
    if (this.timeoutId === null) {
      return;
    }
    clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }
}
