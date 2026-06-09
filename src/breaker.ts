/**
 * CircuitBreaker — 熔断控制器
 * Gene source: Sentinel microservice resilience
 * Auto-meltdown → safe fallback
 */

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit ${name} is OPEN — refusing call`);
    this.name = 'CircuitOpenError';
  }
}

type CircuitState = 'closed' | 'open' | 'half-open';

interface BreakerStats {
  state: CircuitState;
  failures: number;
  totalCalls: number;
  totalFailures: number;
  reliability: string;
}

export class CircuitBreaker {
  state: CircuitState = 'closed';
  private failures = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private lastFailure = 0;
  private openedAt = 0;

  constructor(
    private name: string,
    private failureThreshold: number = 3,
    private recoveryMs: number = 30_000,
    private halfOpenMaxCalls: number = 1,
  ) {}

  async call<T>(
    primary: () => Promise<T> | T,
    fallback?: () => Promise<T> | T,
  ): Promise<T> {
    this.totalCalls++;

    if (this.state === 'open') {
      if (Date.now() - this.openedAt > this.recoveryMs) {
        this.state = 'half-open';
      } else if (fallback) {
        return fallback();
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await primary();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      if (fallback) return fallback();
      throw err;
    }
  }

  callSync<T>(primary: () => T, fallback?: () => T): T {
    this.totalCalls++;
    if (this.state === 'open') {
      if (Date.now() - this.openedAt > this.recoveryMs) {
        this.state = 'half-open';
      } else if (fallback) {
        return fallback();
      } else {
        throw new CircuitOpenError(this.name);
      }
    }
    try {
      const result = primary();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      if (fallback) return fallback!();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') this.state = 'closed';
    this.failures = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.totalCalls = 0;
    this.totalFailures = 0;
  }

  get stats(): BreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      reliability:
        this.totalCalls > 0
          ? `${((1 - this.totalFailures / this.totalCalls) * 100).toFixed(1)}%`
          : '100%',
    };
  }
}
