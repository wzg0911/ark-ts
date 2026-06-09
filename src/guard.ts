/**
 * IdempotencyGuard — 幂等守护
 * Gene source: Stripe payment idempotency
 * Prevents duplicate tool execution via parameter hashing.
 */
import * as crypto from 'crypto';

interface ExecutedEntry {
  result: unknown;
  at: number;
}

interface GuardStats {
  passes: number;
  intercepts: number;
  entries: number;
  saveRate: string;
}

export class IdempotencyGuard {
  private executed: Map<string, ExecutedEntry> = new Map();
  private passes = 0;
  private intercepts = 0;

  constructor(private ttlMs: number = 3_600_000) {}

  /** Generate a deterministic key from tool + params */
  key(toolName: string, params: Record<string, unknown>): string {
    const raw = JSON.stringify({ tool: toolName, params });
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  /** Check if this call has been executed before */
  check(key: string): boolean {
    const entry = this.executed.get(key);
    if (!entry) return false;
    if (Date.now() - entry.at > this.ttlMs) {
      this.executed.delete(key);
      return false;
    }
    return true;
  }

  /** Record a tool execution result */
  record(key: string, result: unknown): void {
    this.executed.set(key, { result, at: Date.now() });
    this.passes++;
    // Cleanup old entries
    const cutoff = Date.now() - this.ttlMs;
    for (const [k, v] of this.executed) {
      if (v.at < cutoff) this.executed.delete(k);
    }
  }

  /** Decorator: wrap a function with idempotency */
  wrap<T extends (...args: any[]) => any>(toolName: string, fn: T): T {
    return ((...args: unknown[]) => {
      const k = this.key(toolName, args.length === 1 ? (args[0] as any) : { args });
      if (this.check(k)) {
        this.intercepts++;
        return this.executed.get(k)!.result;
      }
      const result = fn(...args);
      this.record(k, result);
      return result;
    }) as unknown as T;
  }

  reset(): void {
    this.executed.clear();
    this.passes = 0;
    this.intercepts = 0;
  }

  get stats(): GuardStats {
    const total = this.passes + this.intercepts;
    return {
      passes: this.passes,
      intercepts: this.intercepts,
      entries: this.executed.size,
      saveRate: total > 0 ? `${((this.intercepts / total) * 100).toFixed(1)}%` : '0%',
    };
  }
}
