import { describe, it, expect } from 'vitest';
import {
  truncateError,
  errorToLLMContext,
  shouldRetry,
  retryDelay,
  ErrorContext,
  withRetry,
  NON_RETRYABLE_TYPES,
} from '../src/errors.js';

// ━━━━━━━━━━ 1. truncateError ━━━━━━━━━━

describe('truncateError', () => {
  it('basic truncation', () => {
    const err = new Error('hello world');
    const t = truncateError(err);
    expect(t.type).toBe('Error');
    expect(t.message).toBe('hello world');
    expect(t.rawHash).toHaveLength(8);
  });

  it('long message truncated', () => {
    const long = 'x'.repeat(1000);
    const err = new Error(long);
    const t = truncateError(err, 100);
    expect(t.message.length).toBeLessThanOrEqual(103);
    expect(t.message.endsWith('...')).toBe(true);
  });

  it('preserves stack tail', () => {
    function deep() {
      throw new Error('nested');
    }
    function mid() {
      deep();
    }
    function outer() {
      mid();
    }
    try {
      outer();
    } catch (e) {
      const t = truncateError(e as Error, 500, 3);
      expect(t.type).toBe('Error');
      expect(t.stackTail.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ━━━━━━━━━━ 2. errorToLLMContext ━━━━━━━━━━

describe('errorToLLMContext', () => {
  it('first attempt no hint', () => {
    const text = errorToLLMContext(new Error('bad input'), 'test_tool', 1);
    expect(text).toContain('[ERROR]');
    expect(text).toContain('test_tool');
    expect(text).toContain('attempt 1');
    expect(text).not.toContain('Hint:');
  });

  it('repeat attempt gives hint', () => {
    const text = errorToLLMContext(new Error('timeout'), 'fetch', 2);
    expect(text).toContain('Hint:');
    expect(text).toContain('Different');
  });

  it('third attempt suggests escalation', () => {
    const text = errorToLLMContext(new Error('boom'), 'flaky', 3);
    expect(text).toContain('Escalate');
  });

  it('previous attempts shown', () => {
    const text = errorToLLMContext(
      new Error('v3'),
      'tool',
      3,
      [
        { type: 'Error', message: 'v1' },
        { type: 'Error', message: 'v2' },
      ]
    );
    expect(text).toContain('Previous attempts');
  });
});

// ━━━━━━━━━━ 3. shouldRetry ━━━━━━━━━━

describe('shouldRetry', () => {
  it('below limit can retry', () => {
    expect(shouldRetry(new Error('x'), 1, 3)).toBe(true);
    expect(shouldRetry(new Error('x'), 2, 3)).toBe(true);
  });

  it('at limit cannot retry', () => {
    expect(shouldRetry(new Error('x'), 3, 3)).toBe(false);
    expect(shouldRetry(new Error('x'), 5, 3)).toBe(false);
  });

  it('non-retryable types', () => {
    for (const typeName of NON_RETRYABLE_TYPES) {
      class TestError extends Error {
        constructor() {
          super('test');
          this.name = typeName;
        }
      }
      const err = new TestError();
      expect(shouldRetry(err, 1, 5)).toBe(false);
    }
  });
});

// ━━━━━━━━━━ 4. retryDelay ━━━━━━━━━━

describe('retryDelay', () => {
  it('exponential growth', () => {
    expect(retryDelay(1, 1.0, 100, 2.0)).toBe(1.0);
    expect(retryDelay(2, 1.0, 100, 2.0)).toBe(2.0);
    expect(retryDelay(3, 1.0, 100, 2.0)).toBe(4.0);
  });

  it('capped at max', () => {
    expect(retryDelay(10, 1.0, 30.0, 2.0)).toBe(30.0);
  });
});

// ━━━━━━━━━━ 5. ErrorContext ━━━━━━━━━━

describe('ErrorContext', () => {
  it('record and count', () => {
    const ctx = new ErrorContext('send_email');
    ctx.recordFailure(new Error('v1'), 1);
    expect(ctx.failureCount).toBe(1);
    expect(ctx.lastError).toBeDefined();
  });

  it('escalation after max attempts', () => {
    const ctx = new ErrorContext('api_call', 3);
    for (let i = 1; i <= 3; i++) {
      ctx.recordFailure(new Error(`fail ${i}`), i);
    }
    expect(ctx.shouldEscalate).toBe(true);
  });

  it('toDict serializable', () => {
    const ctx = new ErrorContext('t', 3);
    ctx.recordFailure(new Error('x'), 1);
    const d = ctx.toDict();
    expect(d.tool_name).toBe('t');
    expect(d.failure_count).toBe(1);
    expect(Array.isArray(d.records)).toBe(true);
  });

  it('toLLMContext renders', () => {
    const ctx = new ErrorContext('t', 3);
    ctx.recordFailure(new Error('x'), 1);
    const text = ctx.toLLMContext();
    expect(text).toContain('t');
    expect(text).toContain('attempt 1');
  });
});

// ━━━━━━━━━━ 6. withRetry ━━━━━━━━━━

describe('withRetry', () => {
  it('success no retry', async () => {
    let count = 0;
    const fn = withRetry(
      async () => {
        count++;
        return 'ok';
      },
      { toolName: 'test', maxAttempts: 3 }
    );
    const result = await fn();
    expect(result).toBe('ok');
    expect(count).toBe(1);
  });

  it('fallback used on non-retryable', async () => {
    class PermissionErr extends Error {
      constructor() {
        super('denied');
        this.name = 'PermissionError';
      }
    }
    const fn = withRetry(
      async () => {
        throw new PermissionErr();
      },
      { toolName: 'auth', maxAttempts: 5, fallback: () => 'default' }
    );
    const result = await fn();
    expect(result).toBe('default');
  });

  it('errorContext exposed', async () => {
    const fn = withRetry(async () => 1, { toolName: 't' });
    expect(fn.errorContext).toBeDefined();
    expect(fn.errorContext.toolName).toBe('t');
  });
});

// ━━━━━━━━━━ 7. F9 集成 ━━━━━━━━━━

describe('F9 Integration', () => {
  it('full 12-factor recipe', () => {
    // ✅ 截断
    const err = truncateError(new Error('x'.repeat(10000)), 200);
    expect(err.message.length).toBeLessThan(250);

    // ✅ 重试上限
    expect(shouldRetry(new Error('x'), 3, 3)).toBe(false);

    // ✅ 升级路径
    const ctx = new ErrorContext('t', 3);
    for (let i = 1; i <= 3; i++) {
      ctx.recordFailure(new Error(`f${i}`), i);
    }
    expect(ctx.shouldEscalate).toBe(true);
    expect(ctx.lastError?.type).toBe('Error');
  });
});
