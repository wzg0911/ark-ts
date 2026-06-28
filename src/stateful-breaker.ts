/**
 * StatefulBreaker — 持久化熔断器
 * Gene source: EverOS (⭐7,225) + MemBrain
 * Circuit breaker state persisted to disk — survives process restarts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export class CircuitOpenError extends Error {
  constructor(name: string, waitSeconds: number) {
    super(
      `Circuit [${name}] OPEN. Cooldown: ${Math.max(0, waitSeconds).toFixed(0)}s`,
    );
    this.name = 'CircuitOpenError';
  }
}

interface BreakerSnapshot {
  name: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailure: number;
  successCount: number;
  halfOpenTries: number;
  totalCalls: number;
  totalFailures: number;
  updatedAt: number;
}

interface StatefulBreakerStats {
  name: string;
  state: string;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  totalFailures: number;
  recoveryTimeout: number;
  persistPath: string;
  reliability: string;
}

export class StatefulBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailure = 0;
  private successCount = 0;
  private halfOpenTries = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private persistPath: string;

  constructor(
    public name: string,
    private failureThreshold: number = 3,
    private recoveryTimeout: number = 30,
    private halfOpenMax: number = 2,
    persistPath?: string,
    private autoPersist: boolean = true,
  ) {
    if (persistPath) {
      this.persistPath = persistPath;
    } else {
      const arkDir = path.join(os.homedir(), '.ark', 'state');
      fs.mkdirSync(arkDir, { recursive: true });
      this.persistPath = path.join(arkDir, `breaker_${name}.json`);
    }
    this.loadState();
    this.saveState();
  }

  private defaultState(): BreakerSnapshot {
    return {
      name: this.name,
      state: 'closed',
      failureCount: 0,
      lastFailure: 0,
      successCount: 0,
      halfOpenTries: 0,
      totalCalls: 0,
      totalFailures: 0,
      updatedAt: Date.now(),
    };
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data: BreakerSnapshot = JSON.parse(
          fs.readFileSync(this.persistPath, 'utf-8'),
        );
        this.state = data.state ?? 'closed';
        this.failureCount = data.failureCount ?? 0;
        this.lastFailure = data.lastFailure ?? 0;
        this.successCount = data.successCount ?? 0;
        this.halfOpenTries = data.halfOpenTries ?? 0;
        this.totalCalls = data.totalCalls ?? 0;
        this.totalFailures = data.totalFailures ?? 0;
      }
    } catch {
      // Corrupted file → use defaults
    }
  }

  private saveState(): void {
    if (!this.autoPersist) return;
    const snapshot: BreakerSnapshot = {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailure: this.lastFailure,
      successCount: this.successCount,
      halfOpenTries: this.halfOpenTries,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      updatedAt: Date.now(),
    };
    try {
      fs.writeFileSync(this.persistPath, JSON.stringify(snapshot, null, 2));
    } catch {
      // Silently skip write errors
    }
  }

  async call<T>(
    primary: () => Promise<T> | T,
    fallback?: () => Promise<T> | T,
  ): Promise<T> {
    this.totalCalls++;

    if (this.state === 'open') {
      if (Date.now() / 1000 - this.lastFailure > this.recoveryTimeout) {
        this.state = 'half-open';
        this.halfOpenTries = 0;
        this.saveState();
      } else {
        const remaining =
          this.recoveryTimeout - (Date.now() / 1000 - this.lastFailure);
        if (fallback) return fallback();
        throw new CircuitOpenError(this.name, remaining);
      }
    }

    if (this.state === 'half-open') {
      this.halfOpenTries++;
      if (this.halfOpenTries > this.halfOpenMax) {
        this.state = 'open';
        this.saveState();
        if (fallback) return fallback();
        throw new CircuitOpenError(this.name, this.recoveryTimeout);
      }
    }

    try {
      const result = await primary();
      this.onSuccess();
      this.saveState();
      return result;
    } catch (err) {
      this.onFailure();
      this.totalFailures++;
      this.saveState();
      if (fallback) return fallback();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
    }
    this.failureCount = 0;
    this.successCount++;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailure = Date.now() / 1000;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  reset(): void {
    const defaults = this.defaultState();
    this.state = defaults.state as 'closed';
    this.failureCount = defaults.failureCount;
    this.lastFailure = defaults.lastFailure;
    this.successCount = defaults.successCount;
    this.halfOpenTries = defaults.halfOpenTries;
    this.totalCalls = defaults.totalCalls;
    this.totalFailures = defaults.totalFailures;
    this.saveState();
  }

  inspectPersistence(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      persistPath: this.persistPath,
      fileExists: fs.existsSync(this.persistPath),
      currentState: this.state,
    };
    if (result.fileExists) {
      try {
        result.storedData = JSON.parse(
          fs.readFileSync(this.persistPath, 'utf-8'),
        );
      } catch {
        result.storedData = null;
      }
    }
    return result;
  }

  get stats(): StatefulBreakerStats {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      recoveryTimeout: this.recoveryTimeout,
      persistPath: this.persistPath,
      reliability:
        this.totalCalls > 0
          ? `${((1 - this.totalFailures / this.totalCalls) * 100).toFixed(1)}%`
          : '100%',
    };
  }
}
