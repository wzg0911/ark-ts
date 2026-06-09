/**
 * ARK TypeScript SDK — Smoke Tests
 */
import { describe, it, expect } from 'vitest';
import {
  IdempotencyGuard,
  CircuitBreaker,
  CircuitOpenError,
  OutputValidator,
  Trace,
  ReliabilityScore,
  SchemaRegistry,
  detectFrameworks,
  autoInit,
  Achievements,
  Dashboard,
} from '../src/index.js';

describe('IdempotencyGuard', () => {
  it('should intercept duplicate calls', () => {
    const guard = new IdempotencyGuard();
    let calls = 0;
    const fn = guard.wrap('testTool', (x: number) => { calls++; return x * 2; });
    expect(fn(5)).toBe(10);
    expect(fn(5)).toBe(10); // intercepted
    expect(calls).toBe(1);
    expect(guard.stats.intercepts).toBe(1);
  });

  it('should allow different args', () => {
    const guard = new IdempotencyGuard();
    const fn = guard.wrap('echo', (msg: string) => msg);
    expect(fn('hello')).toBe('hello');
    expect(fn('world')).toBe('world');
    expect(guard.stats.passes).toBe(2);
  });
});

describe('CircuitBreaker', () => {
  it('should call fallback on failure', async () => {
    const cb = new CircuitBreaker('test', 1);
    let calls = 0;
    const result = await cb.call(
      () => { throw new Error('fail'); },
      () => 'safe',
    );
    expect(result).toBe('safe');
  });

  it('should open after threshold', () => {
    const cb = new CircuitBreaker('test', 2);
    for (let i = 0; i < 3; i++) {
      try { cb.callSync(() => { throw new Error('fail'); }); } catch {}
    }
    expect(cb.state).toBe('open');
  });
});

describe('OutputValidator', () => {
  it('should validate simple shapes', () => {
    const v = new OutputValidator();
    const r = v.validateShape({ name: 'Alice', age: 30 }, { name: 'string', age: 'number' });
    expect(r.valid).toBe(true);
  });

  it('should catch missing fields', () => {
    const v = new OutputValidator();
    const r = v.validateShape({ name: 'Bob' }, { name: 'string', email: 'string' });
    expect(r.valid).toBe(false);
  });
});

describe('Trace', () => {
  it('should track spans', () => {
    const t = new Trace('test');
    t.startSpan('A');
    t.endSpan();
    t.startSpan('B');
    t.endSpan('error on B', 'something went wrong');
    const s = t.summary();
    expect(s.totalSpans).toBe(3);
    expect(s.status).toBe('error');
  });
});

describe('ReliabilityScore', () => {
  it('should compute S+ for perfect runs', () => {
    const rs = new ReliabilityScore();
    for (let i = 0; i < 20; i++) rs.recordRun({ success: true, toolCalls: 5 });
    expect(rs.score).toBeGreaterThanOrEqual(95);
    expect(rs.grade).toContain('S');
  });

  it('should penalize intercepts and blocks', () => {
    const rs = new ReliabilityScore();
    rs.recordRun({ success: true, intercepts: 5, toolCalls: 10 });
    expect(rs.score).toBeLessThan(100);
  });

  it('should generate badge URL', () => {
    const rs = new ReliabilityScore();
    rs.recordRun({ success: true, toolCalls: 5 });
    const badge = rs.badgeUrl;
    expect(badge).toContain('shields.io');
    expect(badge).toContain('ARK_Score');
  });
});

describe('SchemaRegistry', () => {
  it('should have builtins', () => {
    const reg = new SchemaRegistry();
    expect(reg.available).toContain('stripe.charge');
    expect(reg.available).toContain('email.send');
    expect(reg.available.length).toBeGreaterThanOrEqual(6);
  });

  it('should validate stripe charge', () => {
    const reg = new SchemaRegistry();
    const r = reg.validate('stripe.charge', {
      amount: 2999,
      currency: 'usd',
      description: 'Test',
    });
    expect(r).not.toBeNull();
    expect(r!.valid).toBe(true);
  });

  it('should reject negative amount', () => {
    const reg = new SchemaRegistry();
    const r = reg.validate('stripe.charge', { amount: -1, currency: 'usd' });
    expect(r).not.toBeNull();
    expect(r!.valid).toBe(false);
  });
});

describe('autoInit', () => {
  it('should detect and init', () => {
    const cfg = autoInit();
    expect(cfg.guard).toBeInstanceOf(IdempotencyGuard);
    expect(cfg.breaker).toBeInstanceOf(CircuitBreaker);
    expect(cfg.score).toBeInstanceOf(ReliabilityScore);
    expect(cfg.registry).toBeInstanceOf(SchemaRegistry);
    expect(cfg.mode).toMatch(/standalone|integrated/);
  });
});

describe('Achievements', () => {
  it('should unlock guardian bronze at 10 intercepts', () => {
    const a = new Achievements();
    expect(a.update('guardian_bronze', 5)).toBe(false);
    expect(a.update('guardian_bronze', 10)).toBe(true);
    expect(a.unlocked.some((x) => x.id === 'guardian_bronze')).toBe(true);
  });
});

describe('Dashboard', () => {
  it('should render trust monitor', () => {
    const cfg = autoInit();
    const dash = new Dashboard(cfg.guard, cfg.breaker, cfg.validator, cfg.score, new Achievements());
    const monitor = dash.trustMonitor;
    expect(monitor.guardSaveRate).toBeDefined();
    expect(monitor.breakerState).toBeDefined();
    expect(monitor.score).toBeGreaterThanOrEqual(0);
    const rendered = dash.render();
    expect(rendered).toContain('ARK Trust Dashboard');
  });
});
