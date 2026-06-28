import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StatefulBreaker } from '../src/stateful-breaker.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('StatefulBreaker', () => {
  const tmpDir = path.join(os.tmpdir(), 'ark-test-breaker');
  let persistPath: string;

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    persistPath = path.join(tmpDir, 'test-breaker.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts closed', () => {
    const cb = new StatefulBreaker('test', 3, 30, 2, persistPath, false);
    expect(cb.stats.state).toBe('closed');
  });

  it('opens after threshold failures', async () => {
    const cb = new StatefulBreaker('test', 3, 30, 2, persistPath, false);
    const fn = async () => { throw new Error('fail'); };

    await expect(cb.call(fn)).rejects.toThrow('fail');
    await expect(cb.call(fn)).rejects.toThrow('fail');
    await expect(cb.call(fn)).rejects.toThrow('fail');

    expect(cb.stats.state).toBe('open');
  });

  it('calls fallback when open', async () => {
    const cb = new StatefulBreaker('test', 1, 60, 2, persistPath, false);
    const fn = async () => { throw new Error('fail'); };
    const fb = async () => 'fallback';

    await expect(cb.call(fn)).rejects.toThrow('fail');
    expect(cb.stats.state).toBe('open');

    const result = await cb.call(fn, fb);
    expect(result).toBe('fallback');
  });

  it('recovers to half-open after timeout', async () => {
    // Use threshold=3 so one half-open failure doesn't re-open
    const cb = new StatefulBreaker('test', 3, 0.1, 2, persistPath, false);
    const fn = async () => { throw new Error('fail'); };

    // 3 failures to open
    await expect(cb.call(fn)).rejects.toThrow('fail');
    await expect(cb.call(fn)).rejects.toThrow('fail');
    await expect(cb.call(fn)).rejects.toThrow('fail');

    await new Promise((r) => setTimeout(r, 200));

    // After cooldown, call transitions to half-open
    const okFn = async () => 'success';
    const result = await cb.call(okFn);
    expect(result).toBe('success');
    // Successful half-open call resets to closed
    expect(cb.stats.state).toBe('closed');
  });

  it('persists and restores state', async () => {
    const cb1 = new StatefulBreaker('test', 1, 60, 2, persistPath, true);
    await expect(cb1.call(async () => { throw new Error('fail'); })).rejects.toThrow();
    expect(cb1.stats.state).toBe('open');

    const cb2 = new StatefulBreaker('test', 1, 60, 2, persistPath, true);
    expect(cb2.stats.state).toBe('open');
  });

  it('reset clears state and file', async () => {
    const cb = new StatefulBreaker('test', 1, 60, 2, persistPath, true);
    await expect(cb.call(async () => { throw new Error('fail'); })).rejects.toThrow();
    expect(cb.stats.state).toBe('open');

    cb.reset();
    expect(cb.stats.state).toBe('closed');
    expect(cb.stats.failureCount).toBe(0);
    expect(cb.stats.totalCalls).toBe(0);
  });

  it('inspectPersistence returns file info', async () => {
    const cb = new StatefulBreaker('test', 3, 30, 2, persistPath, true);
    const info = cb.inspectPersistence();
    expect(info.persistPath).toBe(persistPath);
    expect(info.fileExists).toBe(true);
    expect(info.currentState).toBe('closed');
  });

  it('tracks reliability', async () => {
    const cb = new StatefulBreaker('test', 3, 30, 2, persistPath, false);
    await cb.call(async () => 'ok');
    await cb.call(async () => 'ok');
    expect(cb.stats.reliability).toBe('100.0%');

    await expect(cb.call(async () => { throw new Error('x'); })).rejects.toThrow();
    expect(cb.stats.reliability).toBe('66.7%');
  });
});
