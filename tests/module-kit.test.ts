import { describe, it, expect } from 'vitest';
import { ModulePipeline, RateLimitModule, LoggingModule, ModuleBlockError } from '../src/module-kit.js';

describe('ModulePipeline', () => {
  it('passes allow when no modules block', () => {
    const pipe = new ModulePipeline('test');
    const result = pipe.process('test_tool', { foo: 'bar' });
    expect(result.action).toBe('allow');
    expect(result.reason).toBe('');
  });

  it('blocks when module returns block', () => {
    const pipe = new ModulePipeline('test');
    const blockingModule = {
      name: 'always-block',
      enabled: true,
      priority: 0,
      process: () => ({
        action: 'block' as const,
        reason: 'always blocks',
        context: {},
      }),
      stats: {},
    };
    pipe.add(blockingModule);

    const result = pipe.process('test', {});
    expect(result.action).toBe('block');
    expect(result.reason).toContain('always blocks');
  });

  it('respects priority order', () => {
    const pipe = new ModulePipeline('test');
    const order: number[] = [];

    pipe.add({
      name: 'm1', enabled: true, priority: 10, stats: {},
      process: () => { order.push(10); return { action: 'allow', reason: '', context: {} }; },
    });
    pipe.add({
      name: 'm2', enabled: true, priority: 1, stats: {},
      process: () => { order.push(1); return { action: 'allow', reason: '', context: {} }; },
    });

    pipe.process('test', {});
    expect(order).toEqual([1, 10]);
  });

  it('accumulates context across modules', () => {
    const pipe = new ModulePipeline('test');
    pipe.add({
      name: 'c1', enabled: true, priority: 1, stats: {},
      process: (_t, _a, ctx) => ({ action: 'allow', reason: '', context: { ...ctx, x: 1 } }),
    });
    pipe.add({
      name: 'c2', enabled: true, priority: 2, stats: {},
      process: (_t, _a, ctx) => ({ action: 'allow', reason: '', context: { ...ctx, y: 2 } }),
    });

    const result = pipe.process('test', {});
    expect(result.context).toEqual({ x: 1, y: 2 });
  });

  it('warn action adds to context.warnings', () => {
    const pipe = new ModulePipeline('test');
    pipe.add({
      name: 'warner', enabled: true, priority: 1, stats: {},
      process: () => ({ action: 'warn', reason: 'something risky', context: {} }),
    });

    const result = pipe.process('test', {});
    expect(result.action).toBe('allow');
    expect(result.context.warnings).toContain('something risky');
  });

  it('wrap throws ModuleBlockError on block', () => {
    const pipe = new ModulePipeline('test');
    pipe.add({
      name: 'blocker', enabled: true, priority: 1, stats: {},
      process: () => ({ action: 'block', reason: 'nope', context: {} }),
    });

    const wrapped = pipe.wrap(() => 'ok', 'test_fn');
    expect(() => wrapped()).toThrow(ModuleBlockError);
  });

  it('stats reports correctly', () => {
    const pipe = new ModulePipeline('test');
    pipe.add({
      name: 'blocker', enabled: true, priority: 1, stats: {},
      process: () => ({ action: 'block', reason: 'nope', context: {} }),
    });

    pipe.process('t1', {});
    const s = pipe.stats;
    expect(s.totalCalls).toBe(1);
    expect(s.blocked).toBe(1);
    expect(s.allowed).toBe(0);
  });
});

describe('RateLimitModule', () => {
  it('allows calls under limit', () => {
    const m = new RateLimitModule(10);
    const result = m.process('t', {}, {});
    expect(result.action).toBe('allow');
  });

  it('blocks calls exceeding limit', () => {
    const m = new RateLimitModule(2);
    m.process('t', {}, {});
    m.process('t', {}, {});
    const result = m.process('t', {}, {});
    expect(result.action).toBe('block');
  });

  it('allows calls in next window', async () => {
    const m = new RateLimitModule(1); // 1 per minute
    m.process('t', {}, {});
    // Clear old timestamp manually to simulate window passing
    (m as unknown as { callTimestamps: number[] }).callTimestamps = [];
    const result2 = m.process('t', {}, {});
    expect(result2.action).toBe('allow');
  });
});

describe('LoggingModule', () => {
  it('logs and allows', () => {
    const m = new LoggingModule();
    const result = m.process('test_tool', { key: 'val' }, {});
    expect(result.action).toBe('allow');
  });

  it('accumulates log entries', () => {
    const m = new LoggingModule();
    m.process('t1', {}, {});
    m.process('t2', {}, {});
    expect(m.stats.logSize).toBe(2);
  });
});