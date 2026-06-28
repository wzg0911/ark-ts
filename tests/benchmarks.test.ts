import { describe, it, expect } from 'vitest';
import { Benchmarks } from '../src/benchmarks.js';

describe('Benchmarks', () => {
  it('runs each benchmark with correct number of iterations', () => {
    const b = new Benchmarks(100);
    b.runAll();
    expect(b.results.length).toBe(6);
    for (const r of b.results) {
      expect(r.iterations).toBe(100);
      expect(r.avgMs).toBeGreaterThan(0);
      expect(r.throughputOps).toBeGreaterThan(0);
    }
  });

  it('toJSON produces valid JSON', () => {
    const b = new Benchmarks(50);
    b.runAll();
    const json = b.toJSON();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(6);
  });

  it('summary returns correct structure', () => {
    const b = new Benchmarks(50);
    const s = b.summary();
    expect(s.version).toBeDefined();
    expect(s.iterations).toBe(50);
    expect(Array.isArray(s.results)).toBe(true);
    expect(s.fastest).toBeDefined();
    expect(s.slowest).toBeDefined();
  });

  it('individual benchmarks produce metrics', () => {
    const b = new Benchmarks(100);
    const r1 = b.benchIdempotencyKeyGen();
    expect(r1.name).toContain('Idempotency');
    expect(r1.avgMs).toBeGreaterThan(0);

    const r2 = b.benchCircuitBreakerClosed();
    expect(r2.name).toContain('CircuitBreaker');
    expect(r2.avgMs).toBeGreaterThan(0);
  });
});