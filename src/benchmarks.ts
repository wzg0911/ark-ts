/**
 * Benchmarks — 性能基准测试套件
 * Performance benchmarking for core ARK components.
 */

import { IdempotencyGuard } from './guard.js';
import { CircuitBreaker } from './breaker.js';
import { OutputValidator } from './validator.js';

// Inline minimal schema interface matching guard's ExecutionRecord
interface ExecutionRecord {
  idempotencyKey: string;
  toolName: string;
  argsHash: string;
  result: Record<string, unknown>;
  timestamp?: number;
}

export interface BenchmarkMetrics {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  p50Ms: number;
  p99Ms: number;
  stdMs: number;
  throughputOps: number;
}

function sortedPercentile(sorted: number[], p: number): number {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function stdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

export class Benchmarks {
  results: BenchmarkMetrics[] = [];

  constructor(public iterations: number = 10_000) {}

  private measure(
    name: string,
    fn: () => void,
  ): BenchmarkMetrics {
    const timings: number[] = [];

    for (let i = 0; i < this.iterations; i++) {
      const start = performance.now();
      fn();
      const elapsed = performance.now() - start;
      timings.push(elapsed);
    }

    const sorted = [...timings].sort((a, b) => a - b);
    const total = timings.reduce((a, b) => a + b, 0);
    const avg = total / timings.length;

    return {
      name,
      iterations: this.iterations,
      totalMs: total,
      avgMs: avg,
      p50Ms: sortedPercentile(sorted, 0.5),
      p99Ms: sortedPercentile(sorted, 0.99),
      stdMs: stdDev(timings, avg),
      throughputOps: 1000 / avg,
    };
  }

  benchIdempotencyKeyGen(): BenchmarkMetrics {
    const guard = new IdempotencyGuard();
    const args = { tool: 'send_email', to: 'test@ark.dev', body: 'hello'.repeat(10) };
    return this.measure('IdempotencyGuard.key()', () => {
      guard.key('send_email', args);
    });
  }

  benchIdempotencyCheckHit(): BenchmarkMetrics {
    const guard = new IdempotencyGuard();
    const key = guard.key('send_payment', {
      amount: 100,
      currency: 'USD',
    });
    // Manually record so check returns hit
    const record: ExecutionRecord = {
      idempotencyKey: key,
      toolName: 'send_payment',
      argsHash: 'abc123',
      result: { status: 'ok' },
    };
    // Access internal cache via guard's record method
    (guard as unknown as { record(k: string, r: ExecutionRecord): void }).record(
      key,
      record,
    );
    return this.measure('IdempotencyGuard.check() [hit]', () => {
      guard.check(key);
    });
  }

  benchIdempotencyCheckMiss(): BenchmarkMetrics {
    const guard = new IdempotencyGuard();
    const key = guard.key('new_tool', { foo: 'bar' });
    return this.measure('IdempotencyGuard.check() [miss]', () => {
      guard.check(key);
    });
  }

  benchCircuitBreakerClosed(): BenchmarkMetrics {
    const cb = new CircuitBreaker('bench');
    return this.measure('CircuitBreaker.call() [closed]', () => {
      cb.callSync(() => 'ok');
    });
  }

  benchValidatorValid(): BenchmarkMetrics {
    const v = new OutputValidator();
    return this.measure('OutputValidator.validateShape() [valid]', () => {
      v.validateShape({ status: 'ok', data: 'test' }, { status: 'string', data: 'string' });
    });
  }

  benchValidatorNone(): BenchmarkMetrics {
    const v = new OutputValidator();
    return this.measure('OutputValidator.validateShape() [none]', () => {
      v.validateShape(null, {});
    });
  }

  runAll(): BenchmarkMetrics[] {
    const benches: Array<[string, () => BenchmarkMetrics]> = [
      ['Idempotency Key Gen', () => this.benchIdempotencyKeyGen()],
      ['Idempotency Check [hit]', () => this.benchIdempotencyCheckHit()],
      ['Idempotency Check [miss]', () => this.benchIdempotencyCheckMiss()],
      ['CircuitBreaker [closed]', () => this.benchCircuitBreakerClosed()],
      ['Validator [valid]', () => this.benchValidatorValid()],
      ['Validator [none]', () => this.benchValidatorNone()],
    ];

    console.log('\n' + '='.repeat(60));
    console.log(`  ARK Benchmarks (${this.iterations.toLocaleString()} iterations each)`);
    console.log('='.repeat(60));
    console.log(
      `${'Benchmark'.padEnd(35)} ${'avg(μs)'.padStart(10)} ${'p50(μs)'.padStart(10)} ${'p99(μs)'.padStart(10)} ${'ops/s'.padStart(12)}`,
    );
    console.log(
      `${'-'.repeat(35)} ${'-'.repeat(10)} ${'-'.repeat(10)} ${'-'.repeat(10)} ${'-'.repeat(12)}`,
    );

    for (const [, benchFn] of benches) {
      const result = benchFn();
      this.results.push(result);
      const μs = 1000; // convert ms → μs for display
      console.log(
        `${result.name.padEnd(35)} ` +
          `${(result.avgMs * μs).toFixed(1).padStart(10)} ` +
          `${(result.p50Ms * μs).toFixed(1).padStart(10)} ` +
          `${(result.p99Ms * μs).toFixed(1).padStart(10)} ` +
          `${Math.round(result.throughputOps).toLocaleString().padStart(12)}`,
      );
    }

    console.log('='.repeat(60) + '\n');
    return this.results;
  }

  toJSON(): string {
    return JSON.stringify(this.results, null, 2);
  }

  summary(): Record<string, unknown> {
    if (this.results.length === 0) this.runAll();
    const fastest = this.results.reduce((a, b) => (a.avgMs < b.avgMs ? a : b));
    const slowest = this.results.reduce((a, b) => (a.avgMs > b.avgMs ? a : b));
    return {
      version: '0.4.1-dev',
      iterations: this.iterations,
      results: this.results,
      slowest: slowest.name,
      fastest: fastest.name,
      totalTimeMs: this.results.reduce((a, b) => a + b.totalMs, 0),
    };
  }
}
